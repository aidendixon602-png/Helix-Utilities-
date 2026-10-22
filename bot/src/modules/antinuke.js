const { AuditLogEvent, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuild } = require('../utils/db');
const log = require('../utils/logger');

const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
];
const hasDangerous = (perms) => DANGEROUS.some((p) => perms.has(p));

// audit action -> limit key in settings.antinuke.limits
const COUNTED = {
  [AuditLogEvent.MemberBanAdd]: 'ban',
  [AuditLogEvent.MemberKick]: 'kick',
  [AuditLogEvent.ChannelCreate]: 'channelCreate',
  [AuditLogEvent.ChannelDelete]: 'channelDelete',
  [AuditLogEvent.RoleCreate]: 'roleCreate',
  [AuditLogEvent.RoleDelete]: 'roleDelete',
  [AuditLogEvent.WebhookCreate]: 'webhookCreate',
  [AuditLogEvent.EmojiDelete]: 'emojiDelete',
};

const counters = new Map(); // `${guild}:${user}:${key}` -> timestamps[]
const recentlyPunished = new Set();

function isTrusted(guild, settings, userId) {
  return (
    userId === guild.ownerId ||
    userId === guild.client.user.id ||
    settings.antinuke.whitelist.includes(userId)
  );
}

function bump(guildId, userId, key, windowMs) {
  const k = `${guildId}:${userId}:${key}`;
  const now = Date.now();
  const arr = (counters.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  counters.set(k, arr);
  return arr.length;
}

async function alert(guild, settings, title, description) {
  const id = settings.antinuke.logChannel || settings.logs?.mod;
  const ch = id && guild.channels.cache.get(id);
  const e = new EmbedBuilder().setColor(0xe74c3c).setTitle(`🛡️ Antinuke • ${title}`).setDescription(description).setTimestamp();
  if (ch?.isTextBased()) await ch.send({ embeds: [e] }).catch(() => null);
  const owner = await guild.fetchOwner().catch(() => null);
  owner?.send({ embeds: [e.setFooter({ text: guild.name })] }).catch(() => null);
}

/** Punish the executor per settings. Bots are always banned. */
async function punish(guild, settings, executorId, reason) {
  const key = `${guild.id}:${executorId}`;
  if (recentlyPunished.has(key)) return;
  recentlyPunished.add(key);
  setTimeout(() => recentlyPunished.delete(key), 30_000);

  const member = await guild.members.fetch(executorId).catch(() => null);
  const how = member?.user.bot ? 'ban' : settings.antinuke.punishment;
  const auditReason = `[Antinuke] ${reason}`;
  let result = 'failed (missing permissions or role too high)';
  try {
    if (how === 'ban') {
      await guild.members.ban(executorId, { reason: auditReason });
      result = 'banned';
    } else if (how === 'kick' && member) {
      await member.kick(auditReason);
      result = 'kicked';
    } else if (member) {
      const removable = member.roles.cache.filter((r) => r.editable && r.id !== guild.id);
      await member.roles.remove(removable, auditReason);
      result = `stripped of ${removable.size} roles`;
    }
  } catch (e) {
    log.warn(`Antinuke punish failed in ${guild.id}:`, e.message);
  }

  if (settings.antinuke.autoLockdown) {
    const { startLockdown } = require('./lockdown');
    await startLockdown(guild, 'Automatic lockdown triggered by antinuke').catch(() => null);
  }
  await alert(guild, settings, 'Threat neutralised', `<@${executorId}> (\`${executorId}\`) was **${result}**.\n**Reason:** ${reason}`);
}

/** Best-effort revert of the thing that was just done. */
async function revert(guild, entry) {
  const r = '[Antinuke] revert';
  try {
    switch (entry.action) {
      case AuditLogEvent.ChannelCreate:
        await guild.channels.cache.get(entry.targetId)?.delete(r);
        break;
      case AuditLogEvent.RoleCreate:
        await guild.roles.cache.get(entry.targetId)?.delete(r);
        break;
      case AuditLogEvent.WebhookCreate: {
        const hooks = await guild.fetchWebhooks().catch(() => null);
        await hooks?.get(entry.targetId)?.delete(r);
        break;
      }
      case AuditLogEvent.MemberBanAdd:
        await guild.members.unban(entry.targetId, r);
        break;
      default:
        break;
    }
  } catch {
    /* ignore */
  }
}

async function handleAuditEntry(entry, guild) {
  const settings = await getGuild(guild.id);
  if (!settings.antinuke.enabled) return;
  const executorId = entry.executorId;
  if (!executorId || isTrusted(guild, settings, executorId)) return;
  const an = settings.antinuke;

  // Unauthorised bot added → ban the bot immediately and punish whoever added it
  if (entry.action === AuditLogEvent.BotAdd && an.antiBotAdd) {
    await guild.members.ban(entry.targetId, { reason: '[Antinuke] Unauthorised bot add' }).catch(() => null);
    return punish(guild, settings, executorId, `Added a bot (<@${entry.targetId}>) without being whitelisted`);
  }

  // Prune is always a single, destructive action
  if (entry.action === AuditLogEvent.MemberPrune && an.antiPrune) {
    return punish(guild, settings, executorId, `Pruned ${entry.extra?.removed ?? '?'} members`);
  }

  // Someone granted dangerous roles to a member
  if (entry.action === AuditLogEvent.MemberRoleUpdate && an.antiMemberUpdate) {
    const added = entry.changes.find((c) => c.key === '$add')?.new || [];
    const dangerous = added.map((r) => guild.roles.cache.get(r.id)).filter((r) => r && hasDangerous(r.permissions));
    if (dangerous.length) {
      const target = await guild.members.fetch(entry.targetId).catch(() => null);
      await target?.roles.remove(dangerous, '[Antinuke] Reverting dangerous role grant').catch(() => null);
      return punish(guild, settings, executorId, `Granted dangerous role(s) ${dangerous.map((r) => r.name).join(', ')} to <@${entry.targetId}>`);
    }
    return;
  }

  // A role was edited to include dangerous permissions
  if (entry.action === AuditLogEvent.RoleUpdate && an.antiMemberUpdate) {
    const permChange = entry.changes.find((c) => c.key === 'permissions');
    if (permChange) {
      const { PermissionsBitField } = require('discord.js');
      const before = new PermissionsBitField(BigInt(permChange.old || 0));
      const after = new PermissionsBitField(BigInt(permChange.new || 0));
      if (hasDangerous(after) && !hasDangerous(before)) {
        await guild.roles.cache.get(entry.targetId)?.setPermissions(before, '[Antinuke] Reverting permission escalation').catch(() => null);
        return punish(guild, settings, executorId, 'Gave a role dangerous permissions');
      }
    }
    return;
  }

  // Vanity URL / server name tampering
  if (entry.action === AuditLogEvent.GuildUpdate && an.antiGuildUpdate) {
    const vanity = entry.changes.find((c) => c.key === 'vanity_url_code');
    if (vanity) return punish(guild, settings, executorId, `Changed the vanity URL (${vanity.old} → ${vanity.new})`);
    return;
  }

  // Webhook updates pointing to a new channel are a common raid vector too
  const key = COUNTED[entry.action];
  if (!key) return;
  const count = bump(guild.id, executorId, key, an.windowSeconds * 1000);
  if (key === 'webhookCreate' || key === 'channelCreate' || key === 'roleCreate') {
    if (count >= an.limits[key]) await revert(guild, entry);
  }
  if (count >= an.limits[key]) {
    await punish(guild, settings, executorId, `Exceeded ${key} limit (${count}/${an.limits[key]} in ${an.windowSeconds}s)`);
  }
}

module.exports = { handleAuditEntry, isTrusted };

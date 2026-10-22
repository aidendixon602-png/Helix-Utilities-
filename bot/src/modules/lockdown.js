const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild } = require('../utils/db');

const LOCKABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice, ChannelType.GuildStageVoice];

/** Deny @everyone SendMessages/Connect on every channel, remembering the previous state. */
async function startLockdown(guild, reason = 'Emergency lockdown') {
  const settings = await getGuild(guild.id);
  if (settings.lockdown.active) return { already: true, count: 0 };
  const everyone = guild.roles.everyone;
  const snapshot = {};
  let count = 0;
  for (const ch of guild.channels.cache.values()) {
    if (!LOCKABLE.includes(ch.type) || !ch.manageable) continue;
    const ow = ch.permissionOverwrites.cache.get(everyone.id);
    const isVoice = ch.isVoiceBased();
    const flag = isVoice ? PermissionFlagsBits.Connect : PermissionFlagsBits.SendMessages;
    snapshot[ch.id] = ow?.allow.has(flag) ? true : ow?.deny.has(flag) ? false : null;
    try {
      await ch.permissionOverwrites.edit(everyone, isVoice ? { Connect: false } : { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false }, { reason });
      count++;
    } catch {
      /* skip */
    }
  }
  await updateGuild(guild.id, { $set: { 'lockdown.active': true, 'lockdown.snapshot': snapshot } });
  const notice = new EmbedBuilder().setColor(0xe74c3c).setTitle('🔒 Server lockdown').setDescription(reason).setTimestamp();
  const sys = guild.systemChannel;
  if (sys) sys.send({ embeds: [notice] }).catch(() => null);
  return { already: false, count };
}

async function endLockdown(guild, reason = 'Lockdown lifted') {
  const settings = await getGuild(guild.id);
  if (!settings.lockdown.active) return { already: true, count: 0 };
  const everyone = guild.roles.everyone;
  let count = 0;
  for (const [id, prev] of Object.entries(settings.lockdown.snapshot || {})) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;
    const isVoice = ch.isVoiceBased();
    const value = prev === null || prev === undefined ? null : prev;
    try {
      await ch.permissionOverwrites.edit(
        everyone,
        isVoice ? { Connect: value } : { SendMessages: value, SendMessagesInThreads: value === false ? false : null, CreatePublicThreads: value === false ? false : null },
        { reason }
      );
      count++;
    } catch {
      /* skip */
    }
  }
  await updateGuild(guild.id, { $set: { 'lockdown.active': false, 'lockdown.snapshot': {} } });
  guild.systemChannel?.send({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🔓 Lockdown lifted').setDescription(reason).setTimestamp()] }).catch(() => null);
  return { already: false, count };
}

module.exports = { startLockdown, endLockdown };

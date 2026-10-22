const { EmbedBuilder, ActivityType } = require('discord.js');
const { getGuild, getMember } = require('../utils/db');
const { template } = require('../utils/helpers');
const invites = require('../modules/invites');
const jtc = require('../modules/jtc');
const giveaways = require('../modules/giveaways');
const birthdays = require('../modules/birthdays');
const log = require('../utils/logger');

function emojiKey(reaction) {
  return reaction.emoji.id || reaction.emoji.name;
}

async function reactionRole(reaction, user, add) {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const guild = reaction.message.guild;
  if (!guild) return;
  const s = await getGuild(guild.id);
  const rr = s.reactionRoles.find((r) => r.messageId === reaction.message.id && r.emoji === emojiKey(reaction));
  if (!rr) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  if (add) await member.roles.add(rr.roleId, 'Reaction role').catch(() => null);
  else await member.roles.remove(rr.roleId, 'Reaction role').catch(() => null);
}

module.exports = [
  {
    name: 'clientReady',
    once: true,
    async execute(client) {
      for (const g of client.guilds.cache.values()) await invites.cacheGuild(g).catch(() => null);
      giveaways.startScheduler(client);
      birthdays.startScheduler(client);
      jtc.cleanup(client).catch((e) => log.warn('JTC cleanup failed', e.message));
    },
  },
  { name: 'guildCreate', execute: (guild) => invites.cacheGuild(guild) },
  { name: 'inviteCreate', execute: (invite) => invite.guild && invites.cacheGuild(invite.guild) },
  { name: 'inviteDelete', execute: (invite) => invite.guild && invites.cacheGuild(invite.guild) },
  {
    name: 'guildMemberAdd',
    async execute(member) {
      const s = await getGuild(member.guild.id);
      // autorole
      const roles = (member.user.bot ? s.autorole.bots : s.autorole.humans).filter((id) => member.guild.roles.cache.get(id)?.editable);
      if (roles.length) await member.roles.add(roles, 'Autorole').catch(() => null);
      // welcome
      if (s.welcome.channel) {
        const ch = member.guild.channels.cache.get(s.welcome.channel);
        ch?.send({ content: template(s.welcome.message, { user: `${member}`, username: member.user.username, server: member.guild.name, count: member.guild.memberCount }) }).catch(() => null);
      }
      // restore jail if they tried to rejoin to escape
      if (s.moderation.jailRole) {
        const doc = await getMember(member.guild.id, member.id);
        if (doc.jailedRoles?.length) await member.roles.add(s.moderation.jailRole, 'Re-jailed after rejoin').catch(() => null);
      }
      if (!member.user.bot) await invites.onJoin(member).catch(() => null);
    },
  },
  { name: 'guildMemberRemove', execute: (member) => invites.onLeave(member).catch(() => null) },
  { name: 'messageReactionAdd', execute: (r, u) => reactionRole(r, u, true) },
  { name: 'messageReactionRemove', execute: (r, u) => reactionRole(r, u, false) },
  { name: 'voiceStateUpdate', execute: (b, a) => jtc.onVoiceUpdate(b, a) },
  {
    // Vanity role: give a role when someone puts your server tag/link in their custom status
    name: 'presenceUpdate',
    async execute(before, after) {
      if (!after?.guild || !after.member || after.user?.bot) return;
      const s = await getGuild(after.guild.id);
      if (!s.vanity.text || !s.vanity.role) return;
      const status = after.activities.find((a) => a.type === ActivityType.Custom)?.state || '';
      const has = status.toLowerCase().includes(s.vanity.text.toLowerCase());
      const role = after.guild.roles.cache.get(s.vanity.role);
      if (!role?.editable) return;
      const member = after.member;
      if (has && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Vanity in status').catch(() => null);
        const ch = s.vanity.channel && after.guild.channels.cache.get(s.vanity.channel);
        ch?.send({ embeds: [new EmbedBuilder().setColor(0xf47fff).setDescription(`💖 Thanks ${member} for repping \`${s.vanity.text}\`! You got ${role}.`)] }).catch(() => null);
      } else if (!has && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Vanity removed from status').catch(() => null);
      }
    },
  },
  {
    // Booster perks: thank-you message, and remove personal booster role when the boost ends
    name: 'guildMemberUpdate',
    async execute(before, after) {
      if (before.partial) return;
      const started = !before.premiumSince && after.premiumSince;
      const ended = before.premiumSince && !after.premiumSince;
      if (!started && !ended) return;
      const s = await getGuild(after.guild.id);
      if (started && s.booster.channel) {
        const ch = after.guild.channels.cache.get(s.booster.channel);
        ch?.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xf47fff)
              .setTitle('💎 New boost!')
              .setThumbnail(after.user.displayAvatarURL())
              .setDescription(template(s.booster.message, { user: `${after}`, username: after.user.username, server: after.guild.name, boosts: after.guild.premiumSubscriptionCount }) + (s.booster.customRoles ? '\n\nUse `/booster role` to create your own custom role!' : '')),
          ],
        }).catch(() => null);
      }
      if (ended) {
        const doc = await getMember(after.guild.id, after.id);
        if (doc.boosterRole) {
          await after.guild.roles.cache.get(doc.boosterRole)?.delete('Boost ended').catch(() => null);
          doc.boosterRole = null;
          await doc.save();
        }
      }
    },
  },
];

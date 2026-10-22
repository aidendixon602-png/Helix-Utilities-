const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../modules/logging');
const { truncate } = require('../utils/helpers');

const user = (u) => (u ? `${u} (\`${u.id}\`)` : 'Unknown');

module.exports = [
  {
    name: 'messageDelete',
    async execute(message) {
      if (!message.guild || message.author?.bot || message.partial) return;
      const e = new EmbedBuilder()
        .setTitle('🗑️ Message deleted')
        .setDescription(`**Author:** ${user(message.author)}\n**Channel:** ${message.channel}`)
        .addFields({ name: 'Content', value: truncate(message.content || '*no text*', 1024) });
      if (message.attachments.size) e.addFields({ name: 'Attachments', value: message.attachments.map((a) => a.name).join(', ').slice(0, 1024) });
      sendLog(message.guild, 'message', e);
    },
  },
  {
    name: 'messageDeleteBulk',
    async execute(messages, channel) {
      sendLog(channel.guild, 'message', new EmbedBuilder().setTitle('🗑️ Bulk delete').setDescription(`**${messages.size}** messages deleted in ${channel}`));
    },
  },
  {
    name: 'messageUpdate',
    async execute(before, after) {
      if (!after.guild || after.author?.bot || before.partial || before.content === after.content) return;
      sendLog(
        after.guild,
        'message',
        new EmbedBuilder()
          .setTitle('✏️ Message edited')
          .setDescription(`**Author:** ${user(after.author)}\n**Channel:** ${after.channel} • [Jump](${after.url})`)
          .addFields({ name: 'Before', value: truncate(before.content || '*empty*', 1024) }, { name: 'After', value: truncate(after.content || '*empty*', 1024) })
      );
    },
  },
  {
    name: 'guildMemberAdd',
    async execute(member) {
      const age = Math.floor(member.user.createdTimestamp / 1000);
      sendLog(
        member.guild,
        'member',
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('📥 Member joined')
          .setThumbnail(member.user.displayAvatarURL())
          .setDescription(`${user(member.user)}\n**Account created:** <t:${age}:R>${Date.now() - member.user.createdTimestamp < 7 * 86400000 ? ' ⚠️ new account' : ''}\n**Members:** ${member.guild.memberCount}`)
      );
    },
  },
  {
    name: 'guildMemberRemove',
    async execute(member) {
      sendLog(
        member.guild,
        'member',
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('📤 Member left')
          .setThumbnail(member.user.displayAvatarURL())
          .setDescription(`${user(member.user)}\n**Roles:** ${member.roles?.cache.filter((r) => r.id !== member.guild.id).map((r) => r.toString()).join(' ') || 'none'}`)
      );
    },
  },
  {
    name: 'guildMemberUpdate',
    async execute(before, after) {
      if (before.partial) return;
      const changes = [];
      if (before.nickname !== after.nickname) changes.push(`**Nickname:** ${before.nickname || '*none*'} → ${after.nickname || '*none*'}`);
      const added = after.roles.cache.filter((r) => !before.roles.cache.has(r.id));
      const removed = before.roles.cache.filter((r) => !after.roles.cache.has(r.id));
      if (added.size) changes.push(`**Roles added:** ${added.map((r) => r.toString()).join(' ')}`);
      if (removed.size) changes.push(`**Roles removed:** ${removed.map((r) => r.toString()).join(' ')}`);
      if (before.communicationDisabledUntilTimestamp !== after.communicationDisabledUntilTimestamp)
        changes.push(after.communicationDisabledUntilTimestamp ? `**Timed out until** <t:${Math.floor(after.communicationDisabledUntilTimestamp / 1000)}:f>` : '**Timeout removed**');
      if (!changes.length) return;
      sendLog(after.guild, 'member', new EmbedBuilder().setTitle('👤 Member updated').setDescription(`${user(after.user)}\n${changes.join('\n')}`));
    },
  },
  {
    name: 'guildBanAdd',
    async execute(ban) {
      const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
      const entry = logs?.entries.first();
      sendLog(ban.guild, 'member', new EmbedBuilder().setColor(0xc0392b).setTitle('🔨 Member banned').setDescription(`${user(ban.user)}\n**By:** ${entry?.executor ?? 'Unknown'}\n**Reason:** ${entry?.reason || ban.reason || 'none'}`));
    },
  },
  {
    name: 'guildBanRemove',
    async execute(ban) {
      sendLog(ban.guild, 'member', new EmbedBuilder().setTitle('🕊️ Member unbanned').setDescription(user(ban.user)));
    },
  },
  ...['channelCreate', 'channelDelete'].map((name) => ({
    name,
    async execute(channel) {
      if (!channel.guild) return;
      sendLog(channel.guild, 'server', new EmbedBuilder().setTitle(name === 'channelCreate' ? '➕ Channel created' : '➖ Channel deleted').setDescription(`**${channel.name}** (\`${channel.id}\`)`));
    },
  })),
  {
    name: 'channelUpdate',
    async execute(before, after) {
      if (!after.guild) return;
      const changes = [];
      if (before.name !== after.name) changes.push(`**Name:** ${before.name} → ${after.name}`);
      if (before.topic !== after.topic) changes.push(`**Topic changed**`);
      if (before.rateLimitPerUser !== after.rateLimitPerUser) changes.push(`**Slowmode:** ${before.rateLimitPerUser}s → ${after.rateLimitPerUser}s`);
      if (!changes.length) return;
      sendLog(after.guild, 'server', new EmbedBuilder().setTitle('🔧 Channel updated').setDescription(`${after}\n${changes.join('\n')}`));
    },
  },
  ...['roleCreate', 'roleDelete'].map((name) => ({
    name,
    async execute(role) {
      sendLog(role.guild, 'server', new EmbedBuilder().setTitle(name === 'roleCreate' ? '➕ Role created' : '➖ Role deleted').setDescription(`**${role.name}** (\`${role.id}\`)`));
    },
  })),
  {
    name: 'roleUpdate',
    async execute(before, after) {
      const changes = [];
      if (before.name !== after.name) changes.push(`**Name:** ${before.name} → ${after.name}`);
      if (before.hexColor !== after.hexColor) changes.push(`**Color:** ${before.hexColor} → ${after.hexColor}`);
      if (before.permissions.bitfield !== after.permissions.bitfield) {
        const added = after.permissions.toArray().filter((p) => !before.permissions.has(p));
        const removed = before.permissions.toArray().filter((p) => !after.permissions.has(p));
        if (added.length) changes.push(`**Perms added:** ${added.join(', ')}`);
        if (removed.length) changes.push(`**Perms removed:** ${removed.join(', ')}`);
      }
      if (!changes.length) return;
      sendLog(after.guild, 'server', new EmbedBuilder().setTitle('🔧 Role updated').setDescription(`${after}\n${changes.join('\n')}`.slice(0, 4000)));
    },
  },
  {
    name: 'voiceStateUpdate',
    async execute(before, after) {
      const member = after.member || before.member;
      if (!member || member.user.bot) return;
      let text;
      if (!before.channelId && after.channelId) text = `🔊 ${member} joined ${after.channel}`;
      else if (before.channelId && !after.channelId) text = `🔇 ${member} left ${before.channel}`;
      else if (before.channelId !== after.channelId) text = `🔀 ${member} moved ${before.channel} → ${after.channel}`;
      if (text) sendLog(after.guild, 'voice', new EmbedBuilder().setDescription(text));
    },
  },
];

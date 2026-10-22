const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { getGuild, updateGuild, getMember } = require('../utils/db');
const { success, fail, embed, checkHierarchy, parseDuration, formatDuration } = require('../utils/helpers');
const { modLog } = require('../modules/logging');

const P = PermissionFlagsBits;

async function dm(guild, user, action, reason) {
  const s = await getGuild(guild.id);
  if (!s.moderation.dmOnAction) return;
  await user
    .send({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription(`You were **${action}** in **${guild.name}**.\n**Reason:** ${reason}`)] })
    .catch(() => null);
}

const reasonOpt = (o) => o.setName('reason').setDescription('Reason').setMaxLength(400);
const userOpt = (o) => o.setName('user').setDescription('Member').setRequired(true);

async function targetMember(i) {
  const m = i.options.getMember('user');
  if (!m) {
    await fail(i, 'That user is not in this server.');
    return null;
  }
  const err = checkHierarchy(i.guild, i.member, m);
  if (err) {
    await fail(i, err);
    return null;
  }
  return m;
}

const ban = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a user (works for users not in the server too)')
    .setDefaultMemberPermissions(P.BanMembers)
    .addUserOption(userOpt).addStringOption(reasonOpt)
    .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete their messages from the last N days').setMinValue(0).setMaxValue(7)),
  async execute(i) {
    const user = i.options.getUser('user');
    const reason = i.options.getString('reason') || 'No reason provided';
    const member = i.options.getMember('user');
    if (member) {
      const err = checkHierarchy(i.guild, i.member, member);
      if (err) return fail(i, err);
      await dm(i.guild, user, 'banned', reason);
    }
    await i.guild.members.ban(user.id, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: (i.options.getInteger('delete_days') || 0) * 86400 });
    modLog(i.guild, { action: 'Ban', target: user, moderator: i.user, reason });
    return i.reply({ embeds: [success(`**${user.tag}** was banned. | ${reason}`)] });
  },
};

const unban = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('unban').setDescription('Unban a user by ID')
    .setDefaultMemberPermissions(P.BanMembers)
    .addStringOption((o) => o.setName('user_id').setDescription('User ID').setRequired(true)).addStringOption(reasonOpt),
  async execute(i) {
    const id = i.options.getString('user_id');
    const reason = i.options.getString('reason') || 'No reason provided';
    const res = await i.guild.members.unban(id, `${i.user.tag}: ${reason}`).catch(() => null);
    if (!res) return fail(i, 'That user is not banned or the ID is invalid.');
    modLog(i.guild, { action: 'Unban', target: res, moderator: i.user, reason });
    return i.reply({ embeds: [success(`**${res.tag}** was unbanned.`)] });
  },
};

const softban = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('softban').setDescription('Ban + unban to wipe a member\'s recent messages')
    .setDefaultMemberPermissions(P.BanMembers).addUserOption(userOpt).addStringOption(reasonOpt),
  async execute(i) {
    const m = await targetMember(i);
    if (!m) return;
    const reason = i.options.getString('reason') || 'No reason provided';
    await dm(i.guild, m.user, 'softbanned (kicked and messages deleted)', reason);
    await i.guild.members.ban(m.id, { reason: `Softban by ${i.user.tag}: ${reason}`, deleteMessageSeconds: 7 * 86400 });
    await i.guild.members.unban(m.id, 'Softban release');
    modLog(i.guild, { action: 'Softban', target: m.user, moderator: i.user, reason });
    return i.reply({ embeds: [success(`**${m.user.tag}** was softbanned.`)] });
  },
};

const kick = {
  category: 'moderation',
  data: new SlashCommandBuilder().setName('kick').setDescription('Kick a member').setDefaultMemberPermissions(P.KickMembers).addUserOption(userOpt).addStringOption(reasonOpt),
  async execute(i) {
    const m = await targetMember(i);
    if (!m) return;
    const reason = i.options.getString('reason') || 'No reason provided';
    await dm(i.guild, m.user, 'kicked', reason);
    await m.kick(`${i.user.tag}: ${reason}`);
    modLog(i.guild, { action: 'Kick', target: m.user, moderator: i.user, reason });
    return i.reply({ embeds: [success(`**${m.user.tag}** was kicked. | ${reason}`)] });
  },
};

const mute = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('mute').setDescription('Timeout a member')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption(userOpt)
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 1h, 1d (max 28d)').setRequired(true))
    .addStringOption(reasonOpt),
  async execute(i) {
    const m = await targetMember(i);
    if (!m) return;
    const dur = parseDuration(i.options.getString('duration'));
    if (!dur || dur > 28 * 86400000) return fail(i, 'Duration must be between 1s and 28d.');
    const reason = i.options.getString('reason') || 'No reason provided';
    await m.timeout(dur, `${i.user.tag}: ${reason}`);
    await dm(i.guild, m.user, `muted for ${formatDuration(dur)}`, reason);
    modLog(i.guild, { action: 'Mute', target: m.user, moderator: i.user, reason, extra: `Duration: ${i.options.getString('duration')}` });
    return i.reply({ embeds: [success(`**${m.user.tag}** muted for **${i.options.getString('duration')}**.`)] });
  },
};

const unmute = {
  category: 'moderation',
  data: new SlashCommandBuilder().setName('unmute').setDescription('Remove a timeout').setDefaultMemberPermissions(P.ModerateMembers).addUserOption(userOpt).addStringOption(reasonOpt),
  async execute(i) {
    const m = await targetMember(i);
    if (!m) return;
    await m.timeout(null, i.options.getString('reason') || `Unmuted by ${i.user.tag}`);
    modLog(i.guild, { action: 'Unmute', target: m.user, moderator: i.user, reason: i.options.getString('reason') });
    return i.reply({ embeds: [success(`**${m.user.tag}** was unmuted.`)] });
  },
};

const warn = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('warn').setDescription('Warning system')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) => s.setName('add').setDescription('Warn a member').addUserOption(userOpt).addStringOption((o) => reasonOpt(o).setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List warnings').addUserOption(userOpt))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a warning').addUserOption(userOpt).addStringOption((o) => o.setName('id').setDescription('Warning ID').setRequired(true)))
    .addSubcommand((s) => s.setName('clear').setDescription('Clear all warnings').addUserOption(userOpt)),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const user = i.options.getUser('user');
    const doc = await getMember(i.guild.id, user.id);
    if (sub === 'add') {
      const m = await targetMember(i);
      if (!m) return;
      const reason = i.options.getString('reason');
      const id = Date.now().toString(36);
      doc.warns.push({ id, moderator: i.user.id, reason, at: new Date() });
      await doc.save();
      await dm(i.guild, user, 'warned', reason);
      modLog(i.guild, { action: 'Warn', target: user, moderator: i.user, reason, extra: `Total warnings: ${doc.warns.length}` });
      return i.reply({ embeds: [success(`**${user.tag}** warned (\`${id}\`). They now have **${doc.warns.length}** warning(s).`)] });
    }
    if (sub === 'remove') {
      const before = doc.warns.length;
      doc.warns = doc.warns.filter((w) => w.id !== i.options.getString('id'));
      if (doc.warns.length === before) return fail(i, 'No warning with that ID.');
      await doc.save();
      return i.reply({ embeds: [success('Warning removed.')] });
    }
    if (sub === 'clear') {
      doc.warns = [];
      await doc.save();
      modLog(i.guild, { action: 'Clear warnings', target: user, moderator: i.user });
      return i.reply({ embeds: [success(`Cleared all warnings for **${user.tag}**.`)] });
    }
    const list = doc.warns.slice(-15).reverse();
    return i.reply({
      embeds: [
        embed(list.length ? list.map((w) => `\`${w.id}\` • <t:${Math.floor(new Date(w.at).getTime() / 1000)}:R> by <@${w.moderator}>\n> ${w.reason}`).join('\n') : 'No warnings.')
          .setTitle(`Warnings for ${user.tag} (${doc.warns.length})`),
      ],
    });
  },
};

const purge = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('purge').setDescription('Bulk delete messages (up to 14 days old)')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addIntegerOption((o) => o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('Only messages from this user'))
    .addStringOption((o) => o.setName('filter').setDescription('Type of messages').addChoices({ name: 'Bots', value: 'bots' }, { name: 'Links', value: 'links' }, { name: 'Attachments', value: 'files' }, { name: 'Contains text…', value: 'text' }))
    .addStringOption((o) => o.setName('text').setDescription('Text to match (with filter "contains text")')),
  async execute(i) {
    await i.deferReply({ flags: 64 });
    const amount = i.options.getInteger('amount');
    const user = i.options.getUser('user');
    const filter = i.options.getString('filter');
    const text = i.options.getString('text')?.toLowerCase();
    let msgs = await i.channel.messages.fetch({ limit: 100 });
    msgs = msgs.filter((m) => Date.now() - m.createdTimestamp < 14 * 86400000 && !m.pinned);
    if (user) msgs = msgs.filter((m) => m.author.id === user.id);
    if (filter === 'bots') msgs = msgs.filter((m) => m.author.bot);
    if (filter === 'links') msgs = msgs.filter((m) => /https?:\/\//.test(m.content));
    if (filter === 'files') msgs = msgs.filter((m) => m.attachments.size);
    if (filter === 'text' && text) msgs = msgs.filter((m) => m.content.toLowerCase().includes(text));
    const toDelete = [...msgs.values()].slice(0, amount);
    const deleted = await i.channel.bulkDelete(toDelete, true);
    modLog(i.guild, { action: 'Purge', target: null, moderator: i.user, reason: `${deleted.size} messages in ${i.channel}` });
    return i.editReply({ embeds: [success(`Deleted **${deleted.size}** messages.`)] });
  },
};

const lock = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('lock').setDescription('Lock a channel')
    .setDefaultMemberPermissions(P.ManageChannels)
    .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption(reasonOpt),
  async execute(i) {
    const ch = i.options.getChannel('channel') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false }, { reason: i.options.getString('reason') || `Locked by ${i.user.tag}` });
    return i.reply({ embeds: [success(`🔒 ${ch} locked.`)] });
  },
};
const unlock = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('unlock').setDescription('Unlock a channel')
    .setDefaultMemberPermissions(P.ManageChannels)
    .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  async execute(i) {
    const ch = i.options.getChannel('channel') || i.channel;
    await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null }, { reason: `Unlocked by ${i.user.tag}` });
    return i.reply({ embeds: [success(`🔓 ${ch} unlocked.`)] });
  },
};

const slowmode = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('slowmode').setDescription('Set channel slowmode')
    .setDefaultMemberPermissions(P.ManageChannels)
    .addStringOption((o) => o.setName('duration').setDescription('e.g. 5s, 1m, off').setRequired(true)),
  async execute(i) {
    const raw = i.options.getString('duration');
    const secs = raw === 'off' || raw === '0' ? 0 : Math.round((parseDuration(raw) || 0) / 1000);
    if (secs < 0 || secs > 21600) return fail(i, 'Slowmode must be between 0 and 6h.');
    await i.channel.setRateLimitPerUser(secs);
    return i.reply({ embeds: [success(secs ? `Slowmode set to **${raw}**.` : 'Slowmode disabled.')] });
  },
};

const jail = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('jail').setDescription('Jail system: remove all roles and confine a member')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) => s.setName('add').setDescription('Jail a member').addUserOption(userOpt).addStringOption(reasonOpt))
    .addSubcommand((s) => s.setName('remove').setDescription('Release a member').addUserOption(userOpt))
    .addSubcommand((s) => s.setName('setup').setDescription('Create the jail role & channel automatically')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const s = await getGuild(i.guild.id);
    if (sub === 'setup') {
      if (!i.member.permissions.has(P.ManageGuild)) return fail(i, 'You need Manage Server.');
      await i.deferReply();
      let role = s.moderation.jailRole && i.guild.roles.cache.get(s.moderation.jailRole);
      if (!role) role = await i.guild.roles.create({ name: 'Jailed', color: 0x555555, reason: 'Jail setup' });
      for (const ch of i.guild.channels.cache.values()) {
        if (ch.isThread() || !ch.manageable) continue;
        await ch.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => null);
      }
      let ch = s.moderation.jailChannel && i.guild.channels.cache.get(s.moderation.jailChannel);
      if (!ch)
        ch = await i.guild.channels.create({
          name: 'jail',
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: i.guild.roles.everyone.id, deny: ['ViewChannel'] },
            { id: role.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          ],
        });
      await updateGuild(i.guild.id, { $set: { 'moderation.jailRole': role.id, 'moderation.jailChannel': ch.id } });
      return i.editReply({ embeds: [success(`Jail ready: role ${role}, channel ${ch}.`)] });
    }
    const m = await targetMember(i);
    if (!m) return;
    const role = i.guild.roles.cache.get(s.moderation.jailRole);
    if (!role) return fail(i, 'Run `/jail setup` first.');
    const doc = await getMember(i.guild.id, m.id);
    if (sub === 'add') {
      if (m.roles.cache.has(role.id)) return fail(i, 'Already jailed.');
      const keep = m.roles.cache.filter((r) => r.id !== i.guild.id && r.editable && !r.managed);
      doc.jailedRoles = keep.map((r) => r.id);
      await doc.save();
      await m.roles.set([...m.roles.cache.filter((r) => !r.editable || r.managed).keys(), role.id].filter((id) => id !== i.guild.id), `Jailed by ${i.user.tag}`);
      const reason = i.options.getString('reason') || 'No reason provided';
      modLog(i.guild, { action: 'Jail', target: m.user, moderator: i.user, reason });
      return i.reply({ embeds: [success(`**${m.user.tag}** has been jailed.`)] });
    }
    if (!m.roles.cache.has(role.id)) return fail(i, 'Not jailed.');
    const restore = doc.jailedRoles.filter((id) => i.guild.roles.cache.has(id));
    await m.roles.remove(role, `Released by ${i.user.tag}`);
    if (restore.length) await m.roles.add(restore).catch(() => null);
    doc.jailedRoles = [];
    await doc.save();
    modLog(i.guild, { action: 'Unjail', target: m.user, moderator: i.user });
    return i.reply({ embeds: [success(`**${m.user.tag}** released with ${restore.length} roles restored.`)] });
  },
};

const nick = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('nick').setDescription('Change or reset a nickname').setDefaultMemberPermissions(P.ManageNicknames)
    .addUserOption(userOpt).addStringOption((o) => o.setName('nickname').setDescription('Leave empty to reset').setMaxLength(32)),
  async execute(i) {
    const m = await targetMember(i);
    if (!m) return;
    await m.setNickname(i.options.getString('nickname') || null, `By ${i.user.tag}`);
    return i.reply({ embeds: [success(`Nickname ${i.options.getString('nickname') ? 'updated' : 'reset'} for ${m}.`)] });
  },
};

const role = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('role').setDescription('Add or remove a role from a member').setDefaultMemberPermissions(P.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Add role').addUserOption(userOpt).addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove role').addUserOption(userOpt).addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))),
  async execute(i) {
    const m = i.options.getMember('user');
    const r = i.options.getRole('role');
    if (!m) return fail(i, 'Member not found.');
    if (!r.editable) return fail(i, 'That role is above mine.');
    if (i.user.id !== i.guild.ownerId && r.position >= i.member.roles.highest.position) return fail(i, 'That role is above yours.');
    if (i.options.getSubcommand() === 'add') await m.roles.add(r, `By ${i.user.tag}`);
    else await m.roles.remove(r, `By ${i.user.tag}`);
    return i.reply({ embeds: [success(`${i.options.getSubcommand() === 'add' ? 'Added' : 'Removed'} ${r} ${i.options.getSubcommand() === 'add' ? 'to' : 'from'} ${m}.`)] });
  },
};

module.exports = { commands: [ban, unban, softban, kick, mute, unmute, warn, purge, lock, unlock, slowmode, jail, nick, role] };

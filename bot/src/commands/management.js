const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const { getGuild, updateGuild, getMember, Member } = require('../utils/db');
const { success, fail, embed, parseDuration, template } = require('../utils/helpers');
const Giveaway = require('../models/Giveaway');
const Ticket = require('../models/Ticket');
const { giveawayEmbed, buttons: gwButtons, endGiveaway } = require('../modules/giveaways');
const invites = require('../modules/invites');
const { tempOwners } = require('../modules/jtc');
const config = require('../config');

const P = PermissionFlagsBits;
const EPH = MessageFlags.Ephemeral;
const LOG_TYPES = ['mod', 'message', 'member', 'server', 'voice', 'invite'];

/* ───────────────────────── Logs ───────────────────────── */
const logs = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('logs').setDescription('Configure the logging system').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('set').setDescription('Set a log channel')
      .addStringOption((o) => o.setName('type').setDescription('Log type').setRequired(true).addChoices(...LOG_TYPES.map((t) => ({ name: t, value: t }))))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable a log type')
      .addStringOption((o) => o.setName('type').setDescription('Log type').setRequired(true).addChoices(...LOG_TYPES.map((t) => ({ name: t, value: t })))))
    .addSubcommand((s) => s.setName('setup').setDescription('Create a private "logs" category with every log channel'))
    .addSubcommand((s) => s.setName('view').setDescription('Show log channels')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'set') {
      await updateGuild(i.guild.id, { $set: { [`logs.${i.options.getString('type')}`]: i.options.getChannel('channel').id } });
      return i.reply({ embeds: [success(`\`${i.options.getString('type')}\` logs → ${i.options.getChannel('channel')}`)] });
    }
    if (sub === 'disable') {
      await updateGuild(i.guild.id, { $set: { [`logs.${i.options.getString('type')}`]: null } });
      return i.reply({ embeds: [success(`\`${i.options.getString('type')}\` logs disabled.`)] });
    }
    if (sub === 'setup') {
      await i.deferReply();
      const cat = await i.guild.channels.create({
        name: `${config.botName} Logs`,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: ['ViewChannel'] }, { id: i.client.user.id, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] }],
      });
      const set = {};
      for (const t of LOG_TYPES) {
        const ch = await i.guild.channels.create({ name: `${t}-logs`, type: ChannelType.GuildText, parent: cat.id });
        set[`logs.${t}`] = ch.id;
      }
      await updateGuild(i.guild.id, { $set: set });
      return i.editReply({ embeds: [success(`Created ${LOG_TYPES.length} log channels under **${cat.name}**.`)] });
    }
    const s = await getGuild(i.guild.id);
    return i.reply({ embeds: [embed(LOG_TYPES.map((t) => `**${t}:** ${s.logs[t] ? `<#${s.logs[t]}>` : '—'}`).join('\n')).setTitle('📜 Logging')] });
  },
};

/* ───────────────────────── Welcome ───────────────────────── */
const welcome = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('welcome').setDescription('Welcome messages').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('set').setDescription('Set welcome channel & message')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((o) => o.setName('message').setDescription('Vars: {user} {username} {server} {count}')))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable welcome messages'))
    .addSubcommand((s) => s.setName('test').setDescription('Preview the welcome message')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'set') {
      const set = { 'welcome.channel': i.options.getChannel('channel').id };
      if (i.options.getString('message')) set['welcome.message'] = i.options.getString('message');
      await updateGuild(i.guild.id, { $set: set });
      return i.reply({ embeds: [success(`Welcome messages will be sent in ${i.options.getChannel('channel')}.`)] });
    }
    if (sub === 'disable') {
      await updateGuild(i.guild.id, { $set: { 'welcome.channel': null } });
      return i.reply({ embeds: [success('Welcome messages disabled.')] });
    }
    const s = await getGuild(i.guild.id);
    return i.reply({ content: template(s.welcome.message, { user: `${i.user}`, username: i.user.username, server: i.guild.name, count: i.guild.memberCount }) });
  },
};

/* ───────────────────────── Reaction roles ───────────────────────── */
const reactionrole = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('reactionrole').setDescription('Reaction roles').setDefaultMemberPermissions(P.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Add a reaction role to a message')
      .addStringOption((o) => o.setName('message_id').setDescription('Message ID').setRequired(true))
      .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel of the message (default: here)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a reaction role')
      .addStringOption((o) => o.setName('message_id').setDescription('Message ID').setRequired(true))
      .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List reaction roles')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const s = await getGuild(i.guild.id);
    if (sub === 'list') {
      const list = s.reactionRoles.map((r) => `${r.emoji} → <@&${r.roleId}> • [message](https://discord.com/channels/${i.guild.id}/${r.channelId}/${r.messageId})`);
      return i.reply({ embeds: [embed(list.join('\n') || 'None set up.').setTitle('Reaction roles')] });
    }
    const raw = i.options.getString('emoji').trim();
    const custom = raw.match(/<a?:\w+:(\d+)>/);
    const emojiKey = custom ? custom[1] : raw;
    if (sub === 'remove') {
      await updateGuild(i.guild.id, { $pull: { reactionRoles: { messageId: i.options.getString('message_id'), emoji: emojiKey } } });
      return i.reply({ embeds: [success('Reaction role removed.')] });
    }
    const channel = i.options.getChannel('channel') || i.channel;
    const msg = await channel.messages.fetch(i.options.getString('message_id')).catch(() => null);
    if (!msg) return fail(i, `Message not found in ${channel}.`);
    const role = i.options.getRole('role');
    if (!role.editable) return fail(i, 'That role is above mine.');
    const ok = await msg.react(custom ? custom[1] : raw).catch(() => null);
    if (!ok) return fail(i, 'Invalid emoji (or one I cannot use).');
    await updateGuild(i.guild.id, { $push: { reactionRoles: { channelId: channel.id, messageId: msg.id, emoji: emojiKey, roleId: role.id } } });
    return i.reply({ embeds: [success(`Reacting with ${raw} on that message now gives ${role}.`)] });
  },
};

/* ───────────────────────── Vanity roles ───────────────────────── */
const vanity = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('vanityrole').setDescription('Give a role to members with your vanity/text in their status').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('set').setDescription('Configure')
      .addStringOption((o) => o.setName('text').setDescription('Text to look for, e.g. /myserver or discord.gg/myserver').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role to give').setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Where to thank them').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable vanity roles')),
  async execute(i) {
    if (i.options.getSubcommand() === 'disable') {
      await updateGuild(i.guild.id, { $set: { 'vanity.text': null } });
      return i.reply({ embeds: [success('Vanity roles disabled.')] });
    }
    const role = i.options.getRole('role');
    if (!role.editable) return fail(i, 'That role is above mine.');
    await updateGuild(i.guild.id, { $set: { 'vanity.text': i.options.getString('text'), 'vanity.role': role.id, 'vanity.channel': i.options.getChannel('channel')?.id || null } });
    return i.reply({ embeds: [success(`Members with \`${i.options.getString('text')}\` in their custom status will get ${role}.\n*Requires the Presence intent enabled in the Developer Portal.*`)] });
  },
};

/* ───────────────────────── Invites ───────────────────────── */
const invitesCmd = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('invites').setDescription('Invite tracker')
    .addSubcommand((s) => s.setName('user').setDescription('Show invites for a user').addUserOption((o) => o.setName('user').setDescription('User')))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('Top inviters'))
    .addSubcommand((s) => s.setName('bonus').setDescription('Give/remove bonus invites (admin)')
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Can be negative').setRequired(true))),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'bonus') {
      if (!i.member.permissions.has(P.ManageGuild)) return fail(i, 'You need Manage Server.');
      const doc = await getMember(i.guild.id, i.options.getUser('user').id);
      doc.invites.bonus += i.options.getInteger('amount');
      await doc.save();
      return i.reply({ embeds: [success(`${i.options.getUser('user')} now has **${invites.total(doc.invites)}** invites.`)] });
    }
    if (sub === 'leaderboard') {
      const docs = await Member.find({ guildId: i.guild.id }).lean();
      const top = docs.map((d) => ({ id: d.userId, n: invites.total(d.invites || {}) })).filter((d) => d.n > 0 && d.id !== 'vanity').sort((a, b) => b.n - a.n).slice(0, 10);
      return i.reply({ embeds: [embed(top.map((t, n) => `**${n + 1}.** <@${t.id}> — ${t.n} invites`).join('\n') || 'No invites tracked yet.').setTitle('📨 Invite leaderboard')] });
    }
    const user = i.options.getUser('user') || i.user;
    const inv = (await getMember(i.guild.id, user.id)).invites;
    return i.reply({
      embeds: [embed(`${user} has **${invites.total(inv)}** invites\n✅ ${inv.regular} regular • ❌ ${inv.left} left • 💩 ${inv.fake} fake • ✨ ${inv.bonus} bonus`).setTitle('📨 Invites')],
    });
  },
};

/* ───────────────────────── Tickets ───────────────────────── */
const ticket = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('ticket').setDescription('Ticket system')
    .addSubcommand((s) => s.setName('setup').setDescription('Post a ticket panel (admin)')
      .addChannelOption((o) => o.setName('channel').setDescription('Where to post the panel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((o) => o.setName('support_role').setDescription('Staff role that sees tickets').setRequired(true))
      .addChannelOption((o) => o.setName('category').setDescription('Category for ticket channels').addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption((o) => o.setName('log_channel').setDescription('Where transcripts go').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('title').setDescription('Panel title'))
      .addStringOption((o) => o.setName('description').setDescription('Panel description')))
    .addSubcommand((s) => s.setName('add').setDescription('Add a user to this ticket').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a user from this ticket').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('close').setDescription('Close this ticket'))
    .addSubcommand((s) => s.setName('rename').setDescription('Rename this ticket').addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true))),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'setup') {
      if (!i.member.permissions.has(P.ManageGuild)) return fail(i, 'You need Manage Server.');
      await updateGuild(i.guild.id, {
        $set: {
          'tickets.supportRole': i.options.getRole('support_role').id,
          'tickets.category': i.options.getChannel('category')?.id || null,
          'tickets.logChannel': i.options.getChannel('log_channel')?.id || null,
        },
      });
      const panel = new EmbedBuilder()
        .setColor(config.color)
        .setTitle(i.options.getString('title') || '🎫 Support')
        .setDescription(i.options.getString('description') || 'Need help? Click the button below to open a private ticket with the staff team.');
      await i.options.getChannel('channel').send({
        embeds: [panel],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:open').setLabel('Open ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))],
      });
      return i.reply({ embeds: [success('Ticket panel posted.')], flags: EPH });
    }
    const t = await Ticket.findOne({ channelId: i.channel.id, open: true });
    if (!t) return fail(i, 'This is not an open ticket channel.');
    const s = await getGuild(i.guild.id);
    const staff = i.member.roles.cache.has(s.tickets.supportRole) || i.member.permissions.has(P.ManageChannels);
    if (sub === 'add' || sub === 'remove') {
      if (!staff) return fail(i, 'Staff only.');
      const u = i.options.getUser('user');
      await i.channel.permissionOverwrites.edit(u, sub === 'add' ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true } : { ViewChannel: false });
      return i.reply({ embeds: [success(`${u} ${sub === 'add' ? 'added to' : 'removed from'} the ticket.`)] });
    }
    if (sub === 'rename') {
      if (!staff) return fail(i, 'Staff only.');
      await i.channel.setName(i.options.getString('name'));
      return i.reply({ embeds: [success('Renamed.')] });
    }
    if (!staff && t.ownerId !== i.user.id) return fail(i, 'Only staff or the ticket owner can close it.');
    return closeTicket(i, t);
  },
};

async function closeTicket(i, t) {
  if (!i.deferred && !i.replied) await i.reply({ embeds: [embed('🔒 Closing ticket and saving transcript…')] });
  const s = await getGuild(i.guild.id);
  t.open = false;
  t.closedAt = new Date();
  await t.save();
  const msgs = await i.channel.messages.fetch({ limit: 100 }).catch(() => null);
  const lines = msgs ? [...msgs.values()].reverse().map((m) => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size ? ` [${m.attachments.map((a) => a.url).join(' ')}]` : ''}`) : [];
  const file = new AttachmentBuilder(Buffer.from(lines.join('\n') || 'No messages'), { name: `ticket-${t.number}.txt` });
  const logCh = s.tickets.logChannel && i.guild.channels.cache.get(s.tickets.logChannel);
  const summary = new EmbedBuilder().setColor(0x95a5a6).setTitle(`Ticket #${t.number} closed`).setDescription(`**Opened by:** <@${t.ownerId}>\n**Closed by:** ${i.user}\n**Messages:** ${lines.length}`).setTimestamp();
  if (logCh) await logCh.send({ embeds: [summary], files: [file] }).catch(() => null);
  const owner = await i.client.users.fetch(t.ownerId).catch(() => null);
  owner?.send({ embeds: [summary.setFooter({ text: i.guild.name })], files: [new AttachmentBuilder(Buffer.from(lines.join('\n') || 'No messages'), { name: `ticket-${t.number}.txt` })] }).catch(() => null);
  setTimeout(() => i.channel.delete('Ticket closed').catch(() => null), 5000);
}

async function ticketComponent(i, client, [action]) {
  const s = await getGuild(i.guild.id);
  if (action === 'open') {
    const existing = await Ticket.findOne({ guildId: i.guild.id, ownerId: i.user.id, open: true });
    if (existing && i.guild.channels.cache.has(existing.channelId)) return i.reply({ content: `You already have a ticket: <#${existing.channelId}>`, flags: EPH });
    await i.deferReply({ flags: EPH });
    const updated = await updateGuild(i.guild.id, { $inc: { 'tickets.counter': 1 } });
    const number = updated.tickets.counter;
    const overwrites = [
      { id: i.guild.roles.everyone.id, deny: ['ViewChannel'] },
      { id: i.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'] },
      { id: client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] },
    ];
    if (s.tickets.supportRole && i.guild.roles.cache.has(s.tickets.supportRole))
      overwrites.push({ id: s.tickets.supportRole, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles'] });
    const ch = await i.guild.channels.create({
      name: `ticket-${String(number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: s.tickets.category && i.guild.channels.cache.has(s.tickets.category) ? s.tickets.category : null,
      topic: `Ticket #${number} • ${i.user.tag} (${i.user.id})`,
      permissionOverwrites: overwrites,
    });
    await Ticket.create({ guildId: i.guild.id, channelId: ch.id, ownerId: i.user.id, number });
    await ch.send({
      content: `${i.user}${s.tickets.supportRole ? ` <@&${s.tickets.supportRole}>` : ''}`,
      embeds: [new EmbedBuilder().setColor(config.color).setTitle(`🎫 Ticket #${number}`).setDescription(s.tickets.openMessage)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        ),
      ],
    });
    return i.editReply({ content: `Your ticket is open: ${ch}` });
  }
  const t = await Ticket.findOne({ channelId: i.channel.id, open: true });
  if (!t) return i.reply({ content: 'This ticket is already closed.', flags: EPH });
  const staff = i.member.roles.cache.has(s.tickets.supportRole) || i.member.permissions.has(P.ManageChannels);
  if (action === 'claim') {
    if (!staff) return i.reply({ content: 'Staff only.', flags: EPH });
    if (t.claimedBy) return i.reply({ content: `Already claimed by <@${t.claimedBy}>.`, flags: EPH });
    t.claimedBy = i.user.id;
    await t.save();
    return i.reply({ embeds: [embed(`🙋 ${i.user} will handle this ticket.`)] });
  }
  if (action === 'close') {
    if (!staff && t.ownerId !== i.user.id) return i.reply({ content: 'Only staff or the ticket owner can close it.', flags: EPH });
    return i.reply({
      content: 'Are you sure you want to close this ticket?',
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:confirm').setLabel('Close ticket').setStyle(ButtonStyle.Danger))],
      flags: EPH,
    });
  }
  if (action === 'confirm') {
    await i.update({ content: 'Closing…', components: [] });
    return closeTicket(i, t);
  }
}

/* ───────────────────────── Giveaways ───────────────────────── */
const giveaway = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('giveaway').setDescription('Giveaways').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('Start a giveaway')
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 1h, 2d').setRequired(true))
      .addStringOption((o) => o.setName('prize').setDescription('Prize').setRequired(true).setMaxLength(200))
      .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o.setName('required_role').setDescription('Role required to enter')))
    .addSubcommand((s) => s.setName('end').setDescription('End a giveaway now').addStringOption((o) => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Pick new winners').addStringOption((o) => o.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Active giveaways')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'start') {
      const dur = parseDuration(i.options.getString('duration'));
      if (!dur || dur < 10_000 || dur > 60 * 86400000) return fail(i, 'Duration must be between 10s and 60d.');
      const channel = i.options.getChannel('channel') || i.channel;
      const g = new Giveaway({
        guildId: i.guild.id, channelId: channel.id, hostId: i.user.id, prize: i.options.getString('prize'),
        winnerCount: i.options.getInteger('winners') || 1, endsAt: new Date(Date.now() + dur), requiredRole: i.options.getRole('required_role')?.id || null,
      });
      const msg = await channel.send({ content: '🎉 **GIVEAWAY** 🎉', embeds: [giveawayEmbed(g)], components: [gwButtons(g)] });
      g.messageId = msg.id;
      await g.save();
      return i.reply({ embeds: [success(`Giveaway started in ${channel}.`)], flags: EPH });
    }
    if (sub === 'list') {
      const list = await Giveaway.find({ guildId: i.guild.id, ended: false }).limit(15);
      return i.reply({ embeds: [embed(list.map((g) => `**${g.prize}** • ends <t:${Math.floor(g.endsAt / 1000)}:R> • [jump](https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}) • ${g.entrants.length} entries`).join('\n') || 'No active giveaways.').setTitle('🎉 Giveaways')] });
    }
    const g = await Giveaway.findOne({ guildId: i.guild.id, messageId: i.options.getString('message_id') });
    if (!g) return fail(i, 'Giveaway not found.');
    if (sub === 'end') {
      if (g.ended) return fail(i, 'Already ended.');
      await endGiveaway(i.client, g);
      return i.reply({ embeds: [success('Giveaway ended.')], flags: EPH });
    }
    if (!g.ended) return fail(i, 'That giveaway has not ended yet.');
    await endGiveaway(i.client, g, true);
    return i.reply({ embeds: [success('Rerolled.')], flags: EPH });
  },
};

async function giveawayComponent(i) {
  const g = await Giveaway.findOne({ messageId: i.message.id });
  if (!g || g.ended) return i.reply({ content: 'This giveaway has ended.', flags: EPH });
  if (g.requiredRole && !i.member.roles.cache.has(g.requiredRole)) return i.reply({ content: `You need <@&${g.requiredRole}> to enter.`, flags: EPH });
  const joined = g.entrants.includes(i.user.id);
  const updated = await Giveaway.findOneAndUpdate({ _id: g._id }, joined ? { $pull: { entrants: i.user.id } } : { $addToSet: { entrants: i.user.id } }, { new: true });
  await i.update({ embeds: [giveawayEmbed(updated)] });
  return i.followUp({ content: joined ? 'You left the giveaway.' : '🎉 You entered the giveaway! Good luck!', flags: EPH });
}

/* ───────────────────────── Verification ───────────────────────── */
const pendingCaptcha = new Map();
const verification = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('verification').setDescription('Verification gate').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Post a verification panel')
      .addChannelOption((o) => o.setName('channel').setDescription('Panel channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role given after verifying').setRequired(true))
      .addBooleanOption((o) => o.setName('captcha').setDescription('Require typing a code (default on)')))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable verification')),
  async execute(i) {
    if (i.options.getSubcommand() === 'disable') {
      await updateGuild(i.guild.id, { $set: { 'verification.enabled': false } });
      return i.reply({ embeds: [success('Verification disabled.')] });
    }
    const role = i.options.getRole('role');
    if (!role.editable) return fail(i, 'That role is above mine.');
    const channel = i.options.getChannel('channel');
    await updateGuild(i.guild.id, { $set: { 'verification.enabled': true, 'verification.role': role.id, 'verification.channel': channel.id, 'verification.captcha': i.options.getBoolean('captcha') ?? true } });
    await channel.send({
      embeds: [new EmbedBuilder().setColor(config.color).setTitle('✅ Verification').setDescription(`Welcome to **${i.guild.name}**! Click the button below to verify and unlock the server.`)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify:start').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success))],
    });
    return i.reply({ embeds: [success(`Verification panel posted in ${channel}. Tip: hide other channels from @everyone and allow them for ${role}.`)], flags: EPH });
  },
};

async function verifyComponent(i, client, [action]) {
  const s = await getGuild(i.guild.id);
  if (!s.verification.enabled) return i.reply({ content: 'Verification is disabled.', flags: EPH });
  const role = i.guild.roles.cache.get(s.verification.role);
  if (!role) return i.reply({ content: 'Verification role is missing — ask an admin.', flags: EPH });
  if (i.member.roles.cache.has(role.id)) return i.reply({ content: 'You are already verified.', flags: EPH });
  if (action === 'start' && s.verification.captcha) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[O0I1]/g, 'X');
    pendingCaptcha.set(`${i.guild.id}:${i.user.id}`, { code, at: Date.now() });
    const modal = new ModalBuilder()
      .setCustomId('verify:submit')
      .setTitle('Verification')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel(`Type this code: ${code.split('').join(' ')}`).setStyle(TextInputStyle.Short).setMinLength(6).setMaxLength(6).setRequired(true)));
    return i.showModal(modal);
  }
  if (action === 'submit') {
    const p = pendingCaptcha.get(`${i.guild.id}:${i.user.id}`);
    pendingCaptcha.delete(`${i.guild.id}:${i.user.id}`);
    if (!p || Date.now() - p.at > 5 * 60_000 || i.fields.getTextInputValue('code').trim().toUpperCase() !== p.code)
      return i.reply({ content: '❌ Wrong or expired code. Click Verify to try again.', flags: EPH });
  }
  await i.member.roles.add(role, 'Verified');
  return i.reply({ content: '✅ You are verified. Welcome!', flags: EPH });
}

/* ───────────────────────── Join-to-create voice ───────────────────────── */
const jtc = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('jtc').setDescription('Join-to-create voice channels').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Create the hub channel')
      .addChannelOption((o) => o.setName('category').setDescription('Category for temp channels').addChannelTypes(ChannelType.GuildCategory))
      .addStringOption((o) => o.setName('name_template').setDescription('Default name, {user} = member name')))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable join-to-create')),
  async execute(i) {
    if (i.options.getSubcommand() === 'disable') {
      await updateGuild(i.guild.id, { $set: { 'jtc.hub': null } });
      return i.reply({ embeds: [success('Join-to-create disabled.')] });
    }
    const cat = i.options.getChannel('category');
    const hub = await i.guild.channels.create({ name: '➕ Join to Create', type: ChannelType.GuildVoice, parent: cat?.id || null });
    const set = { 'jtc.hub': hub.id, 'jtc.category': cat?.id || null };
    if (i.options.getString('name_template')) set['jtc.nameTemplate'] = i.options.getString('name_template');
    await updateGuild(i.guild.id, { $set: set });
    return i.reply({ embeds: [success(`Join ${hub} to get your own voice channel. Owners can manage it with \`/voice\`.`)] });
  },
};

const voice = {
  category: 'management',
  data: new SlashCommandBuilder()
    .setName('voice').setDescription('Manage your join-to-create voice channel')
    .addSubcommand((s) => s.setName('rename').setDescription('Rename').addStringOption((o) => o.setName('name').setDescription('Name').setRequired(true).setMaxLength(90)))
    .addSubcommand((s) => s.setName('limit').setDescription('User limit (0 = none)').addIntegerOption((o) => o.setName('count').setDescription('Limit').setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand((s) => s.setName('lock').setDescription('Lock the channel'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Unlock the channel'))
    .addSubcommand((s) => s.setName('permit').setDescription('Let someone join while locked').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('kick').setDescription('Remove someone from your channel').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('claim').setDescription('Claim the channel if the owner left')),
  async execute(i) {
    const vc = i.member.voice.channel;
    if (!vc || !tempOwners.has(vc.id)) return fail(i, 'You must be in a join-to-create channel.');
    const sub = i.options.getSubcommand();
    const owner = tempOwners.get(vc.id);
    if (sub === 'claim') {
      if (vc.members.has(owner)) return fail(i, 'The owner is still here.');
      tempOwners.set(vc.id, i.user.id);
      return i.reply({ embeds: [success('You now own this channel.')] });
    }
    if (owner !== i.user.id) return fail(i, 'Only the channel owner can do that.');
    switch (sub) {
      case 'rename': await vc.setName(i.options.getString('name')); break;
      case 'limit': await vc.setUserLimit(i.options.getInteger('count')); break;
      case 'lock': await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: false }); break;
      case 'unlock': await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: null }); break;
      case 'permit': await vc.permissionOverwrites.edit(i.options.getUser('user'), { Connect: true, ViewChannel: true }); break;
      case 'kick': {
        const m = i.options.getMember('user');
        if (m?.voice.channelId === vc.id) await m.voice.disconnect();
        await vc.permissionOverwrites.edit(i.options.getUser('user'), { Connect: false });
        break;
      }
      default: break;
    }
    return i.reply({ embeds: [success('Done.')], flags: EPH });
  },
};

module.exports = {
  commands: [logs, welcome, reactionrole, vanity, invitesCmd, ticket, giveaway, verification, jtc, voice],
  components: { ticket: ticketComponent, giveaway: giveawayComponent, verify: verifyComponent },
};

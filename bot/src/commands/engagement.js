const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { getGuild, updateGuild, getMember, Member } = require('../utils/db');
const { success, fail, embed, progressBar } = require('../utils/helpers');
const { xpForLevel, totalXpFor, levelFromXp } = require('../modules/leveling');
const afk = require('../modules/afk');
const config = require('../config');

const P = PermissionFlagsBits;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ───────────── Leveling ───────────── */
const rank = {
  category: 'engagement',
  data: new SlashCommandBuilder().setName('rank').setDescription('Show your level and XP').addUserOption((o) => o.setName('user').setDescription('User')),
  async execute(i) {
    const user = i.options.getUser('user') || i.user;
    const doc = await getMember(i.guild.id, user.id);
    const position = (await Member.countDocuments({ guildId: i.guild.id, xp: { $gt: doc.xp } })) + 1;
    const into = doc.xp - totalXpFor(doc.level);
    const need = xpForLevel(doc.level);
    const e = new EmbedBuilder()
      .setColor(config.color)
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setTitle(`Level ${doc.level} • Rank #${position}`)
      .setDescription(`${progressBar(into, need, 18)}\n**${into.toLocaleString()} / ${need.toLocaleString()} XP** to level ${doc.level + 1}`)
      .addFields({ name: 'Total XP', value: doc.xp.toLocaleString(), inline: true }, { name: 'Messages', value: doc.messages.toLocaleString(), inline: true })
      .setThumbnail(user.displayAvatarURL());
    return i.reply({ embeds: [e] });
  },
};

const leaderboard = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('leaderboard').setDescription('Server leaderboards')
    .addStringOption((o) => o.setName('type').setDescription('Board').addChoices({ name: 'XP / levels', value: 'xp' }, { name: 'Coins', value: 'coins' }, { name: 'Messages', value: 'messages' }))
    .addIntegerOption((o) => o.setName('page').setDescription('Page').setMinValue(1)),
  async execute(i) {
    const type = i.options.getString('type') || 'xp';
    const page = (i.options.getInteger('page') || 1) - 1;
    const docs = await Member.find({ guildId: i.guild.id, [type]: { $gt: 0 } }).sort({ [type]: -1 }).skip(page * 10).limit(10).lean();
    const medal = (n) => ['🥇', '🥈', '🥉'][n] || `**${n + 1}.**`;
    const line = (d, n) =>
      `${medal(page * 10 + n)} <@${d.userId}> — ${type === 'xp' ? `Level ${d.level} (${d.xp.toLocaleString()} XP)` : type === 'coins' ? `🪙 ${d.coins.toLocaleString()}` : `${d.messages.toLocaleString()} messages`}`;
    return i.reply({ embeds: [embed(docs.map(line).join('\n') || 'Nobody here yet.').setTitle(`🏆 ${type === 'xp' ? 'Level' : type === 'coins' ? 'Richest' : 'Message'} leaderboard`).setFooter({ text: `Page ${page + 1}` })] });
  },
};

const levels = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('levels').setDescription('Configure leveling').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('toggle').setDescription('Enable/disable leveling').addBooleanOption((o) => o.setName('enabled').setDescription('On/off').setRequired(true)))
    .addSubcommand((s) => s.setName('announce').setDescription('Where level-up messages go')
      .addStringOption((o) => o.setName('mode').setDescription('Mode').setRequired(true).addChoices({ name: 'Same channel', value: 'current' }, { name: 'Specific channel', value: 'channel' }, { name: 'DM', value: 'dm' }, { name: 'Off', value: 'off' }))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (for specific channel mode)').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('message').setDescription('Vars: {user} {username} {level} {server}')))
    .addSubcommand((s) => s.setName('reward').setDescription('Add/remove a role reward')
      .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(1).setMaxValue(500))
      .addRoleOption((o) => o.setName('role').setDescription('Role (leave empty to remove reward at this level)')))
    .addSubcommand((s) => s.setName('multiplier').setDescription('XP multiplier').addNumberOption((o) => o.setName('value').setDescription('0.1 - 5').setRequired(true).setMinValue(0.1).setMaxValue(5)))
    .addSubcommand((s) => s.setName('noxp').setDescription('Toggle XP in a channel').addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand((s) => s.setName('setxp').setDescription('Set a user\'s XP').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)).addIntegerOption((o) => o.setName('xp').setDescription('XP').setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s.setName('view').setDescription('Show leveling settings')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const g = i.guild.id;
    const s = await getGuild(g);
    if (sub === 'toggle') {
      await updateGuild(g, { $set: { 'leveling.enabled': i.options.getBoolean('enabled') } });
      return i.reply({ embeds: [success(`Leveling ${i.options.getBoolean('enabled') ? 'enabled' : 'disabled'}.`)] });
    }
    if (sub === 'announce') {
      const set = { 'leveling.announce': i.options.getString('mode') };
      if (i.options.getChannel('channel')) set['leveling.channel'] = i.options.getChannel('channel').id;
      if (i.options.getString('message')) set['leveling.message'] = i.options.getString('message');
      await updateGuild(g, { $set: set });
      return i.reply({ embeds: [success('Level-up announcements updated.')] });
    }
    if (sub === 'reward') {
      const level = i.options.getInteger('level');
      const role = i.options.getRole('role');
      await updateGuild(g, { $pull: { 'leveling.rewards': { level } } });
      if (role) {
        if (!role.editable) return fail(i, 'That role is above mine.');
        await updateGuild(g, { $push: { 'leveling.rewards': { level, roleId: role.id } } });
      }
      return i.reply({ embeds: [success(role ? `Level **${level}** now rewards ${role}.` : `Reward at level ${level} removed.`)] });
    }
    if (sub === 'multiplier') {
      await updateGuild(g, { $set: { 'leveling.multiplier': i.options.getNumber('value') } });
      return i.reply({ embeds: [success(`XP multiplier set to **${i.options.getNumber('value')}x**.`)] });
    }
    if (sub === 'noxp') {
      const id = i.options.getChannel('channel').id;
      const has = s.leveling.noXpChannels.includes(id);
      await updateGuild(g, has ? { $pull: { 'leveling.noXpChannels': id } } : { $addToSet: { 'leveling.noXpChannels': id } });
      return i.reply({ embeds: [success(`XP ${has ? 'enabled' : 'disabled'} in <#${id}>.`)] });
    }
    if (sub === 'setxp') {
      const doc = await getMember(g, i.options.getUser('user').id);
      doc.xp = i.options.getInteger('xp');
      doc.level = levelFromXp(doc.xp);
      await doc.save();
      return i.reply({ embeds: [success(`${i.options.getUser('user')} now has ${doc.xp} XP (level ${doc.level}).`)] });
    }
    const l = s.leveling;
    return i.reply({
      embeds: [
        embed(
          `**Enabled:** ${l.enabled ? 'yes' : 'no'}\n**Multiplier:** ${l.multiplier}x\n**Announce:** ${l.announce}${l.announce === 'channel' && l.channel ? ` in <#${l.channel}>` : ''}\n**Message:** ${l.message}\n**No-XP channels:** ${l.noXpChannels.map((c) => `<#${c}>`).join(' ') || 'none'}\n**Rewards:**\n${l.rewards.sort((a, b) => a.level - b.level).map((r) => `Level ${r.level} → <@&${r.roleId}>`).join('\n') || 'none'}`
        ).setTitle('📈 Leveling'),
      ],
    });
  },
};

/* ───────────── Birthdays ───────────── */
const birthday = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('birthday').setDescription('Birthday tracker')
    .addSubcommand((s) => s.setName('set').setDescription('Set your birthday')
      .addIntegerOption((o) => o.setName('month').setDescription('Month').setRequired(true).addChoices(...MONTHS.map((m, n) => ({ name: m, value: n + 1 }))))
      .addIntegerOption((o) => o.setName('day').setDescription('Day').setRequired(true).setMinValue(1).setMaxValue(31)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove your birthday'))
    .addSubcommand((s) => s.setName('view').setDescription('See someone\'s birthday').addUserOption((o) => o.setName('user').setDescription('User')))
    .addSubcommand((s) => s.setName('upcoming').setDescription('Upcoming birthdays'))
    .addSubcommand((s) => s.setName('config').setDescription('Announcement settings (admin)')
      .addChannelOption((o) => o.setName('channel').setDescription('Announcement channel').addChannelTypes(ChannelType.GuildText))
      .addRoleOption((o) => o.setName('role').setDescription('Role given on their birthday'))
      .addStringOption((o) => o.setName('message').setDescription('Vars: {user} {username} {server}'))),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'config') {
      if (!i.member.permissions.has(P.ManageGuild)) return fail(i, 'You need Manage Server.');
      const set = {};
      if (i.options.getChannel('channel')) set['birthdays.channel'] = i.options.getChannel('channel').id;
      if (i.options.getRole('role')) set['birthdays.role'] = i.options.getRole('role').id;
      if (i.options.getString('message')) set['birthdays.message'] = i.options.getString('message');
      const s = await updateGuild(i.guild.id, { $set: set });
      return i.reply({ embeds: [success(`Birthdays → ${s.birthdays.channel ? `<#${s.birthdays.channel}>` : 'no channel'}, role: ${s.birthdays.role ? `<@&${s.birthdays.role}>` : 'none'}`)] });
    }
    if (sub === 'set') {
      const month = i.options.getInteger('month');
      const day = i.options.getInteger('day');
      if (day > DAYS_IN[month - 1]) return fail(i, `${MONTHS[month - 1]} doesn't have ${day} days.`);
      await Member.updateOne({ guildId: i.guild.id, userId: i.user.id }, { $set: { birthday: { month, day } } }, { upsert: true });
      return i.reply({ embeds: [success(`🎂 Birthday saved: **${MONTHS[month - 1]} ${day}**`)], flags: 64 });
    }
    if (sub === 'remove') {
      await Member.updateOne({ guildId: i.guild.id, userId: i.user.id }, { $unset: { birthday: 1 } });
      return i.reply({ embeds: [success('Birthday removed.')], flags: 64 });
    }
    if (sub === 'view') {
      const u = i.options.getUser('user') || i.user;
      const d = await Member.findOne({ guildId: i.guild.id, userId: u.id }).lean();
      return i.reply({ embeds: [embed(d?.birthday?.month ? `🎂 ${u}'s birthday is **${MONTHS[d.birthday.month - 1]} ${d.birthday.day}**` : `${u} hasn't set a birthday.`)] });
    }
    const docs = await Member.find({ guildId: i.guild.id, 'birthday.month': { $exists: true, $ne: null } }).lean();
    const now = new Date();
    const dayOfYear = (m, d) => Math.floor((Date.UTC(2024, m - 1, d) - Date.UTC(2024, 0, 1)) / 86400000);
    const todayN = dayOfYear(now.getUTCMonth() + 1, now.getUTCDate());
    const list = docs
      .map((d) => ({ id: d.userId, m: d.birthday.month, d: d.birthday.day, diff: (dayOfYear(d.birthday.month, d.birthday.day) - todayN + 366) % 366 }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 10);
    return i.reply({ embeds: [embed(list.map((b) => `**${MONTHS[b.m - 1]} ${b.d}** — <@${b.id}>${b.diff === 0 ? ' 🎉 today!' : ` (in ${b.diff} days)`}`).join('\n') || 'No birthdays saved yet.').setTitle('🎂 Upcoming birthdays')] });
  },
};

/* ───────────── AFK ───────────── */
const afkCmd = {
  category: 'engagement',
  data: new SlashCommandBuilder().setName('afk').setDescription('Set yourself as AFK').addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(200)),
  async execute(i) {
    const reason = i.options.getString('reason') || 'AFK';
    await afk.set(i.guild.id, i.user.id, reason);
    if (i.member.manageable && !(i.member.nickname || '').startsWith('[AFK] '))
      i.member.setNickname(`[AFK] ${i.member.displayName}`.slice(0, 32)).catch(() => null);
    return i.reply({ embeds: [success(`You're now AFK: ${reason}`)] });
  },
};

/* ───────────── Autorole ───────────── */
const autorole = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('autorole').setDescription('Roles given automatically on join').setDefaultMemberPermissions(P.ManageRoles)
    .addSubcommand((s) => s.setName('add').setDescription('Add an autorole').addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)).addBooleanOption((o) => o.setName('bots').setDescription('For bots instead of humans')))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove an autorole').addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List autoroles')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const role = i.options.getRole('role');
    if (sub === 'add') {
      if (!role.editable) return fail(i, 'That role is above mine.');
      await updateGuild(i.guild.id, { $addToSet: { [i.options.getBoolean('bots') ? 'autorole.bots' : 'autorole.humans']: role.id } });
      return i.reply({ embeds: [success(`${role} will be given to new ${i.options.getBoolean('bots') ? 'bots' : 'members'}.`)] });
    }
    if (sub === 'remove') {
      await updateGuild(i.guild.id, { $pull: { 'autorole.bots': role.id, 'autorole.humans': role.id } });
      return i.reply({ embeds: [success(`${role} removed from autoroles.`)] });
    }
    const s = await getGuild(i.guild.id);
    return i.reply({ embeds: [embed(`**Humans:** ${s.autorole.humans.map((r) => `<@&${r}>`).join(' ') || 'none'}\n**Bots:** ${s.autorole.bots.map((r) => `<@&${r}>`).join(' ') || 'none'}`).setTitle('Autoroles')] });
  },
};

/* ───────────── Autoresponder ───────────── */
const autoresponder = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('autoresponder').setDescription('Automatic replies to trigger words').setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('add').setDescription('Add an autoresponder')
      .addStringOption((o) => o.setName('trigger').setDescription('Trigger text').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('response').setDescription('Reply ({user}, {server})').setRequired(true).setMaxLength(1800))
      .addStringOption((o) => o.setName('match').setDescription('Match mode').addChoices({ name: 'Contains', value: 'contains' }, { name: 'Exact', value: 'exact' }, { name: 'Starts with', value: 'startswith' })))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove an autoresponder').addStringOption((o) => o.setName('trigger').setDescription('Trigger').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List autoresponders')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'add') {
      const s = await getGuild(i.guild.id);
      if (s.autoresponders.length >= 50) return fail(i, 'Limit of 50 autoresponders reached.');
      await updateGuild(i.guild.id, { $pull: { autoresponders: { trigger: i.options.getString('trigger') } } });
      await updateGuild(i.guild.id, { $push: { autoresponders: { trigger: i.options.getString('trigger'), response: i.options.getString('response'), match: i.options.getString('match') || 'contains' } } });
      return i.reply({ embeds: [success(`Autoresponder for \`${i.options.getString('trigger')}\` saved.`)] });
    }
    if (sub === 'remove') {
      await updateGuild(i.guild.id, { $pull: { autoresponders: { trigger: i.options.getString('trigger') } } });
      return i.reply({ embeds: [success('Removed.')] });
    }
    const s = await getGuild(i.guild.id);
    return i.reply({ embeds: [embed(s.autoresponders.map((a) => `\`${a.trigger}\` (${a.match}) → ${a.response.slice(0, 60)}`).join('\n') || 'None.').setTitle('💬 Autoresponders')] });
  },
};

/* ───────────── Sticky messages ───────────── */
const sticky = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('sticky').setDescription('Keep a message at the bottom of a channel').setDefaultMemberPermissions(P.ManageMessages)
    .addSubcommand((s) => s.setName('set').setDescription('Set the sticky message here').addStringOption((o) => o.setName('message').setDescription('Content').setRequired(true).setMaxLength(1800)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove the sticky message here')),
  async execute(i) {
    const s = await getGuild(i.guild.id);
    const existing = s.sticky.find((x) => x.channelId === i.channel.id);
    if (existing?.lastMessageId) await i.channel.messages.delete(existing.lastMessageId).catch(() => null);
    await updateGuild(i.guild.id, { $pull: { sticky: { channelId: i.channel.id } } });
    if (i.options.getSubcommand() === 'remove') return i.reply({ embeds: [success('Sticky removed.')], flags: 64 });
    const sent = await i.channel.send({ content: `📌 **Sticky message**\n${i.options.getString('message')}` });
    await updateGuild(i.guild.id, { $push: { sticky: { channelId: i.channel.id, content: i.options.getString('message'), lastMessageId: sent.id } } });
    return i.reply({ embeds: [success('Sticky set.')], flags: 64 });
  },
};

/* ───────────── Counting ───────────── */
const counting = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('counting').setDescription('Counting game channel')
    .addSubcommand((s) => s.setName('set').setDescription('Set the counting channel (admin)').addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable counting (admin)'))
    .addSubcommand((s) => s.setName('status').setDescription('Current count and high score')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub !== 'status' && !i.member.permissions.has(P.ManageGuild)) return fail(i, 'You need Manage Server.');
    if (sub === 'set') {
      await updateGuild(i.guild.id, { $set: { 'counting.channel': i.options.getChannel('channel').id, 'counting.current': 0, 'counting.lastUser': null } });
      await i.options.getChannel('channel').send('🔢 Counting starts now! Type **1**.').catch(() => null);
      return i.reply({ embeds: [success(`Counting enabled in ${i.options.getChannel('channel')}.`)] });
    }
    if (sub === 'disable') {
      await updateGuild(i.guild.id, { $set: { 'counting.channel': null } });
      return i.reply({ embeds: [success('Counting disabled.')] });
    }
    const c = (await getGuild(i.guild.id)).counting;
    return i.reply({ embeds: [embed(`**Channel:** ${c.channel ? `<#${c.channel}>` : 'not set'}\n**Current:** ${c.current}\n**High score:** ${c.highScore}`).setTitle('🔢 Counting')] });
  },
};

/* ───────────── Booster perks ───────────── */
const booster = {
  category: 'engagement',
  data: new SlashCommandBuilder()
    .setName('booster').setDescription('Server booster perks')
    .addSubcommand((s) => s.setName('config').setDescription('Boost announcements (admin)')
      .addChannelOption((o) => o.setName('channel').setDescription('Announcement channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('message').setDescription('Vars: {user} {username} {server} {boosts}'))
      .addBooleanOption((o) => o.setName('custom_roles').setDescription('Let boosters create their own role'))
      .addRoleOption((o) => o.setName('anchor_role').setDescription('Booster roles are placed above this role')))
    .addSubcommand((s) => s.setName('role').setDescription('Create/update your personal booster role')
      .addStringOption((o) => o.setName('name').setDescription('Role name').setRequired(true).setMaxLength(50))
      .addStringOption((o) => o.setName('color').setDescription('Hex color e.g. #ff66cc')))
    .addSubcommand((s) => s.setName('deleterole').setDescription('Delete your personal booster role')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const s = await getGuild(i.guild.id);
    if (sub === 'config') {
      if (!i.member.permissions.has(P.ManageGuild)) return fail(i, 'You need Manage Server.');
      const set = {};
      if (i.options.getChannel('channel')) set['booster.channel'] = i.options.getChannel('channel').id;
      if (i.options.getString('message')) set['booster.message'] = i.options.getString('message');
      if (i.options.getBoolean('custom_roles') !== null) set['booster.customRoles'] = i.options.getBoolean('custom_roles');
      if (i.options.getRole('anchor_role')) set['booster.anchorRole'] = i.options.getRole('anchor_role').id;
      await updateGuild(i.guild.id, { $set: set });
      return i.reply({ embeds: [success('Booster settings saved.')] });
    }
    if (!i.member.premiumSince) return fail(i, 'This perk is only for server boosters. 💎');
    if (!s.booster.customRoles) return fail(i, 'Custom booster roles are disabled here.');
    const doc = await getMember(i.guild.id, i.user.id);
    const existing = doc.boosterRole && i.guild.roles.cache.get(doc.boosterRole);
    if (sub === 'deleterole') {
      await existing?.delete('Booster removed their role').catch(() => null);
      doc.boosterRole = null;
      await doc.save();
      return i.reply({ embeds: [success('Your booster role was deleted.')] });
    }
    const colorRaw = i.options.getString('color');
    const color = colorRaw && /^#?[0-9a-f]{6}$/i.test(colorRaw) ? parseInt(colorRaw.replace('#', ''), 16) : undefined;
    if (existing) {
      await existing.edit({ name: i.options.getString('name'), color });
    } else {
      const anchor = s.booster.anchorRole && i.guild.roles.cache.get(s.booster.anchorRole);
      const role = await i.guild.roles.create({ name: i.options.getString('name'), color, position: anchor ? anchor.position + 1 : undefined, reason: `Booster role for ${i.user.tag}` });
      await i.member.roles.add(role);
      doc.boosterRole = role.id;
      await doc.save();
    }
    return i.reply({ embeds: [success('💎 Your booster role is ready!')] });
  },
};

/* ───────────── Economy ───────────── */
const balance = {
  category: 'economy',
  data: new SlashCommandBuilder().setName('balance').setDescription('Check coins').addUserOption((o) => o.setName('user').setDescription('User')),
  async execute(i) {
    const u = i.options.getUser('user') || i.user;
    const d = await getMember(i.guild.id, u.id);
    return i.reply({ embeds: [embed(`🪙 ${u} has **${d.coins.toLocaleString()}** coins.`)] });
  },
};
const daily = {
  category: 'economy',
  data: new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins'),
  async execute(i) {
    const d = await getMember(i.guild.id, i.user.id);
    const next = d.lastDaily ? d.lastDaily.getTime() + 86400000 : 0;
    if (Date.now() < next) return fail(i, `Come back <t:${Math.floor(next / 1000)}:R>.`);
    const amount = 250 + Math.floor(Math.random() * 251) + (i.member.premiumSince ? 250 : 0);
    d.coins += amount;
    d.lastDaily = new Date();
    await d.save();
    return i.reply({ embeds: [success(`You claimed **${amount}** coins${i.member.premiumSince ? ' (incl. 💎 booster bonus)' : ''}! Balance: **${d.coins.toLocaleString()}**`)] });
  },
};
const give = {
  category: 'economy',
  data: new SlashCommandBuilder().setName('give').setDescription('Give coins to someone')
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  async execute(i) {
    const to = i.options.getUser('user');
    const amount = i.options.getInteger('amount');
    if (to.bot || to.id === i.user.id) return fail(i, 'Invalid recipient.');
    const res = await Member.findOneAndUpdate({ guildId: i.guild.id, userId: i.user.id, coins: { $gte: amount } }, { $inc: { coins: -amount } });
    if (!res) return fail(i, 'You don\'t have enough coins.');
    await Member.updateOne({ guildId: i.guild.id, userId: to.id }, { $inc: { coins: amount } }, { upsert: true });
    return i.reply({ embeds: [success(`Sent **${amount}** coins to ${to}.`)] });
  },
};

module.exports = { commands: [rank, leaderboard, levels, birthday, afkCmd, autorole, autoresponder, sticky, counting, booster, balance, daily, give] };

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../utils/db');
const { success, fail, embed } = require('../utils/helpers');
const { startLockdown, endLockdown } = require('../modules/lockdown');

const onOff = (v) => (v ? '🟢 On' : '🔴 Off');
const LIMIT_KEYS = ['ban', 'kick', 'channelCreate', 'channelDelete', 'roleCreate', 'roleDelete', 'webhookCreate', 'emojiDelete'];
const AN_TOGGLES = { antiBotAdd: 'Anti bot add', antiPrune: 'Anti prune', antiMemberUpdate: 'Anti member/role update', antiGuildUpdate: 'Anti vanity change', autoLockdown: 'Auto lockdown on trigger' };
const AM_FILTERS = ['spam', 'caps', 'links', 'invites', 'mentions', 'emoji'];

/** Antinuke & whitelist are restricted to the server owner (and bot owners). */
const isOwner = (i) => i.user.id === i.guild.ownerId || require('../config').owners.includes(i.user.id);

const antinuke = {
  category: 'security',
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Configure antinuke protection (server owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('enable').setDescription('Enable antinuke'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable antinuke'))
    .addSubcommand((s) => s.setName('status').setDescription('Show antinuke configuration'))
    .addSubcommand((s) =>
      s.setName('punishment').setDescription('What to do to a nuker')
        .addStringOption((o) => o.setName('type').setDescription('Punishment').setRequired(true).addChoices({ name: 'Ban', value: 'ban' }, { name: 'Kick', value: 'kick' }, { name: 'Strip roles', value: 'strip' }))
    )
    .addSubcommand((s) =>
      s.setName('limit').setDescription('Set an action limit within the time window')
        .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices(...LIMIT_KEYS.map((k) => ({ name: k, value: k }))))
        .addIntegerOption((o) => o.setName('count').setDescription('Max actions before punishment').setRequired(true).setMinValue(1).setMaxValue(50))
    )
    .addSubcommand((s) =>
      s.setName('window').setDescription('Set the time window in seconds')
        .addIntegerOption((o) => o.setName('seconds').setDescription('Seconds').setRequired(true).setMinValue(3).setMaxValue(300))
    )
    .addSubcommand((s) =>
      s.setName('toggle').setDescription('Toggle a protection')
        .addStringOption((o) => o.setName('feature').setDescription('Feature').setRequired(true).addChoices(...Object.entries(AN_TOGGLES).map(([value, name]) => ({ name, value }))))
    )
    .addSubcommand((s) =>
      s.setName('logs').setDescription('Channel for antinuke alerts')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    ),
  async execute(i) {
    if (!isOwner(i)) return fail(i, 'Only the server owner can configure antinuke.');
    const sub = i.options.getSubcommand();
    const g = i.guild.id;
    if (sub === 'enable' || sub === 'disable') {
      await updateGuild(g, { $set: { 'antinuke.enabled': sub === 'enable' } });
      const extra = sub === 'enable' ? '\nMake sure my role is **at the top** of the role list and I have Administrator so I can stop attackers.' : '';
      return i.reply({ embeds: [success(`Antinuke ${sub}d.${extra}`)] });
    }
    if (sub === 'punishment') {
      await updateGuild(g, { $set: { 'antinuke.punishment': i.options.getString('type') } });
      return i.reply({ embeds: [success(`Punishment set to **${i.options.getString('type')}**.`)] });
    }
    if (sub === 'limit') {
      const k = i.options.getString('action');
      await updateGuild(g, { $set: { [`antinuke.limits.${k}`]: i.options.getInteger('count') } });
      return i.reply({ embeds: [success(`\`${k}\` limit set to **${i.options.getInteger('count')}**.`)] });
    }
    if (sub === 'window') {
      await updateGuild(g, { $set: { 'antinuke.windowSeconds': i.options.getInteger('seconds') } });
      return i.reply({ embeds: [success(`Window set to **${i.options.getInteger('seconds')}s**.`)] });
    }
    if (sub === 'toggle') {
      const f = i.options.getString('feature');
      const s = await getGuild(g);
      await updateGuild(g, { $set: { [`antinuke.${f}`]: !s.antinuke[f] } });
      return i.reply({ embeds: [success(`${AN_TOGGLES[f]}: ${onOff(!s.antinuke[f])}`)] });
    }
    if (sub === 'logs') {
      await updateGuild(g, { $set: { 'antinuke.logChannel': i.options.getChannel('channel').id } });
      return i.reply({ embeds: [success(`Antinuke alerts will go to ${i.options.getChannel('channel')}.`)] });
    }
    const s = (await getGuild(g)).antinuke;
    const e = new EmbedBuilder()
      .setColor(s.enabled ? 0x2ecc71 : 0xe74c3c)
      .setTitle('🛡️ Antinuke')
      .setDescription(`**Status:** ${onOff(s.enabled)}\n**Punishment:** ${s.punishment}\n**Window:** ${s.windowSeconds}s\n**Alerts:** ${s.logChannel ? `<#${s.logChannel}>` : 'mod log / owner DM'}`)
      .addFields(
        { name: 'Limits', value: LIMIT_KEYS.map((k) => `\`${k}\`: ${s.limits[k]}`).join('\n'), inline: true },
        { name: 'Protections', value: Object.entries(AN_TOGGLES).map(([k, n]) => `${n}: ${onOff(s[k])}`).join('\n'), inline: true },
        { name: 'Whitelisted', value: s.whitelist.length ? s.whitelist.map((id) => `<@${id}>`).join(', ') : 'Nobody' }
      );
    return i.reply({ embeds: [e] });
  },
};

const whitelist = {
  category: 'security',
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Users/bots that antinuke & automod ignore (server owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('add').setDescription('Whitelist a user or bot').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Unwhitelist a user or bot').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Show the whitelist')),
  async execute(i) {
    if (!isOwner(i)) return fail(i, 'Only the server owner can manage the whitelist.');
    const sub = i.options.getSubcommand();
    const user = i.options.getUser('user');
    if (sub === 'add') {
      await updateGuild(i.guild.id, { $addToSet: { 'antinuke.whitelist': user.id } });
      return i.reply({ embeds: [success(`${user} is now whitelisted.`)] });
    }
    if (sub === 'remove') {
      await updateGuild(i.guild.id, { $pull: { 'antinuke.whitelist': user.id } });
      return i.reply({ embeds: [success(`${user} removed from the whitelist.`)] });
    }
    const wl = (await getGuild(i.guild.id)).antinuke.whitelist;
    return i.reply({ embeds: [embed(wl.length ? wl.map((id, n) => `${n + 1}. <@${id}> \`${id}\``).join('\n') : 'Whitelist is empty.').setTitle('Whitelist')] });
  },
};
// alias requested in feature list
const unwhitelist = {
  category: 'security',
  data: new SlashCommandBuilder()
    .setName('unwhitelist')
    .setDescription('Remove a user from the whitelist (server owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
  async execute(i) {
    if (!isOwner(i)) return fail(i, 'Only the server owner can manage the whitelist.');
    const user = i.options.getUser('user');
    await updateGuild(i.guild.id, { $pull: { 'antinuke.whitelist': user.id } });
    return i.reply({ embeds: [success(`${user} removed from the whitelist.`)] });
  },
};

const lockdown = {
  category: 'security',
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Emergency lockdown: stop everyone from talking or joining voice')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('start').setDescription('Lock every channel').addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((s) => s.setName('end').setDescription('Restore every channel').addStringOption((o) => o.setName('reason').setDescription('Reason'))),
  async execute(i) {
    await i.deferReply();
    const reason = i.options.getString('reason') || undefined;
    if (i.options.getSubcommand() === 'start') {
      const r = await startLockdown(i.guild, reason ? `Lockdown: ${reason}` : undefined);
      return i.editReply({ embeds: [r.already ? embed('Server is already locked down.') : success(`🔒 Locked **${r.count}** channels. Use \`/lockdown end\` to restore.`)] });
    }
    const r = await endLockdown(i.guild, reason);
    return i.editReply({ embeds: [r.already ? embed('Server is not locked down.') : success(`🔓 Restored **${r.count}** channels.`)] });
  },
};

const automod = {
  category: 'security',
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure automod filters')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('enable').setDescription('Enable automod'))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable automod'))
    .addSubcommand((s) => s.setName('status').setDescription('Show automod config'))
    .addSubcommand((s) =>
      s.setName('filter').setDescription('Toggle a filter')
        .addStringOption((o) => o.setName('name').setDescription('Filter').setRequired(true).addChoices(...AM_FILTERS.map((f) => ({ name: f, value: f }))))
        .addBooleanOption((o) => o.setName('enabled').setDescription('On or off').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('action').setDescription('What happens on violation')
        .addStringOption((o) => o.setName('type').setDescription('Action').setRequired(true).addChoices({ name: 'Delete only', value: 'delete' }, { name: 'Delete + warn', value: 'warn' }, { name: 'Delete + timeout', value: 'timeout' }))
        .addIntegerOption((o) => o.setName('timeout_seconds').setDescription('Timeout length').setMinValue(10).setMaxValue(2419200))
    )
    .addSubcommand((s) =>
      s.setName('threshold').setDescription('Tune limits')
        .addIntegerOption((o) => o.setName('spam_messages').setDescription('Messages allowed per interval').setMinValue(2).setMaxValue(30))
        .addIntegerOption((o) => o.setName('spam_seconds').setDescription('Spam interval seconds').setMinValue(2).setMaxValue(60))
        .addIntegerOption((o) => o.setName('caps_percent').setDescription('Caps % that triggers').setMinValue(30).setMaxValue(100))
        .addIntegerOption((o) => o.setName('max_mentions').setDescription('Max mentions per message').setMinValue(1).setMaxValue(50))
        .addIntegerOption((o) => o.setName('max_emoji').setDescription('Max emoji per message').setMinValue(1).setMaxValue(100))
    )
    .addSubcommand((s) =>
      s.setName('ignore').setDescription('Toggle ignoring a channel or role')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel'))
        .addRoleOption((o) => o.setName('role').setDescription('Role'))
    )
    .addSubcommand((s) =>
      s.setName('allowlink').setDescription('Toggle an allowed domain for the link filter')
        .addStringOption((o) => o.setName('domain').setDescription('e.g. youtube.com').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('badword').setDescription('Toggle a blocked word')
        .addStringOption((o) => o.setName('word').setDescription('Word').setRequired(true))
    ),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const g = i.guild.id;
    const s = await getGuild(g);
    const toggleIn = async (path, arr, value) =>
      updateGuild(g, arr.includes(value) ? { $pull: { [path]: value } } : { $addToSet: { [path]: value } });

    switch (sub) {
      case 'enable':
      case 'disable':
        await updateGuild(g, { $set: { 'automod.enabled': sub === 'enable' } });
        return i.reply({ embeds: [success(`Automod ${sub}d.`)] });
      case 'filter': {
        const n = i.options.getString('name');
        await updateGuild(g, { $set: { [`automod.${n}.enabled`]: i.options.getBoolean('enabled') } });
        return i.reply({ embeds: [success(`Filter \`${n}\`: ${onOff(i.options.getBoolean('enabled'))}`)] });
      }
      case 'action': {
        const set = { 'automod.action': i.options.getString('type') };
        const t = i.options.getInteger('timeout_seconds');
        if (t) set['automod.timeoutSeconds'] = t;
        await updateGuild(g, { $set: set });
        return i.reply({ embeds: [success(`Automod action: **${set['automod.action']}**${t ? ` (${t}s)` : ''}.`)] });
      }
      case 'threshold': {
        const map = { spam_messages: 'automod.spam.maxMessages', spam_seconds: 'automod.spam.intervalSeconds', caps_percent: 'automod.caps.percent', max_mentions: 'automod.mentions.max', max_emoji: 'automod.emoji.max' };
        const set = {};
        for (const [opt, path] of Object.entries(map)) {
          const v = i.options.getInteger(opt);
          if (v !== null) set[path] = v;
        }
        if (!Object.keys(set).length) return fail(i, 'Give at least one value.');
        await updateGuild(g, { $set: set });
        return i.reply({ embeds: [success('Thresholds updated.')] });
      }
      case 'ignore': {
        const ch = i.options.getChannel('channel');
        const role = i.options.getRole('role');
        if (!ch && !role) return fail(i, 'Pick a channel or role.');
        if (ch) await toggleIn('automod.ignoredChannels', s.automod.ignoredChannels, ch.id);
        if (role) await toggleIn('automod.ignoredRoles', s.automod.ignoredRoles, role.id);
        return i.reply({ embeds: [success('Ignore list updated.')] });
      }
      case 'allowlink': {
        const d = i.options.getString('domain').toLowerCase();
        await toggleIn('automod.links.allowed', s.automod.links.allowed, d);
        return i.reply({ embeds: [success(`\`${d}\` ${s.automod.links.allowed.includes(d) ? 'removed from' : 'added to'} allowed domains.`)] });
      }
      case 'badword': {
        const w = i.options.getString('word').toLowerCase();
        await toggleIn('automod.badWords', s.automod.badWords, w);
        return i.reply({ embeds: [success(`Blocked word list updated.`)], flags: 64 });
      }
      default: {
        const a = s.automod;
        const e = new EmbedBuilder()
          .setColor(a.enabled ? 0x2ecc71 : 0xe74c3c)
          .setTitle('🤖 Automod')
          .setDescription(`**Status:** ${onOff(a.enabled)}\n**Action:** ${a.action}${a.action === 'timeout' ? ` (${a.timeoutSeconds}s)` : ''}`)
          .addFields(
            { name: 'Filters', value: [
              `Spam: ${onOff(a.spam.enabled)} (${a.spam.maxMessages}/${a.spam.intervalSeconds}s)`,
              `Caps: ${onOff(a.caps.enabled)} (${a.caps.percent}%)`,
              `Links: ${onOff(a.links.enabled)}`,
              `Invites: ${onOff(a.invites.enabled)}`,
              `Mentions: ${onOff(a.mentions.enabled)} (max ${a.mentions.max})`,
              `Emoji: ${onOff(a.emoji.enabled)} (max ${a.emoji.max})`,
              `Blocked words: ${a.badWords.length}`,
            ].join('\n') },
            { name: 'Ignored', value: [...a.ignoredChannels.map((c) => `<#${c}>`), ...a.ignoredRoles.map((r) => `<@&${r}>`)].join(' ') || 'None' }
          );
        return i.reply({ embeds: [e] });
      }
    }
  },
};

module.exports = { commands: [antinuke, whitelist, unwhitelist, lockdown, automod] };

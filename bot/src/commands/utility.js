const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, version: djsVersion } = require('discord.js');
const config = require('../config');
const { formatDuration } = require('../utils/helpers');

const CATEGORIES = {
  security: '🛡️ Security',
  moderation: '🔨 Moderation',
  management: '⚙️ Management',
  engagement: '🎉 Engagement',
  games: '🎮 Games',
  economy: '🪙 Economy',
  utility: '🔧 Utility',
};

function describe(cmd) {
  const subs = (cmd.data.options || []).filter((o) => o.toJSON().type === 1);
  if (subs.length) return subs.map((s) => `\`/${cmd.data.name} ${s.name}\` — ${s.description}`).join('\n');
  return `\`/${cmd.data.name}\` — ${cmd.data.description}`;
}

const help = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('help').setDescription('List all commands'),
  async execute(i, client) {
    const byCat = {};
    for (const cmd of client.commands.values()) (byCat[cmd.category || 'utility'] ||= []).push(cmd);
    const home = new EmbedBuilder()
      .setColor(config.color)
      .setTitle(`${config.botName} — Help`)
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription(`Pick a category below.\n${config.dashboardUrl ? `\n🌐 **Dashboard:** ${config.dashboardUrl}` : ''}`)
      .addFields(Object.entries(CATEGORIES).filter(([k]) => byCat[k]).map(([k, label]) => ({ name: label, value: `${byCat[k].length} commands`, inline: true })));
    const menu = new StringSelectMenuBuilder()
      .setCustomId('help-cat')
      .setPlaceholder('Choose a category')
      .addOptions(Object.entries(CATEGORIES).filter(([k]) => byCat[k]).map(([k, label]) => ({ label: label.split(' ').slice(1).join(' '), value: k, emoji: label.split(' ')[0] })));
    await i.reply({ embeds: [home], components: [new ActionRowBuilder().addComponents(menu)] });
    const msg = await i.fetchReply();
    const col = msg.createMessageComponentCollector({ filter: (x) => x.user.id === i.user.id, idle: 120_000 });
    col.on('collect', (x) => {
      const cat = x.values[0];
      const text = byCat[cat].map(describe).join('\n');
      x.update({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(CATEGORIES[cat]).setDescription(text.slice(0, 4000))] });
    });
    col.on('end', () => i.editReply({ components: [] }).catch(() => null));
  },
};

const ping = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('ping').setDescription('Check latency'),
  async execute(i, client) {
    const start = Date.now();
    await i.reply('🏓 Pinging…');
    return i.editReply(`🏓 **API:** ${Date.now() - start}ms • **Gateway:** ${client.ws.ping}ms`);
  },
};

const botinfo = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('botinfo').setDescription('About the bot'),
  async execute(i, client) {
    const e = new EmbedBuilder()
      .setColor(config.color)
      .setTitle(config.botName)
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: 'Servers', value: client.guilds.cache.size.toLocaleString(), inline: true },
        { name: 'Users', value: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toLocaleString(), inline: true },
        { name: 'Commands', value: String(client.commands.size), inline: true },
        { name: 'Uptime', value: formatDuration(Date.now() - client.stats.startedAt), inline: true },
        { name: 'Memory', value: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`, inline: true },
        { name: 'Versions', value: `Node ${process.version} • discord.js ${djsVersion}` }
      );
    const buttons = [];
    buttons.push(new ButtonBuilder().setLabel('Invite').setStyle(ButtonStyle.Link).setURL(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`));
    if (config.dashboardUrl) buttons.push(new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL(config.dashboardUrl));
    if (config.supportUrl) buttons.push(new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(config.supportUrl));
    return i.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(buttons)] });
  },
};

const serverinfo = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Info about this server'),
  async execute(i) {
    const g = i.guild;
    const e = new EmbedBuilder()
      .setColor(config.color)
      .setTitle(g.name)
      .setThumbnail(g.iconURL())
      .addFields(
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Members', value: g.memberCount.toLocaleString(), inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Channels', value: String(g.channels.cache.size), inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (tier ${g.premiumTier})`, inline: true }
      )
      .setFooter({ text: `ID: ${g.id}` });
    return i.reply({ embeds: [e] });
  },
};

const userinfo = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('userinfo').setDescription('Info about a user').addUserOption((o) => o.setName('user').setDescription('User')),
  async execute(i) {
    const u = i.options.getUser('user') || i.user;
    const m = i.options.getMember('user') || (u.id === i.user.id ? i.member : null);
    const e = new EmbedBuilder()
      .setColor(m?.displayColor || config.color)
      .setAuthor({ name: u.tag, iconURL: u.displayAvatarURL() })
      .setThumbnail(u.displayAvatarURL({ size: 256 }))
      .addFields({ name: 'Account created', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true });
    if (m) {
      e.addFields(
        { name: 'Joined', value: `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Booster', value: m.premiumSince ? `since <t:${Math.floor(m.premiumSinceTimestamp / 1000)}:R>` : 'No', inline: true },
        { name: `Roles (${m.roles.cache.size - 1})`, value: m.roles.cache.filter((r) => r.id !== i.guild.id).sort((a, b) => b.position - a.position).map((r) => r.toString()).slice(0, 20).join(' ') || 'None' }
      );
    }
    return i.reply({ embeds: [e.setFooter({ text: `ID: ${u.id}` })] });
  },
};

const avatar = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('avatar').setDescription("Show someone's avatar").addUserOption((o) => o.setName('user').setDescription('User')),
  async execute(i) {
    const u = i.options.getUser('user') || i.user;
    return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(`${u.username}'s avatar`).setImage(u.displayAvatarURL({ size: 1024 }))] });
  },
};

const dashboard = {
  category: 'utility',
  data: new SlashCommandBuilder().setName('dashboard').setDescription('Open the web dashboard'),
  async execute(i) {
    if (!config.dashboardUrl) return i.reply({ content: 'The dashboard URL is not configured.', flags: 64 });
    return i.reply({
      content: `🌐 Manage **${i.guild?.name || 'your server'}** on the dashboard:`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Open dashboard').setStyle(ButtonStyle.Link).setURL(`${config.dashboardUrl}${i.guild ? `/dashboard/${i.guild.id}` : ''}`))],
    });
  },
};

module.exports = { commands: [help, ping, botinfo, serverinfo, userinfo, avatar, dashboard] };

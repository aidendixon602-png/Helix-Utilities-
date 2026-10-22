const { getGuild, updateGuild, invalidateGuild, Guild } = require('../utils/db');
const automod = require('../modules/automod');
const leveling = require('../modules/leveling');
const afk = require('../modules/afk');
const log = require('../utils/logger');

const stickyTimers = new Map();

async function handleAfk(message) {
  const g = message.guild.id;
  const back = await afk.clear(g, message.author.id);
  if (back) {
    const mins = Math.round((Date.now() - new Date(back.since).getTime()) / 60000);
    message.reply(`👋 Welcome back ${message.author}! You were AFK for ${mins < 1 ? 'less than a minute' : `${mins} minute(s)`}.`).then((m) => setTimeout(() => m.delete().catch(() => null), 8000)).catch(() => null);
    if (message.member?.manageable && message.member.nickname?.startsWith('[AFK] '))
      message.member.setNickname(message.member.nickname.slice(6)).catch(() => null);
  }
  const notes = [];
  for (const u of message.mentions.users.values()) {
    const a = afk.get(g, u.id);
    if (a) notes.push(`💤 **${u.username}** is AFK: ${a.reason || 'AFK'} — <t:${Math.floor(new Date(a.since).getTime() / 1000)}:R>`);
  }
  if (notes.length) message.reply({ content: notes.slice(0, 5).join('\n'), allowedMentions: { parse: [] } }).catch(() => null);
}

async function handleCounting(message, s) {
  if (message.channel.id !== s.counting.channel) return false;
  const n = Number(message.content.trim().split(/\s+/)[0]);
  if (!Number.isInteger(n)) return true; // ignore chatter, but stop other handlers
  const expected = s.counting.current + 1;
  if (n !== expected || message.author.id === s.counting.lastUser) {
    await message.react('❌').catch(() => null);
    const why = n !== expected ? `The next number was **${expected}**.` : 'You can\'t count twice in a row.';
    await message.channel.send(`💥 ${message.author} ruined it at **${s.counting.current}**! ${why} Start again from **1**.`).catch(() => null);
    await updateGuild(message.guild.id, { $set: { 'counting.current': 0, 'counting.lastUser': null } });
    return true;
  }
  const high = Math.max(s.counting.highScore, n);
  await updateGuild(message.guild.id, { $set: { 'counting.current': n, 'counting.lastUser': message.author.id, 'counting.highScore': high } });
  await message.react(n === high && n % 100 === 0 ? '🎉' : '✅').catch(() => null);
  return true;
}

async function handleAutoresponders(message, s) {
  const content = message.content.toLowerCase();
  const hit = s.autoresponders.find((a) => {
    const t = a.trigger.toLowerCase();
    if (a.match === 'exact') return content === t;
    if (a.match === 'startswith') return content.startsWith(t);
    return content.includes(t);
  });
  if (hit) await message.channel.send({ content: hit.response.replace(/\{user\}/g, `${message.author}`).replace(/\{server\}/g, message.guild.name) }).catch(() => null);
}

function handleSticky(message, s) {
  const sticky = s.sticky.find((x) => x.channelId === message.channel.id);
  if (!sticky) return;
  clearTimeout(stickyTimers.get(message.channel.id));
  stickyTimers.set(
    message.channel.id,
    setTimeout(async () => {
      const fresh = (await getGuild(message.guild.id)).sticky.find((x) => x.channelId === message.channel.id);
      if (!fresh) return;
      if (fresh.lastMessageId) await message.channel.messages.delete(fresh.lastMessageId).catch(() => null);
      const sent = await message.channel.send({ content: `📌 **Sticky message**\n${fresh.content}` }).catch(() => null);
      if (sent) {
        await Guild.updateOne({ guildId: message.guild.id, 'sticky.channelId': message.channel.id }, { $set: { 'sticky.$.lastMessageId': sent.id } }).catch(() => null);
        invalidateGuild(message.guild.id);
      }
    }, 2500)
  );
}

module.exports = [
  {
    name: 'clientReady',
    once: true,
    execute: () => afk.load().catch((e) => log.warn('AFK load failed', e.message)),
  },
  {
    name: 'messageCreate',
    async execute(message, client) {
      if (!message.guild || message.author.bot || message.webhookId) return;
      client.stats.messagesSeen++;
      const s = await getGuild(message.guild.id);

      if (await automod.run(message, s)) return;
      await handleAfk(message);
      if (s.counting.channel && (await handleCounting(message, s))) return;
      if (s.autoresponders.length) await handleAutoresponders(message, s);
      if (s.sticky.length) handleSticky(message, s);
      await leveling.handleMessage(message, s);
    },
  },
];

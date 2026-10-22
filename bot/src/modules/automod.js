const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getMember } = require('../utils/db');
const { sendLog } = require('./logging');

const INVITE_RE = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[\w-]+/i;
const LINK_RE = /https?:\/\/[^\s<]+/gi;
const EMOJI_RE = /<a?:\w+:\d+>|\p{Extended_Pictographic}/gu;

const spamTracker = new Map(); // guild:user -> timestamps[]

/** Returns a reason string if the message breaks a rule, otherwise null. */
function check(message, cfg) {
  const content = message.content || '';

  if (cfg.spam.enabled) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const arr = (spamTracker.get(key) || []).filter((t) => now - t < cfg.spam.intervalSeconds * 1000);
    arr.push(now);
    spamTracker.set(key, arr);
    if (arr.length > cfg.spam.maxMessages) return 'Spamming messages';
  }
  if (cfg.invites.enabled && INVITE_RE.test(content)) return 'Posting Discord invites';
  if (cfg.links.enabled) {
    const links = content.match(LINK_RE) || [];
    const bad = links.some((l) => !cfg.links.allowed.some((d) => l.toLowerCase().includes(d.toLowerCase())));
    if (bad) return 'Posting links';
  }
  if (cfg.mentions.enabled) {
    const count = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
    if (count > cfg.mentions.max) return 'Mass mentions';
  }
  if (cfg.caps.enabled && content.length >= cfg.caps.minLength) {
    const letters = content.replace(/[^a-z]/gi, '');
    if (letters.length >= cfg.caps.minLength) {
      const upper = letters.replace(/[^A-Z]/g, '').length;
      if ((upper / letters.length) * 100 >= cfg.caps.percent) return 'Excessive caps';
    }
  }
  if (cfg.emoji.enabled) {
    const emojis = content.match(EMOJI_RE) || [];
    if (emojis.length > cfg.emoji.max) return 'Emoji spam';
  }
  if (cfg.badWords?.length) {
    const lower = content.toLowerCase();
    if (cfg.badWords.some((w) => w && lower.includes(w.toLowerCase()))) return 'Blocked word';
  }
  return null;
}

async function run(message, settings) {
  const cfg = settings.automod;
  if (!cfg.enabled || !message.member) return false;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (settings.antinuke.whitelist.includes(message.author.id)) return false;
  if (cfg.ignoredChannels.includes(message.channel.id)) return false;
  if (message.member.roles.cache.some((r) => cfg.ignoredRoles.includes(r.id))) return false;

  const reason = check(message, cfg);
  if (!reason) return false;

  await message.delete().catch(() => null);
  const notice = await message.channel
    .send({ content: `${message.author}, your message was removed: **${reason}**.` })
    .catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => null), 5000);

  if (cfg.action === 'timeout' && message.member.moderatable) {
    await message.member.timeout(cfg.timeoutSeconds * 1000, `[Automod] ${reason}`).catch(() => null);
  } else if (cfg.action === 'warn') {
    const m = await getMember(message.guild.id, message.author.id);
    m.warns.push({ id: Date.now().toString(36), moderator: message.client.user.id, reason: `[Automod] ${reason}`, at: new Date() });
    await m.save();
  }

  sendLog(
    message.guild,
    'mod',
    new EmbedBuilder()
      .setTitle('🤖 Automod')
      .setDescription(`**User:** ${message.author} (\`${message.author.id}\`)\n**Channel:** ${message.channel}\n**Rule:** ${reason}\n**Action:** ${cfg.action}`)
      .addFields({ name: 'Content', value: (message.content || '*none*').slice(0, 1000) })
  );
  return true;
}

module.exports = { run, check };

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const config = require('../config');

const embed = (description, color = config.color) => {
  const e = new EmbedBuilder().setColor(color);
  if (description) e.setDescription(description);
  return e;
};
const success = (text) => embed(`✅ ${text}`, 0x2ecc71);
const error = (text) => embed(`❌ ${text}`, 0xe74c3c);
const warn = (text) => embed(`⚠️ ${text}`, 0xf1c40f);

/** Reply or follow up depending on interaction state. */
async function respond(interaction, payload) {
  const data = typeof payload === 'string' ? { content: payload } : payload;
  if (interaction.deferred || interaction.replied) return interaction.followUp(data).catch(() => null);
  return interaction.reply(data).catch(() => null);
}
const fail = (interaction, text) => respond(interaction, { embeds: [error(text)], flags: 64 });

function parseDuration(input) {
  if (!input) return null;
  const v = ms(String(input).replace(/\s+/g, ''));
  return typeof v === 'number' && v > 0 ? v : null;
}

function formatDuration(msValue) {
  if (!msValue || msValue < 0 || !Number.isFinite(msValue)) return '0:00';
  const s = Math.floor(msValue / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function progressBar(current, total, size = 15) {
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(ratio * size);
  return '▬'.repeat(Math.max(filled - 1, 0)) + '🔘' + '▬'.repeat(size - Math.max(filled, 1));
}

function template(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

/**
 * Can `moderator` act on `target`? Checks owner, role hierarchy for both the moderator and the bot.
 * Returns null if OK, otherwise an error string.
 */
function checkHierarchy(guild, moderator, target) {
  if (!target) return null;
  if (target.id === guild.ownerId) return 'You cannot act on the server owner.';
  if (target.id === moderator.id) return 'You cannot act on yourself.';
  const me = guild.members.me;
  if (target.id === me.id) return 'I cannot act on myself.';
  if (moderator.id !== guild.ownerId && target.roles.highest.position >= moderator.roles.highest.position)
    return 'That member has an equal or higher role than you.';
  if (target.roles.highest.position >= me.roles.highest.position)
    return 'That member has an equal or higher role than me. Move my role higher.';
  return null;
}

const isAdmin = (member) => member?.permissions?.has(PermissionFlagsBits.Administrator);
const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

module.exports = {
  embed, success, error, warn, respond, fail, parseDuration, formatDuration, progressBar, template,
  checkHierarchy, isAdmin, chunk, randInt, shuffle, sleep, truncate,
};

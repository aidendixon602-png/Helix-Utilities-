const Member = require('../models/Member');
const { template, randInt } = require('../utils/helpers');

const COOLDOWN = 60_000;
/** XP needed to go from `level` to `level + 1` (same curve as MEE6). */
const xpForLevel = (level) => 5 * level * level + 50 * level + 100;
/** Total XP needed to reach `level` from 0. */
const totalXpFor = (level) => {
  let t = 0;
  for (let l = 0; l < level; l++) t += xpForLevel(l);
  return t;
};
function levelFromXp(xp) {
  let level = 0;
  while (xp >= totalXpFor(level + 1)) level++;
  return level;
}

async function handleMessage(message, settings) {
  const cfg = settings.leveling;
  if (!cfg.enabled || cfg.noXpChannels.includes(message.channel.id)) return;
  const doc = await Member.findOneAndUpdate(
    { guildId: message.guild.id, userId: message.author.id },
    { $setOnInsert: { guildId: message.guild.id, userId: message.author.id }, $inc: { messages: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (doc.lastXpAt && Date.now() - doc.lastXpAt.getTime() < COOLDOWN) return;
  const gain = Math.round(randInt(15, 25) * (cfg.multiplier || 1));
  doc.xp += gain;
  doc.lastXpAt = new Date();
  const newLevel = levelFromXp(doc.xp);
  const leveledUp = newLevel > doc.level;
  doc.level = newLevel;
  await doc.save();
  if (!leveledUp) return;

  // role rewards
  const rewards = [...cfg.rewards].sort((a, b) => a.level - b.level);
  const earned = rewards.filter((r) => r.level <= newLevel);
  if (earned.length && message.member) {
    const give = cfg.stackRewards ? earned : [earned[earned.length - 1]];
    const remove = cfg.stackRewards ? [] : earned.slice(0, -1);
    const valid = (ids) => ids.map((r) => r.roleId).filter((id) => message.guild.roles.cache.get(id)?.editable);
    await message.member.roles.add(valid(give), 'Level reward').catch(() => null);
    if (remove.length) await message.member.roles.remove(valid(remove), 'Level reward').catch(() => null);
  }

  if (cfg.announce === 'off') return;
  const text = template(cfg.message, { user: `${message.author}`, username: message.author.username, level: newLevel, server: message.guild.name });
  if (cfg.announce === 'dm') return message.author.send(text).catch(() => null);
  const ch = cfg.announce === 'channel' && cfg.channel ? message.guild.channels.cache.get(cfg.channel) : message.channel;
  ch?.send(text).catch(() => null);
}

module.exports = { handleMessage, xpForLevel, totalXpFor, levelFromXp };

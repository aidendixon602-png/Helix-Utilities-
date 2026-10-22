const Member = require('../models/Member');

const afk = new Map(); // `${guild}:${user}` -> { reason, since }

async function load() {
  const docs = await Member.find({ 'afk.since': { $ne: null } }, { guildId: 1, userId: 1, afk: 1 }).lean();
  for (const d of docs) if (d.afk?.since) afk.set(`${d.guildId}:${d.userId}`, d.afk);
}

async function set(guildId, userId, reason) {
  const data = { reason, since: new Date() };
  afk.set(`${guildId}:${userId}`, data);
  await Member.updateOne({ guildId, userId }, { $set: { afk: data } }, { upsert: true });
}

async function clear(guildId, userId) {
  const had = afk.get(`${guildId}:${userId}`);
  afk.delete(`${guildId}:${userId}`);
  if (had) await Member.updateOne({ guildId, userId }, { $set: { afk: { reason: null, since: null } } });
  return had;
}

const get = (guildId, userId) => afk.get(`${guildId}:${userId}`);

module.exports = { load, set, clear, get };

const mongoose = require('mongoose');
const Guild = require('../models/Guild');
const Member = require('../models/Member');
const log = require('./logger');

const CACHE_TTL = 60_000;
const cache = new Map(); // guildId -> { data, at }

async function connect(uri) {
  if (!uri) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  log.info('Connected to MongoDB');
}

/** Returns a plain object with every schema default filled in. Cached for 60s. */
async function getGuild(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const doc = await Guild.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const data = doc.toObject({ flattenMaps: true });
  cache.set(guildId, { data, at: Date.now() });
  return data;
}

/** Apply a Mongo update ($set/$push/...) and refresh the cache. */
async function updateGuild(guildId, update) {
  const doc = await Guild.findOneAndUpdate({ guildId }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
  const data = doc.toObject({ flattenMaps: true });
  cache.set(guildId, { data, at: Date.now() });
  return data;
}

function invalidateGuild(guildId) {
  cache.delete(guildId);
}

async function getMember(guildId, userId) {
  return Member.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

module.exports = { connect, getGuild, updateGuild, invalidateGuild, getMember, Guild, Member };

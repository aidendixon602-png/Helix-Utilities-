import mongoose from 'mongoose';
import Guild from './models/Guild.cjs';

let conn = globalThis.__mongoose;
export async function db() {
  if (conn?.readyState === 1) return conn;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!globalThis.__mongoosePromise) globalThis.__mongoosePromise = mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false, maxPoolSize: 5 });
  await globalThis.__mongoosePromise;
  conn = globalThis.__mongoose = mongoose.connection;
  return conn;
}

export async function getSettings(guildId) {
  await db();
  const doc = await Guild.findOneAndUpdate({ guildId }, { $setOnInsert: { guildId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return JSON.parse(JSON.stringify(doc.toObject({ flattenMaps: true })));
}

export async function saveSettings(guildId, $set) {
  await db();
  await Guild.updateOne({ guildId }, { $set }, { upsert: true, runValidators: true });
}

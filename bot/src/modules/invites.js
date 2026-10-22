const { EmbedBuilder } = require('discord.js');
const Member = require('../models/Member');
const { sendLog } = require('./logging');

// guildId -> Map(code -> { uses, inviterId })
const cache = new Map();

async function cacheGuild(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;
  cache.set(guild.id, new Map(invites.map((inv) => [inv.code, { uses: inv.uses, inviterId: inv.inviter?.id }])));
  if (guild.vanityURLCode) {
    const v = await guild.fetchVanityData().catch(() => null);
    if (v) cache.get(guild.id).set(guild.vanityURLCode, { uses: v.uses, inviterId: 'vanity' });
  }
}

async function onJoin(member) {
  const guild = member.guild;
  const before = cache.get(guild.id) || new Map();
  await cacheGuild(guild);
  const after = cache.get(guild.id) || new Map();
  let used = null;
  for (const [code, data] of after) {
    const prev = before.get(code);
    if (data.uses > (prev?.uses ?? 0)) {
      used = { code, ...data };
      break;
    }
  }
  if (!used) return sendLog(guild, 'invite', new EmbedBuilder().setDescription(`📨 ${member} joined — I couldn't determine the invite.`));
  if (used.inviterId === 'vanity') return sendLog(guild, 'invite', new EmbedBuilder().setDescription(`📨 ${member} joined using the **vanity URL**.`));

  const fake = Date.now() - member.user.createdTimestamp < 3 * 86400000 || used.inviterId === member.id;
  const inviter = await Member.findOneAndUpdate(
    { guildId: guild.id, userId: used.inviterId },
    { $inc: fake ? { 'invites.fake': 1 } : { 'invites.regular': 1 }, $setOnInsert: { guildId: guild.id, userId: used.inviterId } },
    { upsert: true, new: true }
  );
  await Member.updateOne({ guildId: guild.id, userId: member.id }, { $set: { inviterId: used.inviterId } }, { upsert: true });
  const total = inviter.invites.regular + inviter.invites.bonus - inviter.invites.left - inviter.invites.fake;
  sendLog(
    guild,
    'invite',
    new EmbedBuilder().setDescription(`📨 ${member} joined using \`${used.code}\` from <@${used.inviterId}> (now **${total}** invites)${fake ? ' — marked as fake (new account)' : ''}`)
  );
}

async function onLeave(member) {
  const doc = await Member.findOne({ guildId: member.guild.id, userId: member.id });
  if (!doc?.inviterId || doc.inviterId === 'vanity') return;
  await Member.updateOne({ guildId: member.guild.id, userId: doc.inviterId }, { $inc: { 'invites.left': 1 } });
}

const total = (inv) => (inv.regular || 0) + (inv.bonus || 0) - (inv.left || 0) - (inv.fake || 0);

module.exports = { cacheGuild, onJoin, onLeave, total, cache };

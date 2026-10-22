const { ChannelType } = require('discord.js');
const { getGuild, updateGuild } = require('../utils/db');
const { template } = require('../utils/helpers');

const tempOwners = new Map(); // channelId -> ownerId

async function onVoiceUpdate(before, after) {
  const guild = after.guild;
  const s = await getGuild(guild.id);

  // joined the hub → create a personal channel
  if (s.jtc.hub && after.channelId === s.jtc.hub && after.member) {
    const hub = guild.channels.cache.get(s.jtc.hub);
    const ch = await guild.channels
      .create({
        name: template(s.jtc.nameTemplate, { user: after.member.displayName }).slice(0, 90),
        type: ChannelType.GuildVoice,
        parent: s.jtc.category || hub?.parentId || null,
        bitrate: hub?.bitrate,
        permissionOverwrites: [{ id: after.member.id, allow: ['ManageChannels', 'MoveMembers', 'Connect', 'Speak'] }],
      })
      .catch(() => null);
    if (!ch) return;
    tempOwners.set(ch.id, after.member.id);
    await updateGuild(guild.id, { $addToSet: { 'jtc.temp': ch.id } });
    await after.member.voice.setChannel(ch).catch(() => ch.delete().catch(() => null));
  }

  // left a temp channel → delete it if empty
  if (before.channelId && before.channelId !== after.channelId && s.jtc.temp.includes(before.channelId)) {
    const ch = guild.channels.cache.get(before.channelId);
    if (!ch || ch.members.size === 0) {
      await ch?.delete('Join-to-create channel empty').catch(() => null);
      tempOwners.delete(before.channelId);
      await updateGuild(guild.id, { $pull: { 'jtc.temp': before.channelId } });
    }
  }
}

/** On startup remove temp channels left empty while the bot was offline. */
async function cleanup(client) {
  for (const guild of client.guilds.cache.values()) {
    const s = await getGuild(guild.id).catch(() => null);
    if (!s?.jtc?.temp?.length) continue;
    const keep = [];
    for (const id of s.jtc.temp) {
      const ch = guild.channels.cache.get(id);
      if (ch && ch.members.size) {
        keep.push(id);
        tempOwners.set(id, ch.members.first().id);
      } else await ch?.delete('Join-to-create cleanup').catch(() => null);
    }
    await updateGuild(guild.id, { $set: { 'jtc.temp': keep } });
  }
}

module.exports = { onVoiceUpdate, cleanup, tempOwners };

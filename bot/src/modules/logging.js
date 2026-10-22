const { EmbedBuilder } = require('discord.js');
const { getGuild } = require('../utils/db');

const COLORS = { mod: 0xe67e22, message: 0x3498db, member: 0x2ecc71, server: 0x9b59b6, voice: 0x1abc9c, invite: 0xf1c40f };

/** Send an embed to the configured log channel of `type` (mod|message|member|server|voice|invite). */
async function sendLog(guild, type, embedOrOptions) {
  if (!guild) return;
  try {
    const settings = await getGuild(guild.id);
    const channelId = settings.logs?.[type];
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;
    const e = embedOrOptions instanceof EmbedBuilder ? embedOrOptions : new EmbedBuilder(embedOrOptions);
    if (!e.data.color) e.setColor(COLORS[type] || 0x95a5a6);
    if (!e.data.timestamp) e.setTimestamp();
    await channel.send({ embeds: [e] });
  } catch {
    /* never let logging crash anything */
  }
}

/** Standard moderation log entry. */
function modLog(guild, { action, target, moderator, reason, extra }) {
  const e = new EmbedBuilder()
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: 'User', value: target ? `${target} (\`${target.id}\`)` : 'Unknown', inline: true },
      { name: 'Moderator', value: moderator ? `${moderator}` : 'System', inline: true },
      { name: 'Reason', value: reason || 'No reason provided' }
    );
  if (extra) e.addFields({ name: 'Details', value: extra });
  return sendLog(guild, 'mod', e);
}

module.exports = { sendLog, modLog };

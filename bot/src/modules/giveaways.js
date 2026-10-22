const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Giveaway = require('../models/Giveaway');
const config = require('../config');
const log = require('../utils/logger');
const { shuffle } = require('../utils/helpers');

function giveawayEmbed(g) {
  const ts = Math.floor(new Date(g.endsAt).getTime() / 1000);
  const e = new EmbedBuilder()
    .setColor(g.ended ? 0x95a5a6 : config.color)
    .setTitle(`🎉 ${g.prize}`)
    .setTimestamp(new Date(g.endsAt));
  if (g.ended) {
    e.setDescription(`**Winners:** ${g.winners.length ? g.winners.map((w) => `<@${w}>`).join(', ') : 'No valid entries'}\n**Hosted by:** <@${g.hostId}>\n**Entries:** ${g.entrants.length}`).setFooter({ text: 'Ended' });
  } else {
    e.setDescription(
      `Click **🎉 Enter** to join!\n**Ends:** <t:${ts}:R> (<t:${ts}:f>)\n**Winners:** ${g.winnerCount}\n**Hosted by:** <@${g.hostId}>${g.requiredRole ? `\n**Required role:** <@&${g.requiredRole}>` : ''}\n**Entries:** ${g.entrants.length}`
    ).setFooter({ text: 'Ends at' });
  }
  return e;
}

const buttons = (g) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('giveaway:enter').setEmoji('🎉').setLabel(g.ended ? 'Ended' : 'Enter').setStyle(ButtonStyle.Primary).setDisabled(!!g.ended)
  );

async function endGiveaway(client, g, reroll = false) {
  const pool = shuffle(g.entrants.filter((id) => !(reroll && g.winners.includes(id))));
  g.winners = pool.slice(0, g.winnerCount);
  g.ended = true;
  await g.save();
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return g;
  const msg = await channel.messages.fetch(g.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [giveawayEmbed(g)], components: [buttons(g)] }).catch(() => null);
  await channel
    .send(g.winners.length ? `🎉 Congratulations ${g.winners.map((w) => `<@${w}>`).join(', ')}! You ${reroll ? 'are the new winner(s) of' : 'won'} **${g.prize}**!` : `No valid entries for **${g.prize}**.`)
    .catch(() => null);
  return g;
}

function startScheduler(client) {
  setInterval(async () => {
    try {
      const due = await Giveaway.find({ ended: false, endsAt: { $lte: new Date() } }).limit(20);
      for (const g of due) await endGiveaway(client, g);
    } catch (e) {
      log.warn('Giveaway scheduler error:', e.message);
    }
  }, 15_000);
}

module.exports = { giveawayEmbed, buttons, endGiveaway, startScheduler };

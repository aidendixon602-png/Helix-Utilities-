const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

/**
 * Ask `opponent` to accept a challenge. Resolves true/false.
 * If opponent is null or a bot, resolves true immediately (play vs the bot).
 */
async function challenge(interaction, opponent, gameName) {
  if (!opponent || opponent.bot) return true;
  if (opponent.id === interaction.user.id) {
    await interaction.reply({ content: "You can't challenge yourself.", flags: MessageFlags.Ephemeral });
    return false;
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('g-accept').setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('g-decline').setLabel('Decline').setStyle(ButtonStyle.Danger)
  );
  await interaction.reply({ content: `${opponent}, ${interaction.user} challenged you to **${gameName}**!`, components: [row] });
  const msg = await interaction.fetchReply();
  const btn = await msg.awaitMessageComponent({ filter: (b) => b.user.id === opponent.id, time: 60_000 }).catch(() => null);
  if (!btn || btn.customId === 'g-decline') {
    await interaction.editReply({ content: btn ? `${opponent} declined.` : 'Challenge expired.', components: [] });
    return false;
  }
  await btn.update({ content: `**${gameName}** — ${interaction.user} vs ${opponent}`, components: [] });
  return true;
}

/** Send or edit depending on whether the interaction was already replied. */
async function show(interaction, payload) {
  if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
  await interaction.reply(payload);
  return interaction.fetchReply();
}

const btn = (id, label, style = ButtonStyle.Secondary, disabled = false, emoji) => {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(disabled);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  return b;
};
const row = (...c) => new ActionRowBuilder().addComponents(...c);

/** Disable every button in a message's component rows. */
const disableAll = (rows) =>
  rows.map((r) => {
    const ar = ActionRowBuilder.from(r);
    ar.components.forEach((c) => c.setDisabled(true));
    return ar;
  });

module.exports = { challenge, show, btn, row, disableAll, ButtonStyle };

const { ActivityType, MessageFlags } = require('discord.js');
const config = require('../config');
const log = require('../utils/logger');
const { error } = require('../utils/helpers');

const cooldowns = new Map();

module.exports = [
  {
    name: 'clientReady',
    once: true,
    async execute(client) {
      log.info(`Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} servers`);
      const setPresence = () =>
        client.user.setPresence({
          activities: [{ name: `/help • ${client.guilds.cache.size} servers`, type: ActivityType.Watching }],
          status: 'online',
        });
      setPresence();
      setInterval(setPresence, 10 * 60_000);

      // live metric samples for the dashboard (every 30s, keep 2h)
      const sample = () => {
        client.stats.history.push({
          t: Date.now(),
          ping: client.ws.ping,
          guilds: client.guilds.cache.size,
          memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
          commands: client.stats.commandsRun,
        });
        if (client.stats.history.length > 240) client.stats.history.shift();
      };
      sample();
      setInterval(sample, 30_000);
    },
  },
  {
    name: 'interactionCreate',
    async execute(interaction, client) {
      try {
        if (interaction.isChatInputCommand()) {
          const cmd = client.commands.get(interaction.commandName);
          if (!cmd) return;
          if (!interaction.inGuild() && !cmd.dm)
            return interaction.reply({ embeds: [error('This command only works in servers.')], flags: MessageFlags.Ephemeral });
          if (cmd.ownerOnly && !config.owners.includes(interaction.user.id))
            return interaction.reply({ embeds: [error('Owner only.')], flags: MessageFlags.Ephemeral });

          const key = `${interaction.user.id}:${cmd.data.name}`;
          const cd = (cmd.cooldown ?? 2) * 1000;
          const last = cooldowns.get(key) || 0;
          if (Date.now() - last < cd) {
            const left = ((cd - (Date.now() - last)) / 1000).toFixed(1);
            return interaction.reply({ embeds: [error(`Slow down! Try again in ${left}s.`)], flags: MessageFlags.Ephemeral });
          }
          cooldowns.set(key, Date.now());
          client.stats.commandsRun++;
          await cmd.execute(interaction, client);
          return;
        }
        if (interaction.isAutocomplete()) {
          const cmd = client.commands.get(interaction.commandName);
          if (cmd?.autocomplete) await cmd.autocomplete(interaction, client);
          return;
        }
        if (interaction.isButton() || interaction.isModalSubmit() || interaction.isAnySelectMenu()) {
          const [prefix, ...args] = interaction.customId.split(':');
          const handler = client.components.get(prefix);
          if (handler) await handler(interaction, client, args);
          // otherwise a message collector owns this component
        }
      } catch (err) {
        log.error(`Interaction error (${interaction.commandName || interaction.customId}):`, err);
        const payload = { embeds: [error('Something went wrong running that. The error was logged.')], flags: MessageFlags.Ephemeral };
        if (interaction.isAutocomplete()) return;
        if (interaction.deferred || interaction.replied) interaction.followUp(payload).catch(() => null);
        else interaction.reply(payload).catch(() => null);
      }
    },
  },
];

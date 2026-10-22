const { REST, Routes } = require('discord.js');
const config = require('./config');
const { readCommandFiles } = require('./handlers');

(async () => {
  const body = readCommandFiles().flatMap(({ mod }) => (mod.commands || []).map((c) => c.data.toJSON()));
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.devGuildId
    ? Routes.applicationGuildCommands(config.clientId, config.devGuildId)
    : Routes.applicationCommands(config.clientId);
  console.log(`Registering ${body.length} commands ${config.devGuildId ? `to guild ${config.devGuildId}` : 'globally'}…`);
  await rest.put(route, { body });
  console.log('Done. Global commands can take a few minutes to appear.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

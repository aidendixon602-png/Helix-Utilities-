const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const config = require('./config');
const log = require('./utils/logger');
const { connect } = require('./utils/db');
const { loadCommands, loadEvents } = require('./handlers');
const { startApi } = require('./api/server');

if (!config.token) {
  log.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences, // privileged (vanity roles)
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent, // privileged
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

client.commands = new Collection();
client.components = new Map(); // customId prefix -> handler
client.stats = { startedAt: Date.now(), commandsRun: 0, messagesSeen: 0, history: [] };

process.on('unhandledRejection', (err) => log.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => log.error('Uncaught exception:', err));

(async () => {
  await connect(config.mongoUri);
  loadCommands(client);
  loadEvents(client);
  startApi(client);
  await client.login(config.token);
})().catch((err) => {
  log.error('Fatal startup error:', err);
  process.exit(1);
});

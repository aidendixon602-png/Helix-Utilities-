require('dotenv').config();

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => Number(env(k, d));
const bool = (k, d) => String(env(k, d)).toLowerCase() === 'true';

module.exports = {
  token: env('DISCORD_TOKEN'),
  clientId: env('CLIENT_ID'),
  devGuildId: env('DEV_GUILD_ID'),
  owners: env('OWNER_IDS', '').split(',').map((s) => s.trim()).filter(Boolean),
  botName: env('BOT_NAME', 'Helix Utilities'),
  color: parseInt(env('EMBED_COLOR', '#7c5cff').replace('#', ''), 16),
  supportUrl: env('SUPPORT_URL', ''),
  dashboardUrl: env('DASHBOARD_URL', ''),
  mongoUri: env('MONGODB_URI'),
  api: { port: num('API_PORT', 3001), key: env('API_KEY', '') },
  birthdayTimezone: env('BIRTHDAY_TIMEZONE', 'UTC'),
};

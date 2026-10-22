const express = require('express');
const os = require('os');
const config = require('../config');
const log = require('../utils/logger');
const { invalidateGuild } = require('../utils/db');
const { version: djsVersion } = require('discord.js');

/**
 * Small authenticated HTTP API the dashboard talks to.
 * Expose it with a Cloudflare Tunnel (see README) so it gets a permanent HTTPS URL.
 */
function startApi(client) {
  const app = express();
  app.use(express.json());
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => res.json({ ok: true, ready: client.isReady() }));

  // public, cache-friendly summary (landing page counters)
  app.get('/public', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      guilds: client.guilds.cache.size,
      users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
      commands: client.commands.size,
    });
  });

  app.use((req, res, next) => {
    if (!config.api.key || req.get('x-api-key') !== config.api.key) return res.status(401).json({ error: 'unauthorized' });
    next();
  });

  app.get('/stats', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      online: client.isReady(),
      tag: client.user?.tag,
      avatar: client.user?.displayAvatarURL(),
      guilds: client.guilds.cache.size,
      users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
      channels: client.channels.cache.size,
      commands: client.commands.size,
      commandsRun: client.stats.commandsRun,
      ping: client.ws.ping,
      uptime: Date.now() - client.stats.startedAt,
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      heapMb: Math.round(mem.heapUsed / 1024 / 1024),
      loadAvg: os.loadavg()[0],
      cpuCount: os.cpus().length,
      node: process.version,
      discordjs: djsVersion,
      history: client.stats.history,
    });
  });

  app.get('/guilds/:id', (req, res) => {
    const g = client.guilds.cache.get(req.params.id);
    if (!g) return res.status(404).json({ error: 'not in guild' });
    res.json({ id: g.id, name: g.name, memberCount: g.memberCount, icon: g.iconURL() });
  });

  // dashboard calls this after saving settings so changes apply instantly
  app.post('/guilds/:id/invalidate', (req, res) => {
    invalidateGuild(req.params.id);
    res.json({ ok: true });
  });

  app.listen(config.api.port, () => log.info(`Stats API listening on :${config.api.port}`));
}

module.exports = { startApi };

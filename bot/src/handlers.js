const fs = require('fs');
const path = require('path');
const log = require('./utils/logger');

/**
 * Every file in src/commands exports { commands: [...], components?: { prefix: handler } }.
 * A command is { data: SlashCommandBuilder, category, execute(interaction, client), autocomplete? }.
 */
function readCommandFiles() {
  const dir = path.join(__dirname, 'commands');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: f, mod: require(path.join(dir, f)) }));
}

function loadCommands(client) {
  for (const { file, mod } of readCommandFiles()) {
    for (const cmd of mod.commands || []) {
      if (client.commands.has(cmd.data.name)) throw new Error(`Duplicate command /${cmd.data.name} in ${file}`);
      client.commands.set(cmd.data.name, cmd);
    }
    for (const [prefix, handler] of Object.entries(mod.components || {})) client.components.set(prefix, handler);
  }
  log.info(`Loaded ${client.commands.size} slash commands and ${client.components.size} component handlers`);
}

function loadEvents(client) {
  const dir = path.join(__dirname, 'events');
  let count = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const events = require(path.join(dir, f));
    for (const ev of events) {
      const run = (...args) => Promise.resolve(ev.execute(...args, client)).catch((e) => log.error(`[event ${ev.name}/${f}]`, e));
      ev.once ? client.once(ev.name, run) : client.on(ev.name, run);
      count++;
    }
  }
  log.info(`Registered ${count} event listeners`);
}

module.exports = { loadCommands, loadEvents, readCommandFiles };

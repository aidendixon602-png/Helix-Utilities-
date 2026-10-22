// Offline sanity check: loads every command/event/module and validates slash command JSON.
// Run: npm run check   (no token or database needed)
process.env.DISCORD_TOKEN ||= 'check';
const fs = require('fs');
const path = require('path');
const { readCommandFiles } = require('../src/handlers');

const src = path.join(__dirname, '..', 'src');
let errors = 0;
const names = new Set();
let total = 0;

for (const { file, mod } of readCommandFiles()) {
  for (const cmd of mod.commands || []) {
    try {
      const json = cmd.data.toJSON();
      if (names.has(json.name)) throw new Error('duplicate name');
      names.add(json.name);
      if (typeof cmd.execute !== 'function') throw new Error('missing execute()');
      if (!cmd.category) throw new Error('missing category');
      total++;
    } catch (e) {
      errors++;
      console.error(`✗ ${file} /${cmd.data?.name}: ${e.message}`);
    }
  }
}
console.log(`✓ ${total} slash commands valid (Discord limit: 100 global)`);
if (total > 100) { errors++; console.error('✗ too many top-level commands'); }

for (const dir of ['events', 'modules', 'games', 'models', 'utils', 'api']) {
  for (const f of fs.readdirSync(path.join(src, dir)).filter((x) => x.endsWith('.js'))) {
    try {
      const m = require(path.join(src, dir, f));
      if (dir === 'events') for (const ev of m) if (!ev.name || typeof ev.execute !== 'function') throw new Error('bad event export');
    } catch (e) {
      errors++;
      console.error(`✗ ${dir}/${f}: ${e.message}`);
    }
  }
}
console.log(errors ? `✗ ${errors} problem(s)` : '✓ all modules load');
process.exit(errors ? 1 : 0);

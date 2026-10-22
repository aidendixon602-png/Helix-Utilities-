const { EmbedBuilder, MessageFlags } = require('discord.js');
const { show, btn, row, ButtonStyle } = require('./common');
const { shuffle } = require('../utils/helpers');
const config = require('../config');

/* ───────────────────── Wordle ───────────────────── */
const WORDS = `about above actor acute admit adopt adult after again agent agree ahead alarm album alert alike alive allow alone along alter angel anger angle angry apart apple apply arena argue arise array aside asset audio audit avoid award aware badly baker bases basic beach began begin being below bench billy birth black blame blind block blood board boost booth bound brain brand bread break breed brief bring broad broke brown build built buyer cable calif carry catch cause chain chair chart chase cheap check chest chief child china chose civil claim class clean clear click clock close coach coast could count court cover craft crash cream crime cross crowd crown curve cycle daily dance dated dealt death debut delay depth doing doubt dozen draft drama drawn dream dress drill drink drive drove dying eager early earth eight elite empty enemy enjoy enter entry equal error event every exact exist extra faith false fault fiber field fifth fifty fight final first fixed flash fleet floor fluid focus force forth forty forum found frame frank fraud fresh front fruit fully funny giant given glass globe going grace grade grand grant grass great green gross group grown guard guess guest guide happy harry heart heavy hence horse hotel house human ideal image index inner input issue joint judge known label large laser later laugh layer learn lease least leave legal level light limit links lives local logic loose lower lucky lunch major maker march match maybe mayor meant media metal might minor minus mixed model money month moral motor mount mouse mouth movie music needs never newly night noise north noted novel nurse occur ocean offer often order other ought paint panel paper party peace phase phone photo piece pilot pitch place plain plane plant plate point pound power press price pride prime print prior prize proof proud prove queen quick quiet quite radio raise range rapid ratio reach ready refer right rival river robot rough round route royal rural scale scene scope score sense serve seven shall shape share sharp sheet shelf shell shift shirt shock shoot short shown sight since sixth skill sleep slide small smart smile smith smoke solid solve sorry sound south space spare speak speed spend spent split spoke sport staff stage stake stand start state steam steel stick still stock stone stood store storm story strip stuck study stuff style sugar suite super sweet table taken taste taxes teach teeth thank theft their theme there these thick thing think third those three threw throw tight times tired title today topic total touch tough tower track trade train treat trend trial tried tries truck truly trust truth twice under undue union unity until upper upset urban usage usual valid value video virus visit vital voice waste watch water wheel where which while white whole whose woman women world worry worse worst worth would wound write wrong wrote yield young youth`.split(' ');

function scoreGuess(guess, answer) {
  const res = Array(5).fill('⬛');
  const left = answer.split('');
  for (let k = 0; k < 5; k++) if (guess[k] === answer[k]) { res[k] = '🟩'; left[k] = null; }
  for (let k = 0; k < 5; k++) {
    if (res[k] === '🟩') continue;
    const idx = left.indexOf(guess[k]);
    if (idx >= 0) { res[k] = '🟨'; left[idx] = null; }
  }
  return res.join('');
}

async function wordle(i) {
  const answer = WORDS[Math.floor(Math.random() * WORDS.length)];
  const rows = [];
  const emb = (footer) =>
    new EmbedBuilder()
      .setColor(config.color)
      .setTitle(`Wordle — ${i.user.username}`)
      .setDescription((rows.length ? rows.map((r) => `${r.score}  \`${r.word.toUpperCase().split('').join(' ')}\``).join('\n') : '*Type a 5-letter word in this channel to guess.*') + `\n\nGuesses: ${rows.length}/6`)
      .setFooter({ text: footer || 'You have 5 minutes. Type "stop" to give up.' });
  const msg = await show(i, { embeds: [emb()] });
  const col = i.channel.createMessageCollector({ filter: (m) => m.author.id === i.user.id && (/^[a-z]{5}$/i.test(m.content.trim()) || m.content.toLowerCase() === 'stop'), time: 300_000 });
  col.on('collect', async (m) => {
    const word = m.content.trim().toLowerCase();
    m.delete().catch(() => null);
    if (word === 'stop') return col.stop('quit');
    rows.push({ word, score: scoreGuess(word, answer) });
    if (word === answer) return col.stop('win');
    if (rows.length >= 6) return col.stop('lose');
    await msg.edit({ embeds: [emb()] });
  });
  col.on('end', (_, reason) => {
    const text = reason === 'win' ? `🎉 Solved in ${rows.length}/6!` : `The word was ${answer.toUpperCase()}.`;
    msg.edit({ embeds: [emb(text)] }).catch(() => null);
  });
}

/* ───────────────────── 2048 ───────────────────── */
function slideRow(r) {
  const nums = r.filter(Boolean);
  let gained = 0;
  for (let k = 0; k < nums.length - 1; k++) if (nums[k] === nums[k + 1]) { nums[k] *= 2; gained += nums[k]; nums.splice(k + 1, 1); }
  while (nums.length < 4) nums.push(0);
  return { row: nums, gained };
}
function move2048(g, dir) {
  const rot = (m) => m[0].map((_, c) => m.map((r) => r[c]).reverse());
  let m = g.map((r) => [...r]);
  const times = { left: 0, down: 1, right: 2, up: 3 }[dir];
  for (let t = 0; t < times; t++) m = rot(m);
  let gained = 0;
  m = m.map((r) => { const s = slideRow(r); gained += s.gained; return s.row; });
  for (let t = 0; t < (4 - times) % 4; t++) m = rot(m);
  return { grid: m, gained, moved: JSON.stringify(m) !== JSON.stringify(g) };
}
const addTile = (g) => {
  const empty = [];
  g.forEach((r, y) => r.forEach((v, x) => !v && empty.push([y, x])));
  if (!empty.length) return;
  const [y, x] = empty[Math.floor(Math.random() * empty.length)];
  g[y][x] = Math.random() < 0.9 ? 2 : 4;
};
const canMove = (g) => ['up', 'down', 'left', 'right'].some((d) => move2048(g, d).moved);

async function game2048(i) {
  let grid = Array.from({ length: 4 }, () => Array(4).fill(0));
  addTile(grid);
  addTile(grid);
  let score = 0;
  const render = () => '```\n' + grid.map((r) => r.map((v) => String(v || '.').padStart(5)).join('')).join('\n\n') + '\n```';
  const emb = (status = '') => new EmbedBuilder().setColor(config.color).setTitle(`2048 — Score ${score}`).setDescription(render() + status);
  const controls = (done) => [
    row(btn('2048-x', '​', ButtonStyle.Secondary, true), btn('2048-up', null, ButtonStyle.Primary, done, '⬆️'), btn('2048-quit', 'Quit', ButtonStyle.Danger, done)),
    row(btn('2048-left', null, ButtonStyle.Primary, done, '⬅️'), btn('2048-down', null, ButtonStyle.Primary, done, '⬇️'), btn('2048-right', null, ButtonStyle.Primary, done, '➡️')),
  ];
  const msg = await show(i, { embeds: [emb()], components: controls(false) });
  const col = msg.createMessageComponentCollector({ filter: (b) => b.user.id === i.user.id, idle: 300_000 });
  col.on('collect', async (b) => {
    const dir = b.customId.split('-')[1];
    if (dir === 'quit') { col.stop('quit'); return b.update({ embeds: [emb(`\nGame over — final score **${score}**`)], components: controls(true) }); }
    const res = move2048(grid, dir);
    if (!res.moved) return b.deferUpdate();
    grid = res.grid;
    score += res.gained;
    addTile(grid);
    if (grid.flat().includes(2048)) { col.stop('win'); return b.update({ embeds: [emb(`\n🎉 You made 2048! Score **${score}**`)], components: controls(true) }); }
    if (!canMove(grid)) { col.stop('lose'); return b.update({ embeds: [emb(`\n💀 No moves left. Score **${score}**`)], components: controls(true) }); }
    return b.update({ embeds: [emb()] });
  });
  col.on('end', (_, r) => r === 'idle' && msg.edit({ components: controls(true) }).catch(() => null));
}

/* ───────────────────── Minesweeper ───────────────────── */
async function minesweeper(i) {
  const size = 8;
  const mines = i.options.getInteger('mines') || 10;
  const cells = shuffle([...Array(size * size).keys()]).slice(0, mines);
  const isMine = new Set(cells);
  const nums = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  const lines = [];
  for (let y = 0; y < size; y++) {
    let line = '';
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (isMine.has(idx)) { line += '||💣||'; continue; }
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy; const nx = x + dx;
        if ((dy || dx) && ny >= 0 && nx >= 0 && ny < size && nx < size && isMine.has(ny * size + nx)) n++;
      }
      line += `||${nums[n]}||`;
    }
    lines.push(line);
  }
  return i.reply({ content: `💣 **Minesweeper** (${mines} mines) — click the spoilers, avoid the bombs!\n${lines.join('\n')}` });
}

/* ───────────────────── Snake ───────────────────── */
async function snake(i) {
  const W = 10; const H = 8;
  let body = [[4, 4]];
  let dir = [0, 1];
  let food;
  let score = 0;
  const placeFood = () => {
    do food = [Math.floor(Math.random() * H), Math.floor(Math.random() * W)];
    while (body.some(([y, x]) => y === food[0] && x === food[1]));
  };
  placeFood();
  const render = () => {
    const g = Array.from({ length: H }, () => Array(W).fill('⬛'));
    g[food[0]][food[1]] = '🍎';
    body.forEach(([y, x], k) => (g[y][x] = k === 0 ? '🟢' : '🟩'));
    return g.map((r) => r.join('')).join('\n');
  };
  const emb = (s = '') => new EmbedBuilder().setColor(config.color).setTitle(`🐍 Snake — Score ${score}`).setDescription(render() + s).setFooter({ text: 'Each button press moves the snake one step.' });
  const controls = (done) => [
    row(btn('sn-x', '​', ButtonStyle.Secondary, true), btn('sn-up', null, ButtonStyle.Primary, done, '⬆️'), btn('sn-stop', 'Stop', ButtonStyle.Danger, done)),
    row(btn('sn-left', null, ButtonStyle.Primary, done, '⬅️'), btn('sn-down', null, ButtonStyle.Primary, done, '⬇️'), btn('sn-right', null, ButtonStyle.Primary, done, '➡️')),
  ];
  const msg = await show(i, { embeds: [emb()], components: controls(false) });
  const col = msg.createMessageComponentCollector({ filter: (b) => b.user.id === i.user.id, idle: 120_000 });
  col.on('collect', async (b) => {
    const d = b.customId.split('-')[1];
    if (d === 'stop') { col.stop(); return b.update({ embeds: [emb(`\n\nFinal score: **${score}**`)], components: controls(true) }); }
    const nd = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[d];
    if (body.length > 1 && nd[0] === -dir[0] && nd[1] === -dir[1]) return b.deferUpdate();
    dir = nd;
    const head = [body[0][0] + dir[0], body[0][1] + dir[1]];
    const dead = head[0] < 0 || head[1] < 0 || head[0] >= H || head[1] >= W || body.some(([y, x]) => y === head[0] && x === head[1]);
    if (dead) { col.stop(); return b.update({ embeds: [emb(`\n\n💀 Game over! Score: **${score}**`)], components: controls(true) }); }
    body = [head, ...body];
    if (head[0] === food[0] && head[1] === food[1]) { score++; placeFood(); } else body.pop();
    return b.update({ embeds: [emb()] });
  });
  col.on('end', (_, r) => r === 'idle' && msg.edit({ components: controls(true) }).catch(() => null));
}

/* ───────────────────── Memory match ───────────────────── */
async function memory(i) {
  const emojis = shuffle(['🍎', '🍌', '🍇', '🍒', '🥝', '🍑', '🍍', '🥥', '🍎', '🍌', '🍇', '🍒', '🥝', '🍑', '🍍', '🥥']);
  const revealed = new Set();
  let open = [];
  let moves = 0;
  const grid = (done) =>
    [0, 1, 2, 3].map((r) =>
      row(...[0, 1, 2, 3].map((c) => {
        const k = r * 4 + c;
        const vis = revealed.has(k) || open.includes(k);
        return btn(`mem-${k}`, null, revealed.has(k) ? ButtonStyle.Success : ButtonStyle.Secondary, done || revealed.has(k), vis ? emojis[k] : '❔');
      }))
    );
  const msg = await show(i, { content: `🧠 **Memory** — find all pairs! Moves: 0`, components: grid(false) });
  const col = msg.createMessageComponentCollector({ filter: (b) => b.user.id === i.user.id, idle: 180_000 });
  col.on('collect', async (b) => {
    const k = Number(b.customId.split('-')[1]);
    if (open.includes(k) || revealed.has(k)) return b.deferUpdate();
    if (open.length === 2) open = [];
    open.push(k);
    if (open.length === 2) {
      moves++;
      if (emojis[open[0]] === emojis[open[1]]) { open.forEach((x) => revealed.add(x)); open = []; }
    }
    if (revealed.size === 16) { col.stop('win'); return b.update({ content: `🧠 **Memory** — 🎉 Solved in **${moves}** moves!`, components: grid(true) }); }
    return b.update({ content: `🧠 **Memory** — find all pairs! Moves: ${moves}`, components: grid(false) });
  });
  col.on('end', (_, r) => r === 'idle' && msg.edit({ components: grid(true) }).catch(() => null));
}

module.exports = { wordle, game2048, minesweeper, snake, memory, WORDS };

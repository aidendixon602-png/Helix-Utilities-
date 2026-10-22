const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { Chess } = require('chess.js');
const { challenge, show, btn, row, disableAll, ButtonStyle } = require('./common');
const config = require('../config');

/* ───────────────────── Tic-tac-toe ───────────────────── */
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const tttWinner = (b) => {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
};
function tttBest(b, me, them) {
  // minimax — the bot never loses
  const score = (board, turn) => {
    const w = tttWinner(board);
    if (w === me) return 10;
    if (w === them) return -10;
    if (w === 'draw') return 0;
    const moves = board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
    const results = moves.map((m) => {
      const nb = [...board];
      nb[m] = turn;
      return score(nb, turn === me ? them : me);
    });
    return turn === me ? Math.max(...results) : Math.min(...results);
  };
  const moves = b.map((v, i) => (v ? null : i)).filter((v) => v !== null);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const nb = [...b];
    nb[m] = me;
    const s = score(nb, them) + Math.random() * 0.1;
    if (s > bestScore) [best, bestScore] = [m, s];
  }
  return best;
}

async function tictactoe(i) {
  const opp = i.options.getUser('opponent');
  if (!(await challenge(i, opp, 'Tic-Tac-Toe'))) return;
  const vsBot = !opp || opp.bot;
  const players = [i.user, vsBot ? i.client.user : opp];
  const marks = ['❌', '⭕'];
  const board = Array(9).fill(null);
  let turn = 0;
  const render = (done) =>
    [0, 1, 2].map((r) =>
      row(...[0, 1, 2].map((c) => {
        const idx = r * 3 + c;
        return btn(`ttt-${idx}`, board[idx] ? null : '​', board[idx] === 'X' ? ButtonStyle.Danger : board[idx] === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary, done || !!board[idx], board[idx] ? marks[board[idx] === 'X' ? 0 : 1] : undefined);
      }))
    );
  const content = () => `**Tic-Tac-Toe** — ${players[0]} ❌ vs ${players[1]} ⭕\nTurn: ${players[turn]}`;
  const msg = await show(i, { content: content(), components: render(false) });
  const collector = msg.createMessageComponentCollector({ time: 300_000 });
  const finish = async (text) => {
    collector.stop('done');
    await msg.edit({ content: `**Tic-Tac-Toe** — ${text}`, components: render(true) });
  };
  collector.on('collect', async (b) => {
    if (b.user.id !== players[turn].id) return b.reply({ content: "It's not your turn.", flags: MessageFlags.Ephemeral });
    const idx = Number(b.customId.split('-')[1]);
    if (board[idx]) return b.deferUpdate();
    board[idx] = turn === 0 ? 'X' : 'O';
    let w = tttWinner(board);
    if (!w && vsBot) {
      board[tttBest(board, 'O', 'X')] = 'O';
      w = tttWinner(board);
    } else if (!w) turn = 1 - turn;
    await b.deferUpdate();
    if (w === 'draw') return finish("It's a draw! 🤝");
    if (w) return finish(`${w === 'X' ? players[0] : players[1]} wins! 🎉`);
    await msg.edit({ content: content(), components: render(false) });
  });
  collector.on('end', (_, reason) => reason !== 'done' && msg.edit({ content: '⏰ Game timed out.', components: render(true) }).catch(() => null));
}

/* ───────────────────── Connect 4 ───────────────────── */
const C4R = 6;
const C4C = 7;
function c4Win(g, p) {
  const at = (r, c) => r >= 0 && r < C4R && c >= 0 && c < C4C && g[r][c] === p;
  for (let r = 0; r < C4R; r++)
    for (let c = 0; c < C4C; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]])
        if ([0, 1, 2, 3].every((k) => at(r + dr * k, c + dc * k))) return true;
  return false;
}
const c4Drop = (g, col, p) => {
  for (let r = C4R - 1; r >= 0; r--) if (!g[r][col]) { g[r][col] = p; return r; }
  return -1;
};
function c4Bot(g) {
  const valid = [...Array(C4C).keys()].filter((c) => !g[0][c]);
  for (const p of [2, 1]) {
    for (const c of valid) {
      const copy = g.map((r) => [...r]);
      c4Drop(copy, c, p);
      if (c4Win(copy, p)) return c;
    }
  }
  const pref = [3, 2, 4, 1, 5, 0, 6].filter((c) => valid.includes(c));
  return Math.random() < 0.7 ? pref[0] : valid[Math.floor(Math.random() * valid.length)];
}

async function connect4(i) {
  const opp = i.options.getUser('opponent');
  if (!(await challenge(i, opp, 'Connect 4'))) return;
  const vsBot = !opp || opp.bot;
  const players = [i.user, vsBot ? i.client.user : opp];
  const discs = ['⚪', '🔴', '🟡'];
  const g = Array.from({ length: C4R }, () => Array(C4C).fill(0));
  let turn = 0;
  const board = () => g.map((r) => r.map((v) => discs[v]).join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
  const emb = (status) => new EmbedBuilder().setColor(config.color).setTitle('Connect 4').setDescription(`${players[0]} 🔴 vs ${players[1]} 🟡\n\n${board()}\n\n${status}`);
  const buttons = (done) => [
    row(...[0, 1, 2, 3].map((c) => btn(`c4-${c}`, String(c + 1), ButtonStyle.Primary, done || !!g[0][c]))),
    row(...[4, 5, 6].map((c) => btn(`c4-${c}`, String(c + 1), ButtonStyle.Primary, done || !!g[0][c]))),
  ];
  const msg = await show(i, { content: null, embeds: [emb(`Turn: ${players[turn]}`)], components: buttons(false) });
  const col = msg.createMessageComponentCollector({ time: 600_000 });
  const finish = async (status) => {
    col.stop('done');
    await msg.edit({ embeds: [emb(status)], components: buttons(true) });
  };
  col.on('collect', async (b) => {
    if (b.user.id !== players[turn].id) return b.reply({ content: "It's not your turn.", flags: MessageFlags.Ephemeral });
    await b.deferUpdate();
    const c = Number(b.customId.split('-')[1]);
    if (c4Drop(g, c, turn + 1) < 0) return;
    if (c4Win(g, turn + 1)) return finish(`${players[turn]} wins! 🎉`);
    if (g[0].every(Boolean)) return finish("It's a draw!");
    if (vsBot) {
      c4Drop(g, c4Bot(g), 2);
      if (c4Win(g, 2)) return finish(`${players[1]} wins! 🤖`);
      if (g[0].every(Boolean)) return finish("It's a draw!");
    } else turn = 1 - turn;
    await msg.edit({ embeds: [emb(`Turn: ${players[turn]}`)], components: buttons(false) });
  });
  col.on('end', (_, r) => r !== 'done' && msg.edit({ components: buttons(true) }).catch(() => null));
}

/* ───────────────────── Chess ───────────────────── */
const PIECES = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔' };
function chessBoard(game, flip) {
  const rows = game.board();
  const ranks = flip ? [...rows].reverse().map((r) => [...r].reverse()) : rows;
  const files = flip ? 'h g f e d c b a' : 'a b c d e f g h';
  const lines = ranks.map((r, idx) => {
    const rank = flip ? idx + 1 : 8 - idx;
    return `${rank} ${r.map((sq, f) => (sq ? PIECES[sq.color === 'w' ? sq.type.toUpperCase() : sq.type] : (idx + f) % 2 ? '·' : ' ')).join(' ')}`;
  });
  return '```\n' + lines.join('\n') + `\n  ${files}\n` + '```';
}

async function chess(i) {
  const opp = i.options.getUser('opponent');
  if (!(await challenge(i, opp, 'Chess'))) return;
  const vsBot = !opp || opp.bot;
  const white = i.user;
  const black = vsBot ? i.client.user : opp;
  const game = new Chess();
  let lastMove = null;
  const current = () => (game.turn() === 'w' ? white : black);
  const status = () => {
    if (game.isCheckmate()) return `♚ Checkmate! ${game.turn() === 'w' ? black : white} wins! 🎉`;
    if (game.isDraw()) return '🤝 Draw!';
    return `Turn: ${current()} (${game.turn() === 'w' ? 'White' : 'Black'})${game.inCheck() ? ' — **CHECK!**' : ''}`;
  };
  const emb = () =>
    new EmbedBuilder()
      .setColor(config.color)
      .setTitle(`Chess — ${white.username} (White) vs ${black.username} (Black)`)
      .setDescription(`${chessBoard(game, false)}${lastMove ? `Last move: **${lastMove}**\n` : ''}${status()}`)
      .setFooter({ text: 'Moves use algebraic notation: e4, Nf3, O-O, exd5, e8=Q — or from-to like e2e4' });
  const buttons = (done) => row(btn('chess-move', 'Make move', ButtonStyle.Primary, done, '♟️'), btn('chess-moves', 'Legal moves', ButtonStyle.Secondary, done), btn('chess-resign', 'Resign', ButtonStyle.Danger, done, '🏳️'));
  const msg = await show(i, { content: null, embeds: [emb()], components: [buttons(false)] });
  const col = msg.createMessageComponentCollector({ time: 3_600_000 });
  const end = async (text) => {
    col.stop('done');
    await msg.edit({ embeds: [emb().setDescription(`${chessBoard(game, false)}${text}`)], components: [buttons(true)] });
  };
  col.on('collect', async (b) => {
    const isPlayer = [white.id, black.id].includes(b.user.id);
    if (!isPlayer) return b.reply({ content: 'You are not in this game.', flags: MessageFlags.Ephemeral });
    if (b.customId === 'chess-resign') {
      await b.deferUpdate();
      return end(`🏳️ ${b.user} resigned. ${b.user.id === white.id ? black : white} wins!`);
    }
    if (b.customId === 'chess-moves') {
      return b.reply({ content: `Legal moves: ${game.moves().join(', ').slice(0, 1900)}`, flags: MessageFlags.Ephemeral });
    }
    if (b.user.id !== current().id) return b.reply({ content: "It's not your turn.", flags: MessageFlags.Ephemeral });
    const modalId = `chess-modal-${Date.now()}`;
    await b.showModal(
      new ModalBuilder().setCustomId(modalId).setTitle('Your move').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('move').setLabel('Move (e.g. e4, Nf3, e2e4)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10))
      )
    );
    const sub = await b.awaitModalSubmit({ filter: (m) => m.customId === modalId && m.user.id === b.user.id, time: 120_000 }).catch(() => null);
    if (!sub) return;
    const raw = sub.fields.getTextInputValue('move').trim();
    let mv = null;
    try {
      mv = game.move(raw);
    } catch {
      try {
        if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(raw)) mv = game.move({ from: raw.slice(0, 2).toLowerCase(), to: raw.slice(2, 4).toLowerCase(), promotion: raw[4]?.toLowerCase() || 'q' });
      } catch {
        mv = null;
      }
    }
    if (!mv) return sub.reply({ content: `❌ \`${raw}\` is not a legal move.`, flags: MessageFlags.Ephemeral });
    lastMove = mv.san;
    if (vsBot && !game.isGameOver()) {
      const moves = game.moves({ verbose: true });
      const captures = moves.filter((m) => m.captured || m.san.includes('+'));
      const pool = captures.length && Math.random() < 0.7 ? captures : moves;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const botMove = game.move(pick.san);
      lastMove = `${mv.san} … ${botMove.san}`;
    }
    await sub.deferUpdate().catch(() => null);
    if (game.isGameOver()) return end(status());
    await msg.edit({ embeds: [emb()], components: [buttons(false)] });
  });
  col.on('end', (_, r) => r !== 'done' && msg.edit({ components: disableAll(msg.components) }).catch(() => null));
}

/* ───────────────────── Battleship (vs bot) ───────────────────── */
const BS = 6;
const LETTERS = 'ABCDEF';
function placeShips() {
  const grid = Array.from({ length: BS }, () => Array(BS).fill(0));
  for (const size of [3, 3, 2, 2]) {
    for (let tries = 0; tries < 200; tries++) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horiz ? BS : BS - size + 1));
      const c = Math.floor(Math.random() * (horiz ? BS - size + 1 : BS));
      const cells = [...Array(size).keys()].map((k) => (horiz ? [r, c + k] : [r + k, c]));
      if (cells.every(([y, x]) => !grid[y][x])) {
        cells.forEach(([y, x]) => (grid[y][x] = 1));
        break;
      }
    }
  }
  return grid;
}
const shipsLeft = (g, shots) => g.flat().filter((v, idx) => v && !shots.has(idx)).length;

async function battleship(i) {
  const enemy = placeShips();
  const mine = placeShips();
  const myShots = new Set();
  const botShots = new Set();
  let log = 'Fire at the enemy grid with **🎯 Fire** (e.g. `B4`).';
  const draw = (g, shots, reveal) =>
    '```\n  ' + [...Array(BS).keys()].map((n) => n + 1).join(' ') + '\n' +
    g.map((r, y) => `${LETTERS[y]} ` + r.map((v, x) => {
      const hit = shots.has(y * BS + x);
      if (hit) return v ? 'X' : 'o';
      return reveal && v ? '■' : '·';
    }).join(' ')).join('\n') + '\n```';
  const emb = () =>
    new EmbedBuilder()
      .setColor(config.color)
      .setTitle('🚢 Battleship')
      .addFields(
        { name: `Enemy waters (${shipsLeft(enemy, myShots)} hits left)`, value: draw(enemy, myShots, false), inline: true },
        { name: `Your fleet (${shipsLeft(mine, botShots)} hits left)`, value: draw(mine, botShots, true), inline: true }
      )
      .setDescription(log)
      .setFooter({ text: 'X = hit • o = miss • ■ = your ship' });
  const buttons = (done) => row(btn('bs-fire', 'Fire', ButtonStyle.Danger, done, '🎯'), btn('bs-quit', 'Surrender', ButtonStyle.Secondary, done));
  const msg = await show(i, { embeds: [emb()], components: [buttons(false)] });
  const col = msg.createMessageComponentCollector({ filter: (b) => b.user.id === i.user.id, time: 900_000 });
  const finish = async (text) => {
    col.stop('done');
    log = text;
    await msg.edit({ embeds: [emb().spliceFields(0, 1, { name: 'Enemy fleet', value: draw(enemy, myShots, true), inline: true })], components: [buttons(true)] });
  };
  col.on('collect', async (b) => {
    if (b.customId === 'bs-quit') {
      await b.deferUpdate();
      return finish('🏳️ You surrendered.');
    }
    const id = `bs-modal-${Date.now()}`;
    await b.showModal(new ModalBuilder().setCustomId(id).setTitle('Fire!').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('c').setLabel('Coordinate (A1 - F6)').setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(2).setRequired(true))));
    const sub = await b.awaitModalSubmit({ filter: (m) => m.customId === id, time: 60_000 }).catch(() => null);
    if (!sub) return;
    const v = sub.fields.getTextInputValue('c').toUpperCase();
    const y = LETTERS.indexOf(v[0]);
    const x = Number(v[1]) - 1;
    if (y < 0 || x < 0 || x >= BS) return sub.reply({ content: 'Invalid coordinate. Use A1 to F6.', flags: MessageFlags.Ephemeral });
    if (myShots.has(y * BS + x)) return sub.reply({ content: 'You already fired there.', flags: MessageFlags.Ephemeral });
    myShots.add(y * BS + x);
    log = `You fired at **${v}** — ${enemy[y][x] ? '💥 HIT!' : '🌊 miss.'}`;
    await sub.deferUpdate();
    if (!shipsLeft(enemy, myShots)) return finish(`${log}\n🏆 You sank the whole enemy fleet!`);
    // bot fires: target around previous hits first
    const hits = [...botShots].filter((s) => mine[Math.floor(s / BS)][s % BS]);
    const neighbors = hits.flatMap((s) => [s - BS, s + BS, s % BS ? s - 1 : -1, s % BS < BS - 1 ? s + 1 : -1]).filter((s) => s >= 0 && s < BS * BS && !botShots.has(s));
    const free = [...Array(BS * BS).keys()].filter((s) => !botShots.has(s));
    const shot = neighbors.length ? neighbors[Math.floor(Math.random() * neighbors.length)] : free[Math.floor(Math.random() * free.length)];
    botShots.add(shot);
    const by = Math.floor(shot / BS);
    const bx = shot % BS;
    log += `\nEnemy fired at **${LETTERS[by]}${bx + 1}** — ${mine[by][bx] ? '💥 they hit you!' : '🌊 they missed.'}`;
    if (!shipsLeft(mine, botShots)) return finish(`${log}\n💀 Your fleet was destroyed.`);
    await msg.edit({ embeds: [emb()] });
  });
  col.on('end', (_, r) => r !== 'done' && msg.edit({ components: [buttons(true)] }).catch(() => null));
}

module.exports = { tictactoe, connect4, chess, battleship };

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { challenge, show, btn, row, ButtonStyle } = require('./common');
const { shuffle, randInt } = require('../utils/helpers');
const { WORDS } = require('./puzzle');
const config = require('../config');

/* ───────────────────── Rock paper scissors ───────────────────── */
const RPS = { rock: '🪨', paper: '📄', scissors: '✂️' };
const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
async function rps(i) {
  const opp = i.options.getUser('opponent');
  if (!(await challenge(i, opp, 'Rock Paper Scissors'))) return;
  const vsBot = !opp || opp.bot;
  const players = [i.user, vsBot ? i.client.user : opp];
  const picks = {};
  if (vsBot) picks[i.client.user.id] = Object.keys(RPS)[randInt(0, 2)];
  const buttons = (done) => row(...Object.entries(RPS).map(([k, e]) => btn(`rps-${k}`, k[0].toUpperCase() + k.slice(1), ButtonStyle.Primary, done, e)));
  const msg = await show(i, { content: `**Rock Paper Scissors** — ${players[0]} vs ${players[1]}\nMake your pick!`, components: [buttons(false)] });
  const col = msg.createMessageComponentCollector({ filter: (b) => players.some((p) => p.id === b.user.id), time: 60_000 });
  col.on('collect', async (b) => {
    if (picks[b.user.id]) return b.reply({ content: 'You already picked.', flags: MessageFlags.Ephemeral });
    picks[b.user.id] = b.customId.split('-')[1];
    await b.reply({ content: `You picked ${RPS[picks[b.user.id]]}`, flags: MessageFlags.Ephemeral });
    if (players.every((p) => picks[p.id])) col.stop('done');
  });
  col.on('end', (_, reason) => {
    if (reason !== 'done') return msg.edit({ content: '⏰ Not everyone picked in time.', components: [] }).catch(() => null);
    const [a, b] = players.map((p) => picks[p.id]);
    const result = a === b ? "It's a tie! 🤝" : beats[a] === b ? `${players[0]} wins! 🎉` : `${players[1]} wins! 🎉`;
    msg.edit({ content: `**Rock Paper Scissors**\n${players[0]} ${RPS[a]} vs ${RPS[b]} ${players[1]}\n${result}`, components: [] }).catch(() => null);
  });
}

/* ───────────────────── Hangman ───────────────────── */
const STAGES = ['', '😐', '😐\n |', '😐\n/|', '😐\n/|\\', '😐\n/|\\\n/', '😵\n/|\\\n/ \\'];
async function hangman(i) {
  const word = WORDS[randInt(0, WORDS.length - 1)];
  const guessed = new Set();
  let wrong = 0;
  const masked = () => word.split('').map((c) => (guessed.has(c) ? c.toUpperCase() : '＿')).join(' ');
  const emb = (status = 'Type a single letter (or the whole word) in chat.') =>
    new EmbedBuilder()
      .setColor(config.color)
      .setTitle('🪢 Hangman')
      .setDescription(`\`\`\`\n${STAGES[wrong] || ' '}\n\`\`\`\n**${masked()}**\n\nWrong: ${[...guessed].filter((c) => !word.includes(c)).join(' ').toUpperCase() || '—'} (${wrong}/6)\n${status}`);
  const msg = await show(i, { embeds: [emb()] });
  const col = i.channel.createMessageCollector({ filter: (m) => m.author.id === i.user.id && /^[a-z]+$/i.test(m.content.trim()), time: 300_000 });
  col.on('collect', async (m) => {
    const g = m.content.trim().toLowerCase();
    m.delete().catch(() => null);
    if (g.length > 1) {
      if (g === word) { word.split('').forEach((c) => guessed.add(c)); return col.stop('win'); }
      wrong++;
    } else if (!guessed.has(g)) {
      guessed.add(g);
      if (!word.includes(g)) wrong++;
    }
    if (word.split('').every((c) => guessed.has(c))) return col.stop('win');
    if (wrong >= 6) return col.stop('lose');
    await msg.edit({ embeds: [emb()] });
  });
  col.on('end', (_, r) => msg.edit({ embeds: [emb(r === 'win' ? '🎉 You saved them!' : `💀 The word was **${word.toUpperCase()}**.`)] }).catch(() => null));
}

/* ───────────────────── Trivia ───────────────────── */
const FALLBACK = [
  { q: 'What is the largest planet in our solar system?', a: 'Jupiter', w: ['Saturn', 'Neptune', 'Earth'] },
  { q: 'Which element has the chemical symbol "O"?', a: 'Oxygen', w: ['Gold', 'Osmium', 'Iron'] },
  { q: 'How many continents are there?', a: '7', w: ['5', '6', '8'] },
  { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', w: ['Michelangelo', 'Raphael', 'Van Gogh'] },
  { q: 'What is the fastest land animal?', a: 'Cheetah', w: ['Lion', 'Pronghorn', 'Greyhound'] },
  { q: 'In what year did the first person walk on the Moon?', a: '1969', w: ['1965', '1972', '1959'] },
  { q: 'What is the capital of Japan?', a: 'Tokyo', w: ['Kyoto', 'Osaka', 'Seoul'] },
  { q: 'How many sides does a hexagon have?', a: '6', w: ['5', '7', '8'] },
];
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&eacute;/g, 'é');
async function fetchQuestion() {
  try {
    const res = await fetch('https://opentdb.com/api.php?amount=1&type=multiple', { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    const r = j.results[0];
    return { q: decode(r.question), a: decode(r.correct_answer), w: r.incorrect_answers.map(decode), cat: decode(r.category), diff: r.difficulty };
  } catch {
    return FALLBACK[randInt(0, FALLBACK.length - 1)];
  }
}
async function trivia(i) {
  await i.deferReply();
  const t = await fetchQuestion();
  const options = shuffle([t.a, ...t.w]);
  const letters = ['🇦', '🇧', '🇨', '🇩'];
  const emb = new EmbedBuilder().setColor(config.color).setTitle('❓ Trivia').setDescription(`**${t.q}**\n\n${options.map((o, n) => `${letters[n]} ${o}`).join('\n')}`).setFooter({ text: `${t.cat ? `${t.cat} • ${t.diff} • ` : ''}15 seconds — anyone can answer, one try each` });
  const buttons = (done, correctIdx) => row(...options.map((o, n) => btn(`tr-${n}`, o.slice(0, 80), done ? (n === correctIdx ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Primary, done, letters[n])));
  const msg = await i.editReply({ embeds: [emb], components: [buttons(false)] });
  const answered = new Set();
  const correctIdx = options.indexOf(t.a);
  const col = msg.createMessageComponentCollector({ time: 15_000 });
  col.on('collect', async (b) => {
    if (answered.has(b.user.id)) return b.reply({ content: 'You already answered.', flags: MessageFlags.Ephemeral });
    answered.add(b.user.id);
    if (Number(b.customId.split('-')[1]) === correctIdx) {
      col.stop(b.user.id);
      return b.update({ embeds: [emb.setDescription(`${emb.data.description}\n\n✅ ${b.user} got it right!`)], components: [buttons(true, correctIdx)] });
    }
    return b.reply({ content: '❌ Wrong!', flags: MessageFlags.Ephemeral });
  });
  col.on('end', (_, r) => {
    if (r === 'time') msg.edit({ embeds: [emb.setDescription(`${emb.data.description}\n\n⏰ Time's up! The answer was **${t.a}**.`)], components: [buttons(true, correctIdx)] }).catch(() => null);
  });
}

/* ───────────────────── Guess the number ───────────────────── */
async function guess(i) {
  const max = i.options.getInteger('max') || 100;
  const n = randInt(1, max);
  let tries = 0;
  const limit = Math.ceil(Math.log2(max)) + 1;
  await i.reply({ content: `🔢 I'm thinking of a number between **1** and **${max}**. You have **${limit}** tries — type your guesses!` });
  const col = i.channel.createMessageCollector({ filter: (m) => m.author.id === i.user.id && /^\d+$/.test(m.content.trim()), time: 120_000 });
  col.on('collect', (m) => {
    const g = Number(m.content.trim());
    tries++;
    if (g === n) return col.stop('win');
    if (tries >= limit) return col.stop('lose');
    m.reply(`${g < n ? '⬆️ Higher' : '⬇️ Lower'}! (${limit - tries} left)`).catch(() => null);
  });
  col.on('end', (_, r) => i.followUp(r === 'win' ? `🎉 ${i.user} got it in **${tries}** tries! It was **${n}**.` : `The number was **${n}**.`).catch(() => null));
}

/* ───────────────────── Fast type ───────────────────── */
async function fasttype(i) {
  const sentence = shuffle(WORDS).slice(0, 7).join(' ');
  const display = sentence.split('').join('​'); // zero-width chars stop copy-paste
  await i.reply({ content: `⌨️ **Fast type!** First to type this exactly wins:\n> ${display}` });
  const start = Date.now();
  const col = i.channel.createMessageCollector({ filter: (m) => !m.author.bot, time: 60_000 });
  col.on('collect', (m) => {
    if (m.content.includes('​')) return m.reply('🚫 No copy-pasting!').catch(() => null);
    if (m.content.trim().toLowerCase() === sentence) {
      col.stop('win');
      const secs = (Date.now() - start) / 1000;
      m.reply(`🏆 ${m.author} wins in **${secs.toFixed(2)}s** (${Math.round((sentence.length / 5) / (secs / 60))} WPM)!`).catch(() => null);
    }
  });
  col.on('end', (_, r) => r !== 'win' && i.followUp('⏰ Nobody typed it in time!').catch(() => null));
}

/* ───────────────────── Coinflip / dice ───────────────────── */
async function coinflip(i) {
  return i.reply({ content: `🪙 ${Math.random() < 0.5 ? '**Heads!**' : '**Tails!**'}` });
}
async function dice(i) {
  const sides = i.options.getInteger('sides') || 6;
  const count = i.options.getInteger('count') || 1;
  const rolls = Array.from({ length: count }, () => randInt(1, sides));
  return i.reply({ content: `🎲 ${rolls.join(', ')}${count > 1 ? ` — total **${rolls.reduce((a, b) => a + b, 0)}**` : ''}` });
}

module.exports = { rps, hangman, trivia, guess, fasttype, coinflip, dice };

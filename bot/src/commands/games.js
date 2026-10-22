const { SlashCommandBuilder } = require('discord.js');
const board = require('../games/board');
const puzzle = require('../games/puzzle');
const quick = require('../games/quick');
const casino = require('../games/casino');

const opponent = (s) => s.addUserOption((o) => o.setName('opponent').setDescription('Play against someone (default: me)'));

const GAMES = {
  chess: { desc: 'Chess vs a friend or the bot', run: board.chess, opts: opponent },
  battleship: { desc: 'Sink the bot\'s fleet', run: board.battleship },
  tictactoe: { desc: 'Tic-tac-toe (the bot is unbeatable!)', run: board.tictactoe, opts: opponent },
  connect4: { desc: 'Connect four in a row', run: board.connect4, opts: opponent },
  wordle: { desc: 'Guess the 5-letter word in 6 tries', run: puzzle.wordle },
  '2048': { desc: 'Slide tiles to reach 2048', run: puzzle.game2048 },
  minesweeper: { desc: 'Spoiler-tag minesweeper', run: puzzle.minesweeper, opts: (s) => s.addIntegerOption((o) => o.setName('mines').setDescription('Number of mines').setMinValue(3).setMaxValue(25)) },
  snake: { desc: 'Classic snake', run: puzzle.snake },
  memory: { desc: 'Find all matching pairs', run: puzzle.memory },
  rps: { desc: 'Rock paper scissors', run: quick.rps, opts: opponent },
  hangman: { desc: 'Guess the word letter by letter', run: quick.hangman },
  trivia: { desc: 'Answer a trivia question', run: quick.trivia },
  guess: { desc: 'Guess the number', run: quick.guess, opts: (s) => s.addIntegerOption((o) => o.setName('max').setDescription('Highest number (default 100)').setMinValue(10).setMaxValue(10000)) },
  fasttype: { desc: 'First to type the sentence wins', run: quick.fasttype },
  coinflip: { desc: 'Flip a coin', run: quick.coinflip },
  dice: {
    desc: 'Roll dice',
    run: quick.dice,
    opts: (s) => s.addIntegerOption((o) => o.setName('sides').setDescription('Sides').setMinValue(2).setMaxValue(1000)).addIntegerOption((o) => o.setName('count').setDescription('How many').setMinValue(1).setMaxValue(20)),
  },
};

const data = new SlashCommandBuilder().setName('game').setDescription('Play a mini-game');
for (const [name, g] of Object.entries(GAMES)) data.addSubcommand((s) => (g.opts ? g.opts(s.setName(name).setDescription(g.desc)) : s.setName(name).setDescription(g.desc)));

const game = {
  category: 'games',
  cooldown: 5,
  data,
  execute: (i) => GAMES[i.options.getSubcommand()].run(i),
};

const betOpt = (o) => o.setName('bet').setDescription('Coins to bet').setRequired(true).setMinValue(10).setMaxValue(1_000_000);
const blackjack = { category: 'economy', cooldown: 5, data: new SlashCommandBuilder().setName('blackjack').setDescription('Play blackjack for coins').addIntegerOption(betOpt), execute: casino.blackjack };
const slots = { category: 'economy', cooldown: 4, data: new SlashCommandBuilder().setName('slots').setDescription('Spin the slot machine').addIntegerOption(betOpt), execute: casino.slots };

module.exports = { commands: [game, blackjack, slots] };

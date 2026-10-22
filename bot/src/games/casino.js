const { EmbedBuilder } = require('discord.js');
const Member = require('../models/Member');
const { show, btn, row, ButtonStyle } = require('./common');
const { shuffle, randInt } = require('../utils/helpers');
const config = require('../config');

/** Atomically take `amount` coins. Returns the updated doc or null if too poor. */
async function takeBet(guildId, userId, amount) {
  await Member.updateOne({ guildId, userId }, { $setOnInsert: { guildId, userId } }, { upsert: true });
  return Member.findOneAndUpdate({ guildId, userId, coins: { $gte: amount } }, { $inc: { coins: -amount } }, { new: true });
}
const pay = (guildId, userId, amount) => Member.findOneAndUpdate({ guildId, userId }, { $inc: { coins: amount } }, { new: true });

/* ───────────────────── Blackjack ───────────────────── */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const newDeck = () => shuffle(SUITS.flatMap((s) => RANKS.map((r) => ({ r, s }))));
function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.r === 'A') { aces++; total += 11; } else if (['J', 'Q', 'K'].includes(c.r)) total += 10;
    else total += Number(c.r);
  }
  while (total > 21 && aces--) total -= 10;
  return total;
}
const fmt = (hand, hideSecond) => hand.map((c, n) => (hideSecond && n === 1 ? '`??`' : `\`${c.r}${c.s}\``)).join(' ');

async function blackjack(i) {
  let bet = i.options.getInteger('bet');
  const g = i.guild.id;
  const u = i.user.id;
  if (!(await takeBet(g, u, bet))) return i.reply({ content: "❌ You don't have enough coins. Try `/daily`.", flags: 64 });
  const deck = newDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];
  let doubled = false;

  const emb = (reveal, result) =>
    new EmbedBuilder()
      .setColor(result ? (result.includes('win') || result.includes('Blackjack') ? 0x2ecc71 : result.includes('Push') ? 0x95a5a6 : 0xe74c3c) : config.color)
      .setTitle(`🃏 Blackjack — bet ${bet.toLocaleString()}`)
      .addFields(
        { name: `Your hand (${handValue(player)})`, value: fmt(player) },
        { name: `Dealer (${reveal ? handValue(dealer) : '?'})`, value: fmt(dealer, !reveal) }
      )
      .setDescription(result || null);
  const controls = (done) => row(btn('bj-hit', 'Hit', ButtonStyle.Primary, done), btn('bj-stand', 'Stand', ButtonStyle.Secondary, done), btn('bj-double', 'Double', ButtonStyle.Success, done || player.length > 2));

  const settle = async (reason) => {
    while (handValue(dealer) < 17) dealer.push(deck.pop());
    const p = handValue(player);
    const d = handValue(dealer);
    let payout = 0;
    let result;
    if (reason === 'blackjack') { payout = Math.floor(bet * 2.5); result = `🎉 Blackjack! You win **${(payout - bet).toLocaleString()}**`; }
    else if (p > 21) result = `💥 Bust! You lose **${bet.toLocaleString()}**`;
    else if (d > 21 || p > d) { payout = bet * 2; result = `🎉 You win **${bet.toLocaleString()}**!`; }
    else if (p === d) { payout = bet; result = '🤝 Push — bet returned.'; }
    else result = `😢 Dealer wins. You lose **${bet.toLocaleString()}**`;
    const doc = payout ? await pay(g, u, payout) : await Member.findOne({ guildId: g, userId: u });
    return emb(true, `${result}\nBalance: 🪙 ${doc.coins.toLocaleString()}`);
  };

  if (handValue(player) === 21) return show(i, { embeds: [await settle('blackjack')] });
  const msg = await show(i, { embeds: [emb(false)], components: [controls(false)] });
  const col = msg.createMessageComponentCollector({ filter: (b) => b.user.id === u, idle: 60_000 });
  col.on('collect', async (b) => {
    const action = b.customId.split('-')[1];
    if (action === 'double') {
      if (!(await takeBet(g, u, bet))) return b.reply({ content: 'Not enough coins to double.', flags: 64 });
      bet *= 2;
      doubled = true;
      player.push(deck.pop());
    } else if (action === 'hit') player.push(deck.pop());
    if (action === 'stand' || doubled || handValue(player) >= 21) {
      col.stop('done');
      return b.update({ embeds: [await settle()], components: [controls(true)] });
    }
    return b.update({ embeds: [emb(false)], components: [controls(false)] });
  });
  col.on('end', async (_, r) => {
    if (r === 'idle') msg.edit({ embeds: [await settle()], components: [controls(true)] }).catch(() => null);
  });
}

/* ───────────────────── Slots ───────────────────── */
const REELS = [
  { e: '🍒', w: 30, pay: 3 },
  { e: '🍋', w: 25, pay: 4 },
  { e: '🍊', w: 20, pay: 5 },
  { e: '🍇', w: 14, pay: 8 },
  { e: '🔔', w: 7, pay: 15 },
  { e: '💎', w: 3, pay: 40 },
  { e: '7️⃣', w: 1, pay: 100 },
];
const spinOne = () => {
  let r = Math.random() * REELS.reduce((a, x) => a + x.w, 0);
  for (const x of REELS) if ((r -= x.w) < 0) return x;
  return REELS[0];
};
async function slots(i) {
  const bet = i.options.getInteger('bet');
  if (!(await takeBet(i.guild.id, i.user.id, bet))) return i.reply({ content: "❌ You don't have enough coins. Try `/daily`.", flags: 64 });
  const result = [spinOne(), spinOne(), spinOne()];
  let win = 0;
  if (result[0].e === result[1].e && result[1].e === result[2].e) win = bet * result[0].pay;
  else if (result[0].e === result[1].e || result[1].e === result[2].e || result[0].e === result[2].e) win = Math.floor(bet * 1.5);
  const doc = win ? await pay(i.guild.id, i.user.id, win) : await Member.findOne({ guildId: i.guild.id, userId: i.user.id });
  await i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle('🎰 Slots').setDescription('🎰 | 🔄 🔄 🔄 | 🎰\nSpinning…')] });
  await new Promise((r) => setTimeout(r, 1200));
  const e = new EmbedBuilder()
    .setColor(win ? 0x2ecc71 : 0xe74c3c)
    .setTitle('🎰 Slots')
    .setDescription(`🎰 | ${result.map((x) => x.e).join(' ')} | 🎰\n\n${win ? `You won **${win.toLocaleString()}** coins! 🎉` : `You lost **${bet.toLocaleString()}** coins.`}\nBalance: 🪙 ${doc.coins.toLocaleString()}`)
    .setFooter({ text: '3 of a kind: 3x–100x • any pair: 1.5x' });
  return i.editReply({ embeds: [e] });
}

module.exports = { blackjack, slots, randInt };

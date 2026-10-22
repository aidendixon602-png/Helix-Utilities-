const { Schema, model, models } = require('mongoose');

const GiveawaySchema = new Schema(
  {
    guildId: String,
    channelId: String,
    messageId: { type: String, index: true },
    hostId: String,
    prize: String,
    winnerCount: { type: Number, default: 1 },
    endsAt: { type: Date, index: true },
    ended: { type: Boolean, default: false },
    entrants: { type: [String], default: [] },
    winners: { type: [String], default: [] },
    requiredRole: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = models.Giveaway || model('Giveaway', GiveawaySchema);

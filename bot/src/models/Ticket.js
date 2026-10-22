const { Schema, model, models } = require('mongoose');

const TicketSchema = new Schema(
  {
    guildId: String,
    channelId: { type: String, index: true },
    ownerId: String,
    number: Number,
    open: { type: Boolean, default: true },
    claimedBy: { type: String, default: null },
    closedAt: Date,
  },
  { timestamps: true }
);

module.exports = models.Ticket || model('Ticket', TicketSchema);

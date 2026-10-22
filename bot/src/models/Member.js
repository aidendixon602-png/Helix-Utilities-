const { Schema, model, models } = require('mongoose');

const MemberSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },

    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    lastXpAt: { type: Date, default: null },

    warns: { type: [{ id: String, moderator: String, reason: String, at: Date }], default: [] },
    jailedRoles: { type: [String], default: [] },

    coins: { type: Number, default: 500 },
    lastDaily: { type: Date, default: null },

    invites: {
      regular: { type: Number, default: 0 },
      left: { type: Number, default: 0 },
      fake: { type: Number, default: 0 },
      bonus: { type: Number, default: 0 },
    },
    inviterId: { type: String, default: null },

    birthday: { month: Number, day: Number, lastAnnounced: Number },

    afk: { reason: String, since: Date },
    boosterRole: { type: String, default: null },
  },
  { timestamps: true }
);

MemberSchema.index({ guildId: 1, userId: 1 }, { unique: true });
MemberSchema.index({ guildId: 1, xp: -1 });

module.exports = models.Member || model('Member', MemberSchema);

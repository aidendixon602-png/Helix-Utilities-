// Copied from bot/src/models/Guild.js — keep both in sync when you add settings.
const { Schema, model, models } = require('mongoose');

const limit = (d) => ({ type: Number, default: d });

const GuildSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },

    antinuke: {
      enabled: { type: Boolean, default: false },
      whitelist: { type: [String], default: [] },
      punishment: { type: String, enum: ['ban', 'kick', 'strip'], default: 'ban' },
      windowSeconds: limit(10),
      limits: {
        ban: limit(3),
        kick: limit(3),
        channelCreate: limit(3),
        channelDelete: limit(2),
        roleCreate: limit(3),
        roleDelete: limit(2),
        webhookCreate: limit(2),
        emojiDelete: limit(3),
      },
      antiBotAdd: { type: Boolean, default: true },
      antiPrune: { type: Boolean, default: true },
      antiMemberUpdate: { type: Boolean, default: true },
      antiGuildUpdate: { type: Boolean, default: true },
      autoLockdown: { type: Boolean, default: false },
      logChannel: { type: String, default: null },
    },

    lockdown: {
      active: { type: Boolean, default: false },
      // previous @everyone SendMessages state per channel: true | false | null (unset)
      snapshot: { type: Map, of: Schema.Types.Mixed, default: {} },
    },

    automod: {
      enabled: { type: Boolean, default: false },
      action: { type: String, enum: ['delete', 'warn', 'timeout'], default: 'delete' },
      timeoutSeconds: limit(300),
      spam: { enabled: { type: Boolean, default: true }, maxMessages: limit(5), intervalSeconds: limit(5) },
      caps: { enabled: { type: Boolean, default: true }, percent: limit(70), minLength: limit(10) },
      links: { enabled: { type: Boolean, default: false }, allowed: { type: [String], default: [] } },
      invites: { enabled: { type: Boolean, default: true } },
      mentions: { enabled: { type: Boolean, default: true }, max: limit(5) },
      emoji: { enabled: { type: Boolean, default: false }, max: limit(10) },
      badWords: { type: [String], default: [] },
      ignoredChannels: { type: [String], default: [] },
      ignoredRoles: { type: [String], default: [] },
    },

    logs: {
      mod: { type: String, default: null },
      message: { type: String, default: null },
      member: { type: String, default: null },
      server: { type: String, default: null },
      voice: { type: String, default: null },
      invite: { type: String, default: null },
    },

    moderation: {
      jailRole: { type: String, default: null },
      jailChannel: { type: String, default: null },
      dmOnAction: { type: Boolean, default: true },
    },

    autorole: {
      humans: { type: [String], default: [] },
      bots: { type: [String], default: [] },
    },

    welcome: {
      channel: { type: String, default: null },
      message: { type: String, default: 'Welcome {user} to **{server}**! You are member #{count}.' },
    },

    leveling: {
      enabled: { type: Boolean, default: true },
      multiplier: { type: Number, default: 1 },
      announce: { type: String, enum: ['current', 'channel', 'dm', 'off'], default: 'current' },
      channel: { type: String, default: null },
      message: { type: String, default: 'GG {user}, you reached **level {level}**! 🎉' },
      noXpChannels: { type: [String], default: [] },
      rewards: { type: [{ level: Number, roleId: String }], default: [] },
      stackRewards: { type: Boolean, default: true },
    },

    verification: {
      enabled: { type: Boolean, default: false },
      role: { type: String, default: null },
      channel: { type: String, default: null },
      captcha: { type: Boolean, default: true },
    },

    tickets: {
      category: { type: String, default: null },
      supportRole: { type: String, default: null },
      logChannel: { type: String, default: null },
      counter: { type: Number, default: 0 },
      openMessage: { type: String, default: 'Support will be with you shortly. Describe your issue below.' },
    },

    jtc: {
      hub: { type: String, default: null },
      category: { type: String, default: null },
      nameTemplate: { type: String, default: "{user}'s channel" },
      temp: { type: [String], default: [] },
    },

    counting: {
      channel: { type: String, default: null },
      current: { type: Number, default: 0 },
      lastUser: { type: String, default: null },
      highScore: { type: Number, default: 0 },
    },

    birthdays: {
      channel: { type: String, default: null },
      role: { type: String, default: null },
      message: { type: String, default: '🎂 Happy birthday {user}! Have an amazing day!' },
    },

    vanity: {
      text: { type: String, default: null },
      role: { type: String, default: null },
      channel: { type: String, default: null },
    },

    booster: {
      channel: { type: String, default: null },
      message: { type: String, default: 'Thank you {user} for boosting **{server}**! 💜' },
      customRoles: { type: Boolean, default: true },
      anchorRole: { type: String, default: null },
    },

    autoresponders: { type: [{ trigger: String, response: String, match: { type: String, default: 'contains' } }], default: [] },
    sticky: { type: [{ channelId: String, content: String, lastMessageId: String }], default: [] },
    reactionRoles: { type: [{ channelId: String, messageId: String, emoji: String, roleId: String }], default: [] },

  },
  { timestamps: true, minimize: false }
);

module.exports = models.Guild || model('Guild', GuildSchema);

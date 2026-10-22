// Every setting the dashboard may change, with its type. Anything not listed is ignored,
// so a user can never write arbitrary fields into the database.
// `owner: true` = only the server owner can change it (antinuke).

const snowflake = (v) => (v === null || v === '' ? null : /^\d{17,20}$/.test(String(v)) ? String(v) : undefined);
const T = {
  bool: (v) => (typeof v === 'boolean' ? v : undefined),
  int: (min, max) => (v) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined),
  num: (min, max) => (v) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined),
  str: (max) => (v) => (typeof v === 'string' && v.length <= max ? v : undefined),
  oneOf: (...opts) => (v) => (opts.includes(v) ? v : undefined),
  id: snowflake,
  ids: (v) => (Array.isArray(v) && v.length <= 100 && v.every((x) => snowflake(x)) ? v.map(String) : undefined),
  words: (v) => (Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === 'string' && x.length <= 100) ? v.map((x) => x.trim()).filter(Boolean) : undefined),
  rewards: (v) =>
    Array.isArray(v) && v.length <= 50 && v.every((r) => Number.isInteger(Number(r.level)) && snowflake(r.roleId))
      ? v.map((r) => ({ level: Number(r.level), roleId: String(r.roleId) }))
      : undefined,
  responders: (v) =>
    Array.isArray(v) && v.length <= 50 && v.every((r) => typeof r.trigger === 'string' && r.trigger.length <= 100 && typeof r.response === 'string' && r.response.length <= 1800)
      ? v.filter((r) => r.trigger.trim() && r.response.trim()).map((r) => ({ trigger: r.trigger.trim(), response: r.response, match: ['exact', 'startswith'].includes(r.match) ? r.match : 'contains' }))
      : undefined,
};

export const SPEC = {
  // antinuke — owner only
  'antinuke.enabled': { t: T.bool, owner: true },
  'antinuke.punishment': { t: T.oneOf('ban', 'kick', 'strip'), owner: true },
  'antinuke.windowSeconds': { t: T.int(3, 300), owner: true },
  'antinuke.logChannel': { t: T.id, owner: true },
  'antinuke.whitelist': { t: T.ids, owner: true },
  'antinuke.antiBotAdd': { t: T.bool, owner: true },
  'antinuke.antiPrune': { t: T.bool, owner: true },
  'antinuke.antiMemberUpdate': { t: T.bool, owner: true },
  'antinuke.antiGuildUpdate': { t: T.bool, owner: true },
  'antinuke.autoLockdown': { t: T.bool, owner: true },
  ...Object.fromEntries(['ban', 'kick', 'channelCreate', 'channelDelete', 'roleCreate', 'roleDelete', 'webhookCreate', 'emojiDelete'].map((k) => [`antinuke.limits.${k}`, { t: T.int(1, 50), owner: true }])),

  // automod
  'automod.enabled': { t: T.bool },
  'automod.action': { t: T.oneOf('delete', 'warn', 'timeout') },
  'automod.timeoutSeconds': { t: T.int(10, 2419200) },
  'automod.spam.enabled': { t: T.bool },
  'automod.spam.maxMessages': { t: T.int(2, 30) },
  'automod.spam.intervalSeconds': { t: T.int(2, 60) },
  'automod.caps.enabled': { t: T.bool },
  'automod.caps.percent': { t: T.int(30, 100) },
  'automod.links.enabled': { t: T.bool },
  'automod.links.allowed': { t: T.words },
  'automod.invites.enabled': { t: T.bool },
  'automod.mentions.enabled': { t: T.bool },
  'automod.mentions.max': { t: T.int(1, 50) },
  'automod.emoji.enabled': { t: T.bool },
  'automod.emoji.max': { t: T.int(1, 100) },
  'automod.badWords': { t: T.words },
  'automod.ignoredChannels': { t: T.ids },
  'automod.ignoredRoles': { t: T.ids },

  // logs
  ...Object.fromEntries(['mod', 'message', 'member', 'server', 'voice', 'invite'].map((k) => [`logs.${k}`, { t: T.id }])),

  // welcome & autorole
  'welcome.channel': { t: T.id },
  'welcome.message': { t: T.str(1500) },
  'autorole.humans': { t: T.ids },
  'autorole.bots': { t: T.ids },
  'moderation.dmOnAction': { t: T.bool },

  // leveling
  'leveling.enabled': { t: T.bool },
  'leveling.multiplier': { t: T.num(0.1, 5) },
  'leveling.announce': { t: T.oneOf('current', 'channel', 'dm', 'off') },
  'leveling.channel': { t: T.id },
  'leveling.message': { t: T.str(500) },
  'leveling.noXpChannels': { t: T.ids },
  'leveling.rewards': { t: T.rewards },
  'leveling.stackRewards': { t: T.bool },

  // tickets / verification
  'tickets.supportRole': { t: T.id },
  'tickets.category': { t: T.id },
  'tickets.logChannel': { t: T.id },
  'tickets.openMessage': { t: T.str(1000) },
  'verification.enabled': { t: T.bool },
  'verification.role': { t: T.id },
  'verification.captcha': { t: T.bool },

  // engagement
  'birthdays.channel': { t: T.id },
  'birthdays.role': { t: T.id },
  'birthdays.message': { t: T.str(500) },
  'booster.channel': { t: T.id },
  'booster.message': { t: T.str(500) },
  'booster.customRoles': { t: T.bool },
  'counting.channel': { t: T.id },
  'vanity.text': { t: (v) => (v === '' || v === null ? null : T.str(100)(v)) },
  'vanity.role': { t: T.id },
  'vanity.channel': { t: T.id },
  'jtc.nameTemplate': { t: T.str(90) },
  autoresponders: { t: T.responders },
};

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Build a safe $set from a nested settings object. Returns { $set, rejected[] }. */
export function sanitize(body, { isOwner }) {
  const $set = {};
  const rejected = [];
  for (const [path, { t, owner }] of Object.entries(SPEC)) {
    const raw = get(body, path);
    if (raw === undefined) continue;
    if (owner && !isOwner) continue;
    const v = t(raw);
    if (v === undefined) rejected.push(path);
    else $set[path] = v;
  }
  return { $set, rejected };
}

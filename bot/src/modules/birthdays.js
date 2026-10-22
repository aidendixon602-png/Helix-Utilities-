const Member = require('../models/Member');
const { getGuild } = require('../utils/db');
const { template } = require('../utils/helpers');
const config = require('../config');
const log = require('../utils/logger');

function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: config.birthdayTimezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

async function tick(client) {
  const { year, month, day } = today();
  for (const guild of client.guilds.cache.values()) {
    const s = await getGuild(guild.id).catch(() => null);
    if (!s?.birthdays?.channel && !s?.birthdays?.role) continue;
    const role = s.birthdays.role && guild.roles.cache.get(s.birthdays.role);

    // remove the birthday role from people whose birthday is over
    if (role?.editable) {
      for (const m of role.members.values()) {
        const doc = await Member.findOne({ guildId: guild.id, userId: m.id }).lean();
        if (!(doc?.birthday?.month === month && doc?.birthday?.day === day)) await m.roles.remove(role, 'Birthday over').catch(() => null);
      }
    }

    const due = await Member.find({ guildId: guild.id, 'birthday.month': month, 'birthday.day': day, 'birthday.lastAnnounced': { $ne: year } });
    for (const doc of due) {
      const member = await guild.members.fetch(doc.userId).catch(() => null);
      if (!member) continue;
      if (role?.editable) await member.roles.add(role, 'Happy birthday!').catch(() => null);
      const ch = s.birthdays.channel && guild.channels.cache.get(s.birthdays.channel);
      if (ch) await ch.send({ content: template(s.birthdays.message, { user: `${member}`, username: member.user.username, server: guild.name }) }).catch(() => null);
      doc.birthday.lastAnnounced = year;
      doc.markModified('birthday');
      await doc.save();
    }
  }
}

function startScheduler(client) {
  const run = () => tick(client).catch((e) => log.warn('Birthday tick failed:', e.message));
  setTimeout(run, 20_000);
  setInterval(run, 30 * 60_000);
}

module.exports = { startScheduler, today };

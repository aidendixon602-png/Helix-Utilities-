const API = 'https://discord.com/api/v10';
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

const cache = new Map(); // key -> { at, data }
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function discord(path, auth) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: auth }, cache: 'no-store' });
  if (res.status === 429) {
    const j = await res.json().catch(() => ({}));
    await new Promise((r) => setTimeout(r, Math.min((j.retry_after || 1) * 1000, 5000)));
    return discord(path, auth);
  }
  if (!res.ok) throw new Error(`Discord API ${res.status} on ${path}`);
  return res.json();
}

export const getUserGuilds = (accessToken) => cached(`ug:${accessToken}`, 60_000, () => discord('/users/@me/guilds', `Bearer ${accessToken}`));

/** Guild IDs the bot is in (paginated). */
export const getBotGuildIds = () =>
  cached('botguilds', 60_000, async () => {
    const ids = new Set();
    let after = '0';
    for (let page = 0; page < 50; page++) {
      const list = await discord(`/users/@me/guilds?limit=200&after=${after}`, `Bot ${process.env.DISCORD_BOT_TOKEN}`);
      list.forEach((g) => ids.add(g.id));
      if (list.length < 200) break;
      after = list[list.length - 1].id;
    }
    return ids;
  });

export const getGuildChannels = (id) => cached(`ch:${id}`, 30_000, () => discord(`/guilds/${id}/channels`, `Bot ${process.env.DISCORD_BOT_TOKEN}`));
export const getGuildRoles = (id) => cached(`rl:${id}`, 30_000, () => discord(`/guilds/${id}/roles`, `Bot ${process.env.DISCORD_BOT_TOKEN}`));

export const canManage = (g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD || (BigInt(g.permissions) & ADMINISTRATOR) === ADMINISTRATOR;

export const iconUrl = (g, size = 128) => (g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=${size}` : null);
export const avatarUrl = (u) => (u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`);

/** Returns the user's guild entry if they may manage it, else null. */
export async function authorizeGuild(session, guildId) {
  if (!session) return null;
  const guilds = await getUserGuilds(session.accessToken).catch(() => []);
  const g = guilds.find((x) => x.id === guildId);
  return g && canManage(g) ? g : null;
}

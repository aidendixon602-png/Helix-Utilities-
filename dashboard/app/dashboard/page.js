import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import { getUserGuilds, getBotGuildIds, canManage, iconUrl } from '@/lib/discord';
import { inviteUrl } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const session = await readSession();
  if (!session) redirect('/api/auth/login?next=/dashboard');

  let guilds = [];
  let botIds = new Set();
  let error = null;
  try {
    [guilds, botIds] = await Promise.all([getUserGuilds(session.accessToken), getBotGuildIds()]);
  } catch (e) {
    error = 'Could not load your servers from Discord. Try logging in again.';
  }
  const manageable = guilds.filter(canManage).sort((a, b) => Number(botIds.has(b.id)) - Number(botIds.has(a.id)) || a.name.localeCompare(b.name));

  return (
    <main className="wrap page">
      <h1>Your servers</h1>
      <p className="sub">Servers where you have <b>Manage Server</b>. Pick one to configure.</p>
      {error && <div className="locked">{error} <a href="/api/auth/logout" style={{ textDecoration: 'underline' }}>Log out</a></div>}
      <div className="guilds">
        {manageable.map((g) => {
          const has = botIds.has(g.id);
          const icon = iconUrl(g);
          return (
            <div className="guild" key={g.id}>
              <div className="icon">{icon ? <img src={icon} alt="" /> : g.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3)}</div>
              <div className="name">{g.name}</div>
              {has ? <a className="btn primary small" href={`/dashboard/${g.id}`}>Manage</a> : <a className="btn small" href={inviteUrl(g.id)}>Invite bot</a>}
            </div>
          );
        })}
        {!manageable.length && !error && <p className="sub">You don't manage any servers yet.</p>}
      </div>
    </main>
  );
}

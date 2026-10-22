import { brand, inviteUrl } from '@/lib/brand';

export const revalidate = 60;

async function publicStats() {
  if (!process.env.BOT_API_URL) return null;
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/public`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(3000) });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

const FEATURES = [
  ['🛡️', 'Security', ['Antinuke: bans, kicks, channel & role floods, webhooks, bot adds, prunes', 'Automod: spam, caps, links, invites, mentions, emoji', 'Whitelist & emergency lockdown']],
  ['⚙️', 'Management', ['Moderation, warnings & jail', 'Full logging & invite tracking', 'Tickets, giveaways, verification, join-to-create']],
  ['🎉', 'Engagement', ['Levels, XP rewards & leaderboards', 'Birthdays, AFK, autoroles, sticky messages', '16 mini-games, counting, blackjack & slots']],
];

export default async function Home() {
  const stats = await publicStats();
  return (
    <main>
      <section className="hero wrap">
        <h1>{brand.name}</h1>
        <p>{brand.tagline}</p>
        <div className="cta">
          <a className="btn primary" href={inviteUrl()}>Add to Discord</a>
          <a className="btn" href="/dashboard">Open dashboard</a>
        </div>
        {stats && (
          <div className="counters">
            <div><b>{stats.guilds.toLocaleString()}</b><span>Servers</span></div>
            <div><b>{stats.users.toLocaleString()}</b><span>Users</span></div>
            <div><b>{stats.commands}</b><span>Commands</span></div>
          </div>
        )}
      </section>
      <section className="wrap features">
        {FEATURES.map(([icon, title, items]) => (
          <div className="feature" key={title}>
            <h3><span>{icon}</span>{title}</h3>
            <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </section>
    </main>
  );
}

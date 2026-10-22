import { redirect, notFound } from 'next/navigation';
import { readSession } from '@/lib/session';
import { authorizeGuild, getBotGuildIds, getGuildChannels, getGuildRoles, iconUrl } from '@/lib/discord';
import { getSettings } from '@/lib/db';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function GuildPage({ params }) {
  const { guildId } = await params;
  const session = await readSession();
  if (!session) redirect(`/api/auth/login?next=/dashboard/${guildId}`);
  const g = await authorizeGuild(session, guildId);
  if (!g) notFound();
  if (!(await getBotGuildIds()).has(guildId)) redirect('/dashboard');

  const [settings, channels, roles] = await Promise.all([getSettings(guildId), getGuildChannels(guildId), getGuildRoles(guildId)]);
  const text = channels.filter((c) => [0, 5].includes(c.type)).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: `#${c.name}` }));
  const categories = channels.filter((c) => c.type === 4).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name }));
  const roleList = roles.filter((r) => r.id !== guildId && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: `@${r.name}` }));

  return (
    <main className="wrap page">
      <div className="row" style={{ gap: 14, marginBottom: 24 }}>
        <div className="guild" style={{ padding: 0, border: 0, background: 'none' }}>
          <div className="icon" style={{ width: 52, height: 52 }}>{iconUrl(g) ? <img src={iconUrl(g)} alt="" /> : g.name[0]}</div>
        </div>
        <div>
          <h1 style={{ margin: 0 }}>{g.name}</h1>
          <p className="sub" style={{ margin: 0 }}>Changes apply instantly after saving.</p>
        </div>
      </div>
      <SettingsForm guildId={guildId} initial={settings} channels={text} categories={categories} roles={roleList} isOwner={!!g.owner} />
    </main>
  );
}

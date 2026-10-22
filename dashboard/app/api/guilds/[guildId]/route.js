import { NextResponse } from 'next/server';
import { readSession } from '@/lib/session';
import { authorizeGuild, getBotGuildIds } from '@/lib/discord';
import { getSettings, saveSettings } from '@/lib/db';
import { sanitize } from '@/lib/settingsSpec';

async function guard(params) {
  const { guildId } = await params;
  const session = await readSession();
  if (!session) return { error: NextResponse.json({ error: 'not logged in' }, { status: 401 }) };
  const g = await authorizeGuild(session, guildId);
  if (!g) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  if (!(await getBotGuildIds()).has(guildId)) return { error: NextResponse.json({ error: 'bot not in server' }, { status: 404 }) };
  return { guildId, g, session };
}

export async function GET(_req, { params }) {
  const r = await guard(params);
  if (r.error) return r.error;
  return NextResponse.json(await getSettings(r.guildId));
}

export async function PUT(req, { params }) {
  const r = await guard(params);
  if (r.error) return r.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'bad body' }, { status: 400 });
  const { $set, rejected } = sanitize(body, { isOwner: !!r.g.owner });
  if (Object.keys($set).length) await saveSettings(r.guildId, $set);

  // tell the bot to drop its 60s cache so changes apply immediately
  if (process.env.BOT_API_URL) {
    await fetch(`${process.env.BOT_API_URL}/guilds/${r.guildId}/invalidate`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.BOT_API_KEY || '' },
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true, saved: Object.keys($set).length, rejected });
}

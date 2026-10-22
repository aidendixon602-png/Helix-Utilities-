import { NextResponse } from 'next/server';

export async function GET(req) {
  const state = crypto.randomUUID();
  const next = new URL(req.url).searchParams.get('next') || '/dashboard';
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: `${process.env.PUBLIC_URL}/api/auth/callback`,
    response_type: 'code',
    scope: 'identify guilds',
    // Consent works for new and existing Discord sessions; `none` fails for new sessions.
    prompt: 'consent',
  });
  const res = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`);
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  };
  res.cookies.set('nx_state', state, opts);
  res.cookies.set('nx_next', next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', opts);
  return res;
}

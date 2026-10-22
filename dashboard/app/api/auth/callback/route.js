import { NextResponse } from 'next/server';
import { createSession, cookieOptions } from '@/lib/session';

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = req.cookies.get('nx_state')?.value;
  const next = req.cookies.get('nx_next')?.value || '/dashboard';
  const base = process.env.PUBLIC_URL;
  if (!code || !state || state !== expected) return NextResponse.redirect(`${base}/?error=state`);

  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${base}/api/auth/callback`,
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(`${base}/?error=token`);
  const token = await tokenRes.json();

  const userRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!userRes.ok) return NextResponse.redirect(`${base}/?error=user`);
  const user = await userRes.json();

  const session = await createSession({
    id: user.id,
    username: user.global_name || user.username,
    avatar: user.avatar,
    accessToken: token.access_token,
  });
  const res = NextResponse.redirect(`${base}${next}`);
  res.cookies.set({ ...cookieOptions, value: session });
  res.cookies.delete('nx_state');
  res.cookies.delete('nx_next');
  return res;
}

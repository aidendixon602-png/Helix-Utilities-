import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Proxies the bot's stats API so the API key never reaches the browser.
export async function GET() {
  if (!process.env.BOT_API_URL) return NextResponse.json({ online: false, error: 'BOT_API_URL not set' });
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/stats`, {
      headers: { 'x-api-key': process.env.BOT_API_KEY || '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ online: false, error: `API ${res.status}` });
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json({ online: false, error: 'Bot API unreachable' });
  }
}

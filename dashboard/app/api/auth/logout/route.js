import { NextResponse } from 'next/server';
import { cookieOptions } from '@/lib/session';

export async function GET() {
  const res = NextResponse.redirect(`${process.env.PUBLIC_URL}/`);
  res.cookies.set({ ...cookieOptions, value: '', maxAge: 0 });
  return res;
}

import './globals.css';
import Link from 'next/link';
import { brand } from '@/lib/brand';
import { readSession } from '@/lib/session';
import { avatarUrl } from '@/lib/discord';

export const metadata = {
  title: `${brand.name} — Dashboard`,
  description: brand.tagline,
  icons: brand.logo ? { icon: brand.logo } : undefined,
};

export default async function RootLayout({ children }) {
  const session = await readSession().catch(() => null);
  return (
    <html lang="en" style={{ '--brand': brand.color }}>
      <body>
        <nav className="nav">
          <div className="wrap">
            <Link href="/" className="brandmark">
              {brand.logo ? <img src={brand.logo} alt="" /> : <span className="dot">{brand.name[0]}</span>}
              {brand.name}
            </Link>
            <div className="links">
              <Link href="/dashboard">Servers</Link>
              <Link href="/stats">Live stats</Link>
              {brand.support && <a href={brand.support}>Support</a>}
            </div>
            <div className="spacer" />
            {session ? (
              <div className="user">
                <img src={avatarUrl({ id: session.id, avatar: session.avatar })} alt="" />
                <span>{session.username}</span>
                <a className="btn small ghost" href="/api/auth/logout">Log out</a>
              </div>
            ) : (
              <a className="btn primary small" href="/api/auth/login">Login with Discord</a>
            )}
          </div>
        </nav>
        {children}
        <footer className="footer">
          <div className="wrap">© {new Date().getFullYear()} {brand.name}. Not affiliated with Discord.</div>
        </footer>
      </body>
    </html>
  );
}

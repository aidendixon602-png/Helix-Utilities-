'use client';
import { useEffect, useState } from 'react';

const fmtUptime = (ms) => {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d ? `${d}d ` : ''}${h}h ${m}m`;
};

function Spark({ data, field, label, unit = '' }) {
  if (!data?.length) return null;
  const vals = data.map((d) => d[field] ?? 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const w = 600;
  const h = 120;
  const pts = vals.map((v, i) => `${(i / Math.max(vals.length - 1, 1)) * w},${h - 8 - ((v - min) / (max - min || 1)) * (h - 16)}`).join(' ');
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 15 }}>{label}</h2>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 13 }}>now {vals.at(-1)}{unit} · max {max}{unit}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={`0,${h} ${pts} ${w},${h}`} fill="color-mix(in srgb, var(--brand) 18%, transparent)" stroke="none" />
        <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export default function Stats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/stats').then((r) => r.json()).then((j) => alive && setS(j)).catch(() => null);
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const tiles = s?.online
    ? [
        ['Servers', s.guilds.toLocaleString()],
        ['Users', s.users.toLocaleString()],
        ['Gateway ping', `${s.ping}ms`],
        ['Uptime', fmtUptime(s.uptime)],
        ['Commands run', s.commandsRun.toLocaleString()],
        ['Memory', `${s.memoryMb} MB`],
        ['CPU load', s.loadAvg.toFixed(2)],
      ]
    : [];

  return (
    <main className="wrap page">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Live stats</h1>
          <p className="sub">Refreshes every 5 seconds.</p>
        </div>
        <span className={`status ${s?.online ? 'on' : ''}`}><i />{s ? (s.online ? `Online — ${s.tag}` : `Offline${s.error ? ` (${s.error})` : ''}`) : 'Loading…'}</span>
      </div>
      <div className="stats">
        {tiles.map(([k, val]) => (
          <div className="stat" key={k}><span>{k}</span><b>{val}</b></div>
        ))}
      </div>
      {s?.online && (
        <>
          <Spark data={s.history} field="ping" label="Gateway ping" unit="ms" />
          <Spark data={s.history} field="memory" label="Memory" unit=" MB" />
          <div className="card">
            <h2 style={{ fontSize: 15 }}>Runtime</h2>
            <p className="hint" style={{ marginTop: 12 }}>Node {s.node} · discord.js {s.discordjs}</p>
          </div>
        </>
      )}
    </main>
  );
}

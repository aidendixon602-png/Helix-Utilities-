'use client';
import { createContext, useContext, useMemo, useState } from 'react';

const Ctx = createContext(null);

const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
function setIn(o, p, v) {
  const copy = structuredClone(o);
  const keys = p.split('.');
  let cur = copy;
  keys.slice(0, -1).forEach((k) => (cur = cur[k] ??= {}));
  cur[keys.at(-1)] = v;
  return copy;
}

const Toggle = ({ path, label, desc, disabled }) => { const { v, set } = useContext(Ctx); return (
  <div className="toggle">
    <div><div className="t">{label}</div>{desc && <div className="d">{desc}</div>}</div>
    <label className="switch"><input type="checkbox" disabled={disabled} checked={!!v(path)} onChange={(e) => set(path)(e.target.checked)} /><span /></label>
  </div>
); };
const Pick = ({ path, label, options, disabled, none = 'None' }) => { const { v, set } = useContext(Ctx); return (
  <div className="field">
    <label>{label}</label>
    <select className="input" disabled={disabled} value={v(path) || ''} onChange={(e) => set(path)(e.target.value || null)}>
      <option value="">{none}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  </div>
); };
const Num = ({ path, label, min, max, step = 1, disabled }) => { const { v, set } = useContext(Ctx); return (
  <div className="field">
    <label>{label}</label>
    <input className="input" type="number" min={min} max={max} step={step} disabled={disabled} value={v(path) ?? ''} onChange={(e) => set(path)(e.target.value === '' ? null : Number(e.target.value))} />
  </div>
); };
const Text = ({ path, label, area, placeholder, disabled }) => { const { v, set } = useContext(Ctx); return (
  <div className="field">
    <label>{label}</label>
    {area ? (
      <textarea className="input" placeholder={placeholder} disabled={disabled} value={v(path) || ''} onChange={(e) => set(path)(e.target.value)} />
    ) : (
      <input className="input" placeholder={placeholder} disabled={disabled} value={v(path) || ''} onChange={(e) => set(path)(e.target.value)} />
    )}
  </div>
); };
const Select = ({ path, label, options, disabled }) => { const { v, set } = useContext(Ctx); return (
  <div className="field">
    <label>{label}</label>
    <select className="input" disabled={disabled} value={v(path)} onChange={(e) => set(path)(e.target.value)}>
      {options.map(([val, name]) => <option key={val} value={val}>{name}</option>)}
    </select>
  </div>
); };
const MultiPick = ({ path, label, options, disabled }) => {
  const { v, set } = useContext(Ctx);
  const list = v(path) || [];
  const name = (id) => options.find((o) => o.id === id)?.name || id;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips" style={{ marginBottom: 6 }}>
        {list.map((id) => (
          <span className="chip" key={id}>{name(id)}{!disabled && <button onClick={() => set(path)(list.filter((x) => x !== id))}>✕</button>}</span>
        ))}
      </div>
      <select className="input" disabled={disabled} value="" onChange={(e) => e.target.value && set(path)([...new Set([...list, e.target.value])])}>
        <option value="">Add…</option>
        {options.filter((o) => !list.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
};
const Words = ({ path, label, placeholder, disabled }) => {
  const { v, set } = useContext(Ctx);
  const [draft, setDraft] = useState('');
  const list = v(path) || [];
  const add = () => {
    const w = draft.trim();
    if (w && !list.includes(w)) set(path)([...list, w]);
    setDraft('');
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips" style={{ marginBottom: 6 }}>
        {list.map((w) => <span className="chip" key={w}>{w}{!disabled && <button onClick={() => set(path)(list.filter((x) => x !== w))}>✕</button>}</span>)}
      </div>
      <div className="row">
        <input className="input" disabled={disabled} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button className="btn small" disabled={disabled} onClick={add}>Add</button>
      </div>
    </div>
  );
};


const SECTIONS = [
  ['antinuke', '🛡️ Antinuke'],
  ['automod', '🤖 Automod'],
  ['logs', '📜 Logging'],
  ['welcome', '👋 Welcome & roles'],
  ['leveling', '📈 Leveling'],
  ['support', '🎫 Tickets & verify'],
  ['engagement', '🎉 Engagement'],
  ['responders', '💬 Autoresponders'],
];

export default function SettingsForm({ guildId, initial, channels, categories, roles, isOwner }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [tab, setTab] = useState('antinuke');
  const [status, setStatus] = useState('');
  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);
  const set = (p) => (v) => setS((cur) => setIn(cur, p, v));
  const v = (p) => get(s, p);

  async function save() {
    setStatus('Saving…');
    const res = await fetch(`/api/guilds/${guildId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus(`Error: ${j.error || res.status}`);
    setSaved(s);
    setStatus(j.rejected?.length ? `Saved, but some values were invalid: ${j.rejected.join(', ')}` : 'Saved ✓');
    setTimeout(() => setStatus(''), 4000);
  }

  const ownerLock = !isOwner;
  const LIMITS = [['ban', 'Bans'], ['kick', 'Kicks'], ['channelCreate', 'Channel creates'], ['channelDelete', 'Channel deletes'], ['roleCreate', 'Role creates'], ['roleDelete', 'Role deletes'], ['webhookCreate', 'Webhook creates'], ['emojiDelete', 'Emoji deletes']];

  return (
    <Ctx.Provider value={{ v, set }}>
    <div className="settings">
      <aside className="sidebar">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </aside>

      <section>
        {tab === 'antinuke' && (
          <>
            {ownerLock && <div className="locked">🔒 Only the server owner can change antinuke settings.</div>}
            <div className="card">
              <h2>Antinuke</h2>
              <p className="hint">Stops rogue admins and compromised bots. Keep the bot's role at the top of the role list.</p>
              <Toggle path="antinuke.enabled" label="Enable antinuke" disabled={ownerLock} />
              <Toggle path="antinuke.antiBotAdd" label="Block unauthorised bot adds" desc="Bans the bot and punishes whoever added it" disabled={ownerLock} />
              <Toggle path="antinuke.antiPrune" label="Anti member prune" disabled={ownerLock} />
              <Toggle path="antinuke.antiMemberUpdate" label="Anti dangerous role/permission grants" desc="Reverts giving admin-level roles or permissions" disabled={ownerLock} />
              <Toggle path="antinuke.antiGuildUpdate" label="Protect vanity URL" disabled={ownerLock} />
              <Toggle path="antinuke.autoLockdown" label="Auto lockdown when triggered" disabled={ownerLock} />
            </div>
            <div className="card">
              <h2>Limits</h2>
              <p className="hint">How many of each action a non-whitelisted user can do within the window before being punished.</p>
              <div className="grid2">
                <Select path="antinuke.punishment" label="Punishment" options={[['ban', 'Ban'], ['kick', 'Kick'], ['strip', 'Strip roles']]} disabled={ownerLock} />
                <Num path="antinuke.windowSeconds" label="Window (seconds)" min={3} max={300} disabled={ownerLock} />
                {LIMITS.map(([k, label]) => <Num key={k} path={`antinuke.limits.${k}`} label={label} min={1} max={50} disabled={ownerLock} />)}
                <Pick path="antinuke.logChannel" label="Alert channel" options={channels} disabled={ownerLock} none="Mod log / owner DM" />
              </div>
            </div>
            <div className="card">
              <h2>Whitelist</h2>
              <p className="hint">User or bot IDs that antinuke and automod ignore. Server owner is always trusted.</p>
              <Words path="antinuke.whitelist" label="Whitelisted IDs" placeholder="Paste a user ID" disabled={ownerLock} />
            </div>
          </>
        )}

        {tab === 'automod' && (
          <>
            <div className="card">
              <h2>Automod</h2>
              <p className="hint">Members with Manage Messages are never filtered.</p>
              <Toggle path="automod.enabled" label="Enable automod" />
              <div className="grid2" style={{ marginTop: 12 }}>
                <Select path="automod.action" label="Action" options={[['delete', 'Delete only'], ['warn', 'Delete + warn'], ['timeout', 'Delete + timeout']]} />
                <Num path="automod.timeoutSeconds" label="Timeout (seconds)" min={10} max={2419200} />
              </div>
            </div>
            <div className="card">
              <h2>Filters</h2>
              <Toggle path="automod.spam.enabled" label="Spam" />
              <div className="grid2"><Num path="automod.spam.maxMessages" label="Max messages" min={2} max={30} /><Num path="automod.spam.intervalSeconds" label="Per seconds" min={2} max={60} /></div>
              <Toggle path="automod.caps.enabled" label="Excessive caps" />
              <div className="grid2"><Num path="automod.caps.percent" label="Caps %" min={30} max={100} /></div>
              <Toggle path="automod.invites.enabled" label="Discord invites" />
              <Toggle path="automod.links.enabled" label="Links" />
              <Words path="automod.links.allowed" label="Allowed domains" placeholder="youtube.com" />
              <Toggle path="automod.mentions.enabled" label="Mass mentions" />
              <div className="grid2"><Num path="automod.mentions.max" label="Max mentions" min={1} max={50} /></div>
              <Toggle path="automod.emoji.enabled" label="Emoji spam" />
              <div className="grid2"><Num path="automod.emoji.max" label="Max emoji" min={1} max={100} /></div>
            </div>
            <div className="card">
              <h2>Blocked words & exceptions</h2>
              <Words path="automod.badWords" label="Blocked words" placeholder="Add a word" />
              <div className="grid2" style={{ marginTop: 12 }}>
                <MultiPick path="automod.ignoredChannels" label="Ignored channels" options={channels} />
                <MultiPick path="automod.ignoredRoles" label="Ignored roles" options={roles} />
              </div>
            </div>
          </>
        )}

        {tab === 'logs' && (
          <div className="card">
            <h2>Logging</h2>
            <p className="hint">Tip: run <code>/logs setup</code> to create every channel automatically.</p>
            <div className="grid2">
              {[['mod', 'Moderation'], ['message', 'Messages'], ['member', 'Members'], ['server', 'Server'], ['voice', 'Voice'], ['invite', 'Invites']].map(([k, l]) => (
                <Pick key={k} path={`logs.${k}`} label={`${l} log`} options={channels} none="Disabled" />
              ))}
            </div>
            <div style={{ marginTop: 12 }}><Toggle path="moderation.dmOnAction" label="DM members when they are punished" /></div>
          </div>
        )}

        {tab === 'welcome' && (
          <>
            <div className="card">
              <h2>Welcome messages</h2>
              <p className="hint">Variables: {'{user} {username} {server} {count}'}</p>
              <div className="grid2"><Pick path="welcome.channel" label="Channel" options={channels} none="Disabled" /></div>
              <div style={{ marginTop: 12 }}><Text path="welcome.message" label="Message" area /></div>
            </div>
            <div className="card">
              <h2>Autoroles</h2>
              <div className="grid2">
                <MultiPick path="autorole.humans" label="Roles for new members" options={roles} />
                <MultiPick path="autorole.bots" label="Roles for new bots" options={roles} />
              </div>
            </div>
          </>
        )}

        {tab === 'leveling' && (
          <>
            <div className="card">
              <h2>Leveling</h2>
              <Toggle path="leveling.enabled" label="Enable XP & levels" />
              <Toggle path="leveling.stackRewards" label="Keep earlier reward roles" desc="Off = only the highest reward role is kept" />
              <div className="grid2" style={{ marginTop: 12 }}>
                <Num path="leveling.multiplier" label="XP multiplier" min={0.1} max={5} step={0.1} />
                <Select path="leveling.announce" label="Level-up message" options={[['current', 'Same channel'], ['channel', 'Specific channel'], ['dm', 'DM'], ['off', 'Off']]} />
                {v('leveling.announce') === 'channel' && <Pick path="leveling.channel" label="Announcement channel" options={channels} />}
              </div>
              <div style={{ marginTop: 12 }}><Text path="leveling.message" label="Message ({user} {username} {level} {server})" /></div>
              <div style={{ marginTop: 12 }}><MultiPick path="leveling.noXpChannels" label="No-XP channels" options={channels} /></div>
            </div>
            <div className="card">
              <h2>Role rewards</h2>
              {(v('leveling.rewards') || []).map((r, idx) => (
                <div className="row" key={idx} style={{ marginBottom: 8 }}>
                  <input className="input" type="number" min={1} style={{ width: 110 }} value={r.level} onChange={(e) => set('leveling.rewards')(v('leveling.rewards').map((x, n) => (n === idx ? { ...x, level: Number(e.target.value) } : x)))} />
                  <select className="input" value={r.roleId} onChange={(e) => set('leveling.rewards')(v('leveling.rewards').map((x, n) => (n === idx ? { ...x, roleId: e.target.value } : x)))}>
                    {roles.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button className="btn small ghost" onClick={() => set('leveling.rewards')(v('leveling.rewards').filter((_, n) => n !== idx))}>Remove</button>
                </div>
              ))}
              <button className="btn small" disabled={!roles.length} onClick={() => set('leveling.rewards')([...(v('leveling.rewards') || []), { level: 5, roleId: roles[0]?.id }])}>+ Add reward</button>
            </div>
          </>
        )}

        {tab === 'support' && (
          <>
            <div className="card">
              <h2>Tickets</h2>
              <p className="hint">Post the panel with <code>/ticket setup</code>.</p>
              <div className="grid2">
                <Pick path="tickets.supportRole" label="Support role" options={roles} />
                <Pick path="tickets.category" label="Ticket category" options={categories} />
                <Pick path="tickets.logChannel" label="Transcript channel" options={channels} />
              </div>
              <div style={{ marginTop: 12 }}><Text path="tickets.openMessage" label="Message shown in new tickets" area /></div>
            </div>
            <div className="card">
              <h2>Verification</h2>
              <p className="hint">Post the panel with <code>/verification setup</code>.</p>
              <Toggle path="verification.enabled" label="Enable verification" />
              <Toggle path="verification.captcha" label="Require captcha code" />
              <div className="grid2" style={{ marginTop: 12 }}><Pick path="verification.role" label="Verified role" options={roles} /></div>
            </div>
          </>
        )}

        {tab === 'engagement' && (
          <>
            <div className="card">
              <h2>Birthdays</h2>
              <div className="grid2">
                <Pick path="birthdays.channel" label="Announcement channel" options={channels} none="Disabled" />
                <Pick path="birthdays.role" label="Birthday role (for the day)" options={roles} />
              </div>
              <div style={{ marginTop: 12 }}><Text path="birthdays.message" label="Message ({user} {username} {server})" /></div>
            </div>
            <div className="card">
              <h2>Booster perks</h2>
              <Toggle path="booster.customRoles" label="Boosters can create a custom role (/booster role)" />
              <div className="grid2" style={{ marginTop: 12 }}><Pick path="booster.channel" label="Thank-you channel" options={channels} none="Disabled" /></div>
              <div style={{ marginTop: 12 }}><Text path="booster.message" label="Message ({user} {username} {server} {boosts})" /></div>
            </div>
            <div className="card">
              <h2>Vanity role</h2>
              <p className="hint">Gives a role to members who put this text in their custom status.</p>
              <div className="grid2">
                <Text path="vanity.text" label="Status text" placeholder="discord.gg/yourserver" />
                <Pick path="vanity.role" label="Role" options={roles} />
                <Pick path="vanity.channel" label="Thank-you channel" options={channels} none="None" />
              </div>
            </div>
            <div className="card">
              <h2>Counting & voice</h2>
              <div className="grid2">
                <Pick path="counting.channel" label="Counting channel" options={channels} none="Disabled" />
                <Text path="jtc.nameTemplate" label="Join-to-create channel name ({user})" />
              </div>
            </div>
          </>
        )}

        {tab === 'responders' && (
          <div className="card">
            <h2>Autoresponders</h2>
            <p className="hint">Reply automatically when a message matches. Variables: {'{user} {server}'}</p>
            {(v('autoresponders') || []).map((r, idx) => {
              const upd = (k, val) => set('autoresponders')(v('autoresponders').map((x, n) => (n === idx ? { ...x, [k]: val } : x)));
              return (
                <div key={idx} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <input className="input" placeholder="Trigger" value={r.trigger} onChange={(e) => upd('trigger', e.target.value)} />
                    <select className="input" style={{ width: 150 }} value={r.match || 'contains'} onChange={(e) => upd('match', e.target.value)}>
                      <option value="contains">Contains</option><option value="exact">Exact</option><option value="startswith">Starts with</option>
                    </select>
                    <button className="btn small ghost" onClick={() => set('autoresponders')(v('autoresponders').filter((_, n) => n !== idx))}>Remove</button>
                  </div>
                  <textarea className="input" placeholder="Response" value={r.response} onChange={(e) => upd('response', e.target.value)} />
                </div>
              );
            })}
            <button className="btn small" style={{ marginTop: 12 }} onClick={() => set('autoresponders')([...(v('autoresponders') || []), { trigger: '', response: '', match: 'contains' }])}>+ Add autoresponder</button>
          </div>
        )}
      </section>

      {(dirty || status) && (
        <div className="savebar">
          <span>{status || 'You have unsaved changes'}</span>
          {dirty && <button className="btn small ghost" onClick={() => setS(saved)}>Reset</button>}
          {dirty && <button className="btn small primary" onClick={save}>Save changes</button>}
        </div>
      )}
    </div>
    </Ctx.Provider>
  );
}

const { useState, useEffect, useLayoutEffect, useMemo, useRef, useContext, createContext } = React;

const STATUS = ['Not started', 'In progress', 'Blocked', 'Done'];
const LEVELS = ['High', 'Medium', 'Low', 'Not set'];
const VIEWS = [
  ['overview', 'Overview'], ['items', 'Work items'], ['board', 'Board'], ['timeline', 'Timeline'],
  ['decisions', 'Decisions'], ['risks', 'Risks'], ['kpis', 'KPIs'],
  ['team', 'Team'], ['activity', 'Activity'], ['setup', 'Project setup'],
];
const COLS = ['projects', 'phases', 'items', 'decisions', 'risks', 'kpis', 'docs', 'people', 'comments', 'activity'];
const EMPTY = Object.fromEntries(COLS.map(c => [c, []]));
const LOGO = '__LOGO__';
const ICONS = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 8h6V4h-6zM4 20h6v-3H4z',
  items: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  board: 'M5 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  timeline: 'M4 6h10M8 12h12M6 18h8',
  decisions: 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  risks: 'M12 3.5 2.5 20h19L12 3.5zM12 10v4M12 17.3h.01',
  kpis: 'M5 20v-9M11 20V5M17 20v-6M3 20h18',
  team: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  setup: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
};
const Ico = ({ n }) => <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[n]} /></svg>;
const TINTS = [['#ffe3da', '#a63a18'], ['#e4f3ea', '#0a6e4e'], ['#ffd3db', '#a8003a'], ['#e6e6ee', '#2e2e38']];
const Avatar = ({ name }) => {
  const t = TINTS[[...String(name)].reduce((x, c) => x + c.charCodeAt(0), 0) % TINTS.length];
  return <span className="av" style={{ background: t[0], color: t[1] }} aria-hidden="true">{String(name).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>;
};
const Ctx = createContext(null);
const useCtx = () => useContext(Ctx);

const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dn = s => Math.round(Date.parse(s + 'T00:00:00Z') / 864e5);
const ds = n => new Date(n * 864e5).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = s => s ? `${MON[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8))}` : '';
const range = (a, b) => !a && !b ? '' : a === b || !b ? fmt(a) : !a ? fmt(b) : `${fmt(a)} to ${fmt(b)}`;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
const codeParts = c => String(c || '').split('.').map(n => parseFloat(n) || 0);
const byCode = (a, b) => { const x = codeParts(a.code), y = codeParts(b.code); return (x[0] - y[0]) || ((x[1] || 0) - (y[1] || 0)); };
const byOrder = (a, b) => ((a.order ?? 999) - (b.order ?? 999)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : null;
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

function useHashView() {
  const read = () => { const h = location.hash.slice(1); return VIEWS.some(v => v[0] === h) ? h : 'overview'; };
  const [v, set] = useState(read);
  useEffect(() => { const f = () => set(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const go = x => { set(x); try { location.hash = x; } catch (e) { } window.scrollTo(0, 0); };
  return [v, go];
}

function useStore() {
  const [data, setData] = useState(EMPTY);
  const [stage, setStage] = useState('loading');
  const [me, setMe] = useState({ id: null });
  const [ro, setRo] = useState(false);
  const [profiles, setProfiles] = useState({});
  const [toast, setToast] = useState(null);
  const refs = useRef({ db: null, user: null, dl: null, q: {}, pruned: false });
  const toastT = useRef();
  const say = t => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(null), 4200); };

  useEffect(() => {
    let un = [], alive = true, timer;
    (async () => {
      if (!window.claude || !window.claude.use) { setStage('none'); return; }
      const [db, user, dl] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('downloads')]);
      if (!alive) return;
      Object.assign(refs.current, { db, user, dl });
      if (!db) { setStage('none'); return; }
      if (user) {
        user.me().then(m => alive && setMe(m));
        user.can('data.write').then(c => { if (alive && c === false) setRo(true); });
      }
      timer = setTimeout(() => setStage(s => s === 'loading' ? 'slow' : s), 10000);
      const confirmed = new Set();
      COLS.forEach(c => {
        let q = db.collection(c);
        if (c === 'activity') q = q.orderBy('at', 'desc').limit(300);
        un.push(q.onSnapshot(s => {
          setData(d => ({ ...d, [c]: s.docs.map(x => ({ id: x.id, ...x.data() })) }));
          if (!s.metadata.fromCache) confirmed.add(c);
          if (confirmed.size === COLS.length) { clearTimeout(timer); setStage('ready'); }
        }, e => { clearTimeout(timer); setStage(e && e.code === 'revoked' ? 'none' : 'error'); }));
      });
    })();
    return () => { alive = false; un.forEach(f => f()); clearTimeout(timer); };
  }, []);

  const ids = useMemo(() => [...new Set([...data.comments.map(c => c.by), ...data.activity.map(a => a.by)].filter(Boolean))].join('|'), [data.comments, data.activity]);
  useEffect(() => { const u = refs.current.user; if (u && ids) u.profiles(ids.split('|')).then(setProfiles); }, [ids]);

  const api = useMemo(() => {
    const enqueue = (path, fn) => { const q = refs.current.q; const p = (q[path] || Promise.resolve()).catch(() => { }).then(fn); q[path] = p; return p; };
    const fail = e => {
      if (e && e.code === 'invalid_argument') { setRo(true); say('You have view access, so this change was not saved. Ask Leslie for Contributor access.'); }
      else if (e && e.code === 'quota_exceeded') say('The project database is full. Delete old records to add more.');
      else say('That change did not save. Check your connection and try again.');
    };
    const stamp = () => ({ updatedAt: new Date().toISOString() });
    const prune = async () => {
      if (refs.current.pruned) return; refs.current.pruned = true;
      try {
        const s = await refs.current.db.collection('activity').orderBy('at', 'desc').limit(1000).get();
        if (s.size >= 1000) for (const d of s.docs.slice(-100)) await refs.current.db.doc('activity/' + d.id).delete();
      } catch (e) { }
    };
    return {
      add(col, d) {
        const db = refs.current.db; if (!db) return null;
        const ref = db.collection(col).doc();
        enqueue(ref.path, () => ref.set({ ...d, createdAt: new Date().toISOString() })).catch(fail);
        return ref.id;
      },
      patch(col, id, d) {
        const db = refs.current.db; if (!db) return;
        const ref = db.doc(`${col}/${id}`);
        enqueue(ref.path, () => ref.update({ ...d, ...stamp() })).catch(fail);
      },
      del(col, id) {
        const db = refs.current.db; if (!db) return Promise.resolve();
        const ref = db.doc(`${col}/${id}`);
        return enqueue(ref.path, () => ref.delete()).catch(fail);
      },
      log(projectId, itemId, text) {
        const db = refs.current.db; if (!db) return;
        db.collection('activity').add({ at: new Date().toISOString(), by: refs.current.meId || null, projectId: projectId || null, itemId: itemId || null, text }).catch(() => { });
        prune();
      },
      say,
    };
  }, []);
  refs.current.meId = me.id;
  const setName = name => { if (refs.current.user && refs.current.user.setName) refs.current.user.setName(name); setMe(m => ({ ...m, id: name || null, name })); };
  return { data, stage, me, ro, api, toast, profiles, setName, dl: () => refs.current.dl };
}

function buildModel(data, pid) {
  const today = todayStr();
  const projects = [...data.projects].sort(byOrder);
  const inScope = x => pid === 'all' || x.projectId === pid;
  const projectById = Object.fromEntries(projects.map(p => [p.id, p]));
  const allPhases = [...data.phases].sort(byOrder);
  const phaseById = Object.fromEntries(allPhases.map(p => [p.id, p]));
  const byId = Object.fromEntries(data.items.map(i => [i.id, i]));
  const allDecisions = [...data.decisions].sort(byOrder);
  const meta = {};
  data.items.forEach(i => {
    const deps = (i.deps || []).map(id => byId[id]).filter(Boolean);
    const open = i.status !== 'Done';
    meta[i.id] = {
      deps, open,
      conflicts: open ? deps.filter(d => d.status !== 'Done' && i.start && d.end && i.start < d.end) : [],
      waiting: open ? allDecisions.filter(d => d.status !== 'Decided' && (d.itemIds || []).includes(i.id)) : [],
      overdue: open && !!i.end && i.end < today,
      checkDone: (i.checklist || []).filter(c => c.done).length,
      checkAll: (i.checklist || []).length,
    };
  });
  const items = data.items.filter(inScope).sort((a, b) => {
    const pa = phaseById[a.phaseId], pb = phaseById[b.phaseId];
    return ((projectById[a.projectId]?.order ?? 0) - (projectById[b.projectId]?.order ?? 0)) || ((pa?.order ?? 99) - (pb?.order ?? 99)) || String(a.start || '9').localeCompare(String(b.start || '9')) || String(a.end || '9').localeCompare(String(b.end || '9')) || byCode(a, b);
  });
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = id => people.find(p => p.id === id)?.name || '';
  return {
    today, pid, projects, projectById, allPhases, phaseById, byId, meta, people, nameOf, items,
    allItems: data.items,
    project: pid === 'all' ? null : projectById[pid] || null,
    phases: allPhases.filter(inScope),
    decisions: allDecisions.filter(inScope),
    risks: [...data.risks].filter(inScope).sort(byOrder),
    kpis: [...data.kpis].filter(inScope).sort(byOrder),
    docs: [...data.docs].filter(inScope).sort(byOrder),
    activity: data.activity.filter(a => pid === 'all' || a.projectId === pid),
    comments: data.comments,
  };
}

function applyFilters(items, f, meta) {
  const q = f.q.trim().toLowerCase();
  return items.filter(i => {
    if (q && !`${i.code} ${i.title} ${i.area || ''} ${i.problem || ''} ${i.solution || ''}`.toLowerCase().includes(q)) return false;
    if (f.owner === '__none' && (i.owners || []).length) return false;
    if (f.owner && f.owner !== '__none' && !(i.owners || []).includes(f.owner)) return false;
    if (f.status === '__open' && i.status === 'Done') return false;
    if (f.status && f.status !== '__open' && i.status !== f.status) return false;
    if (f.priority && i.priority !== f.priority) return false;
    return true;
  });
}

function useActions() {
  const { api, model } = useCtx();
  return {
    setStatus(it, status) {
      if (status === it.status) return;
      api.patch('items', it.id, { status, completedAt: status === 'Done' ? model.today : null });
      api.log(it.projectId, it.id, `moved ${it.code} ${it.title} to ${status}`);
    },
    setField(it, k, v, label) {
      api.patch('items', it.id, { [k]: v });
      if (label) api.log(it.projectId, it.id, `set ${label} on ${it.code} ${it.title} to ${v || 'blank'}`);
    },
    setOwners(it, owners) {
      api.patch('items', it.id, { owners });
      api.log(it.projectId, it.id, `set owners on ${it.code} ${it.title}: ${owners.map(model.nameOf).join(', ') || 'none'}`);
    },
    setDates(it, start, end) {
      if (start && end && end < start) end = start;
      if (start === it.start && end === it.end) return;
      api.patch('items', it.id, { start, end });
      api.log(it.projectId, it.id, `rescheduled ${it.code} ${it.title} to ${range(start, end) || 'no dates'}`);
    },
    addItems(phase, titles) {
      const idx = model.allPhases.filter(p => p.projectId === phase.projectId).findIndex(p => p.id === phase.id) + 1;
      let seq = Math.max(0, ...model.allItems.filter(i => i.phaseId === phase.id).map(i => codeParts(i.code)[1] || 0));
      titles.forEach(t => {
        seq += 1;
        const code = `${idx}.${seq}`;
        api.add('items', { projectId: phase.projectId, phaseId: phase.id, code, title: t, status: 'Not started', priority: 'Not set', effort: 'Not set', owners: [], deps: [], checklist: [], start: '', end: '' });
        api.log(phase.projectId, null, `added ${code} ${t}`);
      });
    },
    moveToPhase(it, phaseId) {
      const phase = model.phaseById[phaseId]; if (!phase) return;
      const idx = model.allPhases.filter(p => p.projectId === phase.projectId).findIndex(p => p.id === phaseId) + 1;
      const seq = Math.max(0, ...model.allItems.filter(i => i.phaseId === phaseId).map(i => codeParts(i.code)[1] || 0)) + 1;
      api.patch('items', it.id, { phaseId, code: `${idx}.${seq}` });
      api.log(it.projectId, it.id, `moved ${it.title} to ${phase.name}`);
    },
    async deleteItem(it) {
      await api.del('items', it.id);
      model.allItems.filter(o => (o.deps || []).includes(it.id)).forEach(o => api.patch('items', o.id, { deps: o.deps.filter(d => d !== it.id) }));
      model.decisions.concat(model.risks, model.kpis, model.docs).filter(r => (r.itemIds || []).includes(it.id)).forEach(r => {
        const col = model.decisions.includes(r) ? 'decisions' : model.risks.includes(r) ? 'risks' : model.kpis.includes(r) ? 'kpis' : 'docs';
        api.patch(col, r.id, { itemIds: r.itemIds.filter(d => d !== it.id) });
      });
      api.log(it.projectId, null, `deleted ${it.code} ${it.title}`);
    },
  };
}

function AutoTA(p) {
  const r = useRef();
  const fit = () => { const e = r.current; if (e) { e.style.height = 'auto'; e.style.height = e.scrollHeight + 3 + 'px'; } };
  useLayoutEffect(fit, [p.value]);
  useEffect(() => {
    addEventListener('resize', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    return () => removeEventListener('resize', fit);
  }, []);
  return <textarea ref={r} rows={1} {...p} />;
}

function EditText({ value, onSave, multi, placeholder, className = 'in', id, label }) {
  const { ro } = useCtx();
  const [v, setV] = useState(value || '');
  const foc = useRef(false);
  useEffect(() => { if (!foc.current) setV(value || ''); }, [value]);
  const commit = () => { foc.current = false; const t = v.trim(); if (t !== (value || '').trim()) onSave(t); };
  const P = { id, value: v, disabled: ro, placeholder, className, 'aria-label': label, onFocus: () => { foc.current = true; }, onBlur: commit, onChange: e => setV(e.target.value) };
  if (multi) return <AutoTA {...P} />;
  return <input {...P} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />;
}

function Sel({ value, options, onChange, id, label, cls = 'sel', pills = true }) {
  const { ro } = useCtx();
  return (
    <select id={id} aria-label={label} className={cls} data-v={pills ? value : undefined} value={value || ''} disabled={ro} onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()}>
      {options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MultiPick({ value = [], options, onChange, compact, addLabel = 'Add', id }) {
  const { ro } = useCtx();
  const rest = options.filter(o => !value.includes(o.id));
  const shown = value.map(v => options.find(o => o.id === v)).filter(Boolean);
  return (
    <div className="chips">
      {shown.map(o => (
        <span className={`chip${o.person ? ' person' : ''}`} key={o.id}>{o.person && <Avatar name={o.label} />}{compact ? o.short || o.label : o.label}
          {!ro && <button type="button" aria-label={`Remove ${o.label}`} onClick={() => onChange(value.filter(v => v !== o.id))}>×</button>}
        </span>
      ))}
      {!ro && rest.length > 0 && (
        <select id={id} className="add-sel" style={{ width: shown.length ? 28 : Math.max(76, addLabel.length * 7.5 + 22) }} aria-label={addLabel} value="" onChange={e => e.target.value && onChange([...value, e.target.value])}>
          <option value="">{shown.length ? '+' : addLabel}</option>
          {rest.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

function OwnerPick({ value, onChange, compact, id }) {
  const { model } = useCtx();
  return <MultiPick id={id} compact={compact} value={value} onChange={onChange} addLabel="Assign" options={model.people.map(p => ({ id: p.id, label: p.name, short: p.name.split(' ')[0], person: true }))} />;
}

function Confirm({ label, onYes, ask = 'Delete this for everyone?' }) {
  const { ro } = useCtx();
  const [on, set] = useState(false);
  if (ro) return null;
  if (!on) return <button type="button" className="btn danger" onClick={() => set(true)}>{label}</button>;
  return <span className="confirm"><span>{ask}</span><button type="button" className="btn danger" onClick={onYes}>Yes, delete</button><button type="button" className="btn" onClick={() => set(false)}>Keep</button></span>;
}

function Flags({ it }) {
  const { model } = useCtx();
  const m = model.meta[it.id];
  return (
    <>
      {m.overdue && <span className="flag crit">Overdue</span>}
      {m.conflicts.map(c => <span key={c.id} className="flag crit">Starts before {c.code} ends</span>)}
      {m.waiting.length > 0 && <span className="flag warn">Waiting on decision</span>}
      {m.checkAll > 0 && <span className="flag mute num">{m.checkDone}/{m.checkAll}</span>}
    </>
  );
}

function ViewHead({ title, children }) {
  const { model } = useCtx();
  return (
    <header className="vh">
      <div><p className="eyebrow">{model.project ? model.project.name : 'All projects'}</p><h1>{title}</h1></div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}

function PhaseAdd() {
  const { api, model, ro } = useCtx();
  const [v, setV] = useState('');
  if (ro || !model.project) return null;
  const add = e => {
    e.preventDefault(); const t = v.trim(); if (!t) return;
    api.add('phases', { projectId: model.project.id, name: t, goal: '', order: model.phases.length + 1 });
    api.log(model.project.id, null, `added phase ${t}`);
    setV('');
  };
  return <form className="addbar" onSubmit={add}><input id="phase-add" className="in" placeholder="Name a phase, like Discovery or Handover" aria-label="New phase name" value={v} onChange={e => setV(e.target.value)} /><button className="btn primary">Add phase</button></form>;
}

function NoPhases() {
  const { model } = useCtx();
  return (
    <div className="empty">
      <h2>{model.project ? `Let’s set up ${model.project.name}` : 'No phases yet'}</h2>
      <p>Add the first phase, then add work items under it.</p>
      <div style={{ width: 'min(460px,100%)' }}><PhaseAdd /></div>
    </div>
  );
}

/* ---------- Overview ---------- */
function attention(model, items) {
  const out = [];
  const open = items.filter(i => i.status !== 'Done');
  open.filter(i => model.meta[i.id].overdue).forEach(i => out.push({ tag: 'Overdue', tone: 'crit', it: i, text: `was due ${fmt(i.end)}` }));
  open.filter(i => i.status === 'Blocked').forEach(i => out.push({ tag: 'Blocked', tone: 'crit', it: i, text: i.blockedReason || 'needs someone to clear it' }));
  open.forEach(i => model.meta[i.id].conflicts.forEach(c => out.push({ tag: 'Order', tone: 'crit', it: i, text: `starts ${fmt(i.start)}, before ${c.code} ends ${fmt(c.end)}` })));
  return out;
}

function weeklyText(model, items) {
  const t = model.today, cut = ds(dn(t) - 7), soon = ds(dn(t) + 7);
  const line = i => `- ${i.code} ${i.title}${(i.owners || []).length ? ` (${i.owners.map(model.nameOf).join(', ')})` : ''}${i.end ? `, due ${fmt(i.end)}` : ''}`;
  const sect = (h, list) => list.length ? `\n${h}\n${list.join('\n')}\n` : '';
  const done = items.filter(i => i.status === 'Done');
  const open = model.decisions.filter(d => d.status !== 'Decided');
  return `${model.project ? model.project.name : 'All projects'} update for the week of ${fmt(t)}\n${done.length} of ${items.length} items done, ${items.filter(i => i.status === 'In progress').length} in progress, ${open.length} open decisions\n` +
    sect('Done in the last 7 days', done.filter(i => i.completedAt && i.completedAt >= cut).map(line)) +
    sect('In progress', items.filter(i => i.status === 'In progress').map(line)) +
    sect('Blocked', items.filter(i => i.status === 'Blocked').map(line)) +
    sect('Overdue', items.filter(i => model.meta[i.id].overdue).map(line)) +
    sect('Starting in the next 7 days', items.filter(i => i.status === 'Not started' && i.start && i.start <= soon).map(line)) +
    sect('Open decisions', open.map(d => `- ${d.text}`));
}

function exportCsv(model, items, dl, api) {
  const head = ['Code', 'Project', 'Phase', 'Title', 'Area', 'Problem', 'Solution', 'Done when', 'Priority', 'Effort', 'Start', 'End', 'Owners', 'Depends on', 'Status'];
  const rows = items.map(i => [i.code, model.projectById[i.projectId]?.name, model.phaseById[i.phaseId]?.name, i.title, i.area, i.problem, i.solution, i.outcome, i.priority, i.effort, i.start, i.end, (i.owners || []).map(model.nameOf).join('; '), model.meta[i.id].deps.map(d => d.code).join('; '), i.status]);
  const csv = [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const d = dl();
  if (!d) { api.say('File downloads are not available in this view.'); return; }
  d.save({ filename: `${(model.project?.name || 'All projects').replace(/[^\w ]+/g, '')} work items.csv`, data: csv }).then(() => api.say('Export saved.')).catch(e => { if (e && e.code !== 'declined') api.say('The export did not save. Try again.'); });
}

function PhaseStrip({ phases, items }) {
  const { model } = useCtx();
  return (
    <section className="phases" aria-label="Phases">
      {phases.map((p, n) => {
        const list = items.filter(i => i.phaseId === p.id);
        const done = list.filter(i => i.status === 'Done').length;
        const dates = list.filter(i => i.start && i.end);
        const a = dates.length ? dates.map(i => i.start).sort()[0] : '';
        const b = dates.length ? dates.map(i => i.end).sort().at(-1) : '';
        const left = b ? dn(b) - dn(model.today) : null;
        return (
          <article className="phase" key={p.id}>
            <div className="top">{model.pid === 'all' ? <span className="eyebrow" style={{ margin: 0 }}>{model.projectById[p.projectId]?.name}</span> : <span className="pnum"><b>{n + 1}</b>Phase {n + 1}</span>}<span className="date">{range(a, b)}</span></div>
            <h2>{p.name}</h2>
            {p.goal && <p className="small quiet">{p.goal}</p>}
            <span className="bar"><i style={{ width: `${list.length ? done / list.length * 100 : 0}%` }} /></span>
            <p className="small"><span className="num">{done}/{list.length}</span> done{left !== null && done < list.length && <span className="quiet"> · {left >= 0 ? `${left} days left` : `${-left} days past end`}</span>}</p>
          </article>
        );
      })}
    </section>
  );
}

function Ring({ pct }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 110 110" role="img" aria-label={`${pct}% of work items done`}>
      <defs><linearGradient id="rg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#ff6439" /><stop offset="1" stopColor="#ff004b" /></linearGradient></defs>
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="9" />
      {pct > 0 && <circle cx="55" cy="55" r={r} fill="none" stroke="url(#rg)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${c * pct / 100} ${c}`} transform="rotate(-90 55 55)" />}
      <text x="55" y="58" textAnchor="middle" fill="#fff" fontSize="25" fontWeight="800" fontFamily="Rubik, Arial, sans-serif">{pct}%</text>
      <text x="55" y="74" textAnchor="middle" fill="#c5c5d0" fontSize="11" fontFamily="Rubik, Arial, sans-serif">done</text>
    </svg>
  );
}

function Overview({ setModal, setFilters, go }) {
  const { model, api, open, dl } = useCtx();
  const items = model.items, today = model.today;
  const done = items.filter(i => i.status === 'Done').length;
  const prog = items.filter(i => i.status === 'In progress').length;
  const blocked = items.filter(i => i.status === 'Blocked').length;
  const overdue = items.filter(i => model.meta[i.id].overdue).length;
  const decisions = model.decisions.filter(d => d.status !== 'Decided');
  const unowned = items.filter(i => i.status !== 'Done' && !(i.owners || []).length);
  const att = attention(model, items);
  const waiting = items.filter(i => model.meta[i.id].waiting.length).length;
  const week = ds(dn(today) + 7);
  const next = items.filter(i => i.status !== 'Done' && (i.status === 'In progress' || (i.start && i.start <= week))).sort((a, b) => String(a.end).localeCompare(String(b.end)));
  const hasWork = model.phases.length > 0;
  return (
    <>
      <section className="hero">
        <div className="hero-deco" aria-hidden="true"><i /><i /><i /></div>
        <div className="hero-text">
          <p className="eyebrow">{model.project ? 'Project overview' : 'Portfolio overview'}</p>
          <h1>{model.project ? model.project.name : 'All projects'}</h1>
          {model.project && <EditText className="bare" multi label="Project summary" placeholder="Describe what this project will deliver and by when" value={model.project.summary} onSave={v => api.patch('projects', model.project.id, { summary: v })} />}
        </div>
        {items.length > 0 && <Ring pct={Math.round(done / items.length * 100)} />}
        {items.length > 0 && (
          <div className="hero-foot">
            <div className="stats">
              <div><b>{done}/{items.length}</b><span>done</span></div>
              <div><b>{prog}</b><span>in progress</span></div>
              <div className={blocked ? 'bad' : ''}><b>{blocked}</b><span>blocked</span></div>
              <div className={overdue ? 'bad' : ''}><b>{overdue}</b><span>overdue</span></div>
              <div><b>{decisions.length}</b><span>open decisions</span></div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setModal({ type: 'weekly', text: weeklyText(model, items) })}>Write weekly update</button>
              <button className="btn" onClick={() => exportCsv(model, items, dl, api)}>Export CSV</button>
            </div>
          </div>
        )}
      </section>
      {!hasWork && model.project ? <NoPhases /> : <>
        {!model.project && (
          <section className="panel">
            <h2>Projects</h2>
            <ul className="alist">
              {model.projects.map(p => {
                const l = items.filter(i => i.projectId === p.id), d = l.filter(i => i.status === 'Done').length;
                return <li key={p.id}><span className="num tag">{d}/{l.length}</span><div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{p.name}</span><span className="bar" style={{ marginTop: 5 }}><i style={{ width: `${l.length ? d / l.length * 100 : 0}%` }} /></span></div></li>;
              })}
            </ul>
          </section>
        )}
        <PhaseStrip phases={model.phases} items={items} />
        <div className="two">
          <section className="panel">
            <h2>Needs attention</h2>
            <ul className="alist">
              {unowned.length > 0 && <li><span className="flag warn tag">Owner</span><div><button className="link" onClick={() => { setFilters(f => ({ ...f, owner: '__none', status: '__open' })); go('items'); }}>{unowned.length} open item{unowned.length > 1 ? 's have' : ' has'} no owner</button></div></li>}
              {waiting > 0 && <li><span className="flag warn tag">Decision</span><div><button className="link" onClick={() => go('decisions')}>{waiting} work item{waiting > 1 ? 's are' : ' is'} waiting on an open decision</button></div></li>}
              {att.map((a, n) => <li key={n}><span className={`flag ${a.tone} tag`}>{a.tag}</span><div><button className="link" onClick={() => open(a.it.id)}>{a.it.code} {a.it.title}</button> <span className="quiet small">{a.text}</span></div></li>)}
              {!unowned.length && !att.length && !waiting && <li className="quiet">Nothing is overdue, blocked or out of order.</li>}
            </ul>
          </section>
          <section className="panel">
            <h2>This week</h2>
            <ul className="alist">
              {next.map(i => <li key={i.id}><span className="date tag">{fmt(i.end) || 'No date'}</span><div><button className="link" onClick={() => open(i.id)}>{i.code} {i.title}</button> <span className="quiet small">{i.status}{(i.owners || []).length ? ` · ${i.owners.map(model.nameOf).join(', ')}` : ''}</span></div></li>)}
              {!next.length && <li className="quiet">Nothing starts or is in progress in the next 7 days.</li>}
            </ul>
          </section>
        </div>
      </>}
    </>
  );
}

/* ---------- Work items ---------- */
function FilterBar({ filters, setFilters }) {
  const { model } = useCtx();
  const f = filters, up = (k, v) => setFilters(o => ({ ...o, [k]: v }));
  const on = f.q || f.owner || f.status || f.priority;
  return (
    <div className="filters">
      <input id="f-q" className="in" placeholder="Search work items" aria-label="Search work items" value={f.q} onChange={e => up('q', e.target.value)} />
      <select id="f-owner" className="in" aria-label="Owner" value={f.owner} onChange={e => up('owner', e.target.value)}><option value="">All owners</option><option value="__none">No owner</option>{model.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select id="f-status" className="in" aria-label="Status" value={f.status} onChange={e => up('status', e.target.value)}><option value="">All statuses</option><option value="__open">Everything open</option>{STATUS.map(s => <option key={s}>{s}</option>)}</select>
      <select id="f-pri" className="in" aria-label="Priority" value={f.priority} onChange={e => up('priority', e.target.value)}><option value="">All priorities</option>{LEVELS.map(s => <option key={s}>{s}</option>)}</select>
      {on && <button className="btn" onClick={() => setFilters({ q: '', owner: '', status: '', priority: '' })}>Clear filters</button>}
    </div>
  );
}

function QuickAdd({ phase }) {
  const { ro } = useCtx();
  const act = useActions();
  const [v, setV] = useState('');
  if (ro) return null;
  const clean = t => t.split(/\r?\n/).map(l => l.split('\t').find(c => c.trim()) || '').map(l => l.trim()).filter(Boolean);
  return (
    <div className="qadd">
      <input id={`qa-${phase.id}`} className="in" aria-label={`Add work item to ${phase.name}`} placeholder="Add a work item and press Enter, or paste several rows" value={v}
        onChange={e => setV(e.target.value)}
        onPaste={e => { const t = e.clipboardData.getData('text'); if (/\n/.test(t.trim())) { e.preventDefault(); act.addItems(phase, clean(t)); } }}
        onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { act.addItems(phase, [v.trim()]); setV(''); } }} />
    </div>
  );
}

function ItemRow({ it }) {
  const { model, open } = useCtx();
  const act = useActions();
  const m = model.meta[it.id];
  return (
    <div className="row" data-blocked={it.status === 'Blocked' ? '1' : '0'}>
      <span className="code">{it.code}</span>
      <div className="r-title"><button className="link" onClick={() => open(it.id)}>{it.title}</button>{m.checkAll > 0 && <span className="small quiet num">{m.checkDone} of {m.checkAll} steps</span>}</div>
      <div className="r-own"><OwnerPick compact value={it.owners} onChange={o => act.setOwners(it, o)} /></div>
      <div className="r-meta">
        <Sel value={it.status} options={STATUS} label={`Status of ${it.code}`} onChange={v => act.setStatus(it, v)} />
        <Sel value={it.priority || 'Not set'} options={LEVELS} label={`Priority of ${it.code}`} onChange={v => act.setField(it, 'priority', v, 'priority')} />
        <Sel cls="sel q" value={it.effort || 'Not set'} options={LEVELS} label={`Effort of ${it.code}`} onChange={v => act.setField(it, 'effort', v, 'effort')} />
        <span className={`date${m.overdue ? ' bad' : ''}`}>{range(it.start, it.end) || 'No dates'}</span>
      </div>
    </div>
  );
}

const PRI = { High: 0, Medium: 1, Low: 2, 'Not set': 3 };
function Items({ filters, setFilters }) {
  const { model, api, dl } = useCtx();
  const [sort, setSort] = useState('start');
  const list = applyFilters(model.items, filters, model.meta);
  const sorted = [...list].sort(sort === 'due' ? (a, b) => String(a.end || '9').localeCompare(String(b.end || '9')) : sort === 'num' ? byCode : sort === 'priority' ? (a, b) => PRI[a.priority || 'Not set'] - PRI[b.priority || 'Not set'] : () => 0);
  return (
    <>
      <ViewHead title="Work items"><button className="btn" onClick={() => exportCsv(model, list, dl, api)}>Export CSV</button></ViewHead>
      {!model.phases.length ? <NoPhases /> : <>
        <div className="filters">
          <FilterBar filters={filters} setFilters={setFilters} />
          <select id="sort" className="in" aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}><option value="start">Sort by start date</option><option value="due">Sort by due date</option><option value="priority">Sort by priority</option><option value="num">Sort by number</option></select>
        </div>
        {model.phases.map((p, n) => {
          const rows = sorted.filter(i => i.phaseId === p.id);
          const done = rows.filter(i => i.status === 'Done').length;
          return (
            <section className="group" key={p.id}>
              <div className="ghead"><h2>{model.pid === 'all' ? `${model.projectById[p.projectId]?.name}: ` : `Phase ${n + 1}: `}{p.name}</h2><span className="small quiet num">{done}/{rows.length} done</span></div>
              <div className="rows">
                <div className="rowh"><span>No.</span><span>Work item</span><span>Owner</span><span>Status</span><span>Priority</span><span>Effort</span><span>Dates</span></div>
                {rows.map(i => <ItemRow key={i.id} it={i} />)}
              </div>
              {!rows.length && <p className="quiet small" style={{ padding: '10px 14px' }}>No work items match here.</p>}
              <QuickAdd phase={p} />
            </section>
          );
        })}
        {model.project && <div className="panel"><h3>Add another phase</h3><PhaseAdd /></div>}
      </>}
    </>
  );
}

/* ---------- Board ---------- */
function Board({ filters, setFilters }) {
  const { model, open, ro } = useCtx();
  const act = useActions();
  const [over, setOver] = useState(null);
  const drag = useRef(null);
  const list = applyFilters(model.items, filters, model.meta);
  return (
    <>
      <ViewHead title="Board" />
      <FilterBar filters={filters} setFilters={setFilters} />
      {!model.phases.length ? <NoPhases /> : (
        <div className="board">
          {STATUS.map(s => {
            const cards = list.filter(i => i.status === s);
            return (
              <section key={s} className="col" data-over={over === s ? '1' : '0'}
                onDragOver={e => { e.preventDefault(); setOver(s); }} onDragLeave={() => setOver(o => o === s ? null : o)}
                onDrop={e => { e.preventDefault(); setOver(null); const it = model.byId[drag.current]; if (it) act.setStatus(it, s); }}>
                <header><span>{s}</span><span className="num">{cards.length}</span></header>
                {cards.map(i => (
                  <article key={i.id} className="card" data-blocked={i.status === 'Blocked' ? '1' : '0'} draggable={!ro} onDragStart={() => { drag.current = i.id; }}>
                    <span className="code">{i.code}</span>
                    <button className="link" onClick={() => open(i.id)}>{i.title}</button>
                    <div className="chips"><Flags it={i} /></div>
                    <OwnerPick compact value={i.owners} onChange={o => act.setOwners(i, o)} />
                    <div className="m"><span className="date">{fmt(i.end) || 'No date'}</span><Sel value={i.status} options={STATUS} label={`Status of ${i.code}`} onChange={v => act.setStatus(i, v)} /></div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- Timeline ---------- */
function Timeline({ filters, setFilters }) {
  const { model, open, ro } = useCtx();
  const act = useActions();
  const [zoom, setZoom] = useState(() => lsGet('zoom') || 'Week');
  const [lines, setLines] = useState(false);
  const [hot, setHot] = useState(null);
  const [drag, setDrag] = useState(null);
  const start = useRef(0);
  const px = { Day: 36, Week: 18, Month: 7 }[zoom] || 18;
  const list = applyFilters(model.items, filters, model.meta);
  const dated = list.filter(i => i.start && i.end);
  const today = dn(model.today);
  let lo = today, hi = today + 21;
  dated.forEach(i => { lo = Math.min(lo, dn(i.start)); hi = Math.max(hi, dn(i.end)); });
  lo -= 3; lo -= (lo + 3) % 7; hi += 14;
  const W = (hi - lo + 1) * px, X = n => (n - lo) * px;
  const weeks = []; for (let n = lo; n <= hi; n += 7) weeks.push(n);
  const months = []; for (let n = lo; n <= hi; n++) if (ds(n).endsWith('-01') || n === lo) months.push(n);
  const groups = model.phases.map(p => ({ p, rows: list.filter(i => i.phaseId === p.id) })).filter(g => g.rows.length);
  const rowY = {}; let y = 48;
  groups.forEach(g => { y += 36; g.rows.forEach(i => { rowY[i.id] = y + 20; y += 40; }); });
  const H = y;
  const span = it => {
    let s = dn(it.start), e = dn(it.end);
    if (drag && drag.id === it.id) {
      const d = drag.days;
      if (drag.mode === 'move') { s += d; e += d; } else if (drag.mode === 'l') s = Math.min(s + d, e); else e = Math.max(e + d, s);
    }
    return { s, e };
  };
  const paths = dated.flatMap(i => model.meta[i.id].deps.filter(d => d.start && d.end && rowY[d.id] !== undefined && (lines || hot === i.id || hot === d.id || model.meta[i.id].conflicts.includes(d))).map(d => {
    const a = span(d), b = span(i), x1 = X(a.e) + px, x2 = X(b.s), y1 = rowY[d.id], y2 = rowY[i.id], bad = model.meta[i.id].conflicts.includes(d);
    const mid = y2 > y1 ? y2 - 15 : y2 + 15;
    const path = x2 >= x1 + 14 ? `M${x1} ${y1}H${x1 + 7}V${y2}H${x2}` : `M${x1} ${y1}H${x1 + 7}V${mid}H${x2 - 7}V${y2}H${x2}`;
    return { key: d.id + i.id, path, bad };
  }));
  const down = (e, it) => {
    if (ro) { open(it.id); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = e.clientX;
    setDrag({ id: it.id, mode: e.target.dataset.h || 'move', days: 0, moved: false });
  };
  const move = e => { if (!drag) return; const dx = e.clientX - start.current; setDrag(d => d && ({ ...d, days: Math.round(dx / px), moved: d.moved || Math.abs(dx) > 3 })); };
  const up = it => {
    if (!drag) return;
    const d = drag; const { s, e } = span(it); setDrag(null);
    if (!d.moved) open(it.id); else if (d.days) act.setDates(it, ds(s), ds(e));
  };
  const key = (e, it) => {
    if (e.key === 'Enter') open(it.id);
    if (!ro && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const n = e.key === 'ArrowLeft' ? -1 : 1; act.setDates(it, ds(dn(it.start) + n), ds(dn(it.end) + n)); }
  };
  const bg = { position: 'absolute', inset: 0, background: `repeating-linear-gradient(90deg,var(--grid) 0 1px,transparent 1px ${px * 7}px),repeating-linear-gradient(90deg,transparent 0 ${px * 5}px,var(--weekend) ${px * 5}px ${px * 7}px)` };
  return (
    <>
      <ViewHead title="Timeline" />
      <FilterBar filters={filters} setFilters={setFilters} />
      {!model.phases.length ? <NoPhases /> : <>
        <div className="g-tools">
          <div className="seg" role="group" aria-label="Zoom">{['Day', 'Week', 'Month'].map(z => <button key={z} aria-pressed={zoom === z} onClick={() => { setZoom(z); lsSet('zoom', z); }}>{z}</button>)}</div>
          <label className="small"><input id="deps" type="checkbox" checked={lines} onChange={e => setLines(e.target.checked)} /> Show all dependencies</label>
          {!ro && <span className="small quiet">Drag a bar to move it, or its ends to change the length. Hover to see what it depends on.</span>}
        </div>
        <div className="g-scroll">
          <div className="gantt" style={{ width: `calc(var(--lab) + ${W}px)`, height: H }}>
            <div className="g-bg" style={{ width: W }}>
              <div style={bg} />
              {today >= lo && today <= hi && <div className="g-today" style={{ left: X(today) + px / 2 }}><b>Today</b></div>}
            </div>
            <svg className="g-svg" width={W} height={H} aria-hidden="true">
              <defs>
                <marker id="ga" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted)" /></marker>
                <marker id="gc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--crit)" /></marker>
              </defs>
              {paths.map(p => <path key={p.key} d={p.path} fill="none" stroke={p.bad ? 'var(--crit)' : 'var(--muted)'} strokeWidth="1.2" opacity=".6" markerEnd={`url(#${p.bad ? 'gc' : 'ga'})`} />)}
            </svg>
            <div className="g-row scale">
              <div className="g-lab quiet small">Work item</div>
              <div className="g-track" style={{ width: W }}>
                {months.map(n => <span key={n} className="g-tick" style={{ left: X(n) + 4, top: 6, fontWeight: 600 }}>{MON[Number(ds(n).slice(5, 7)) - 1]}</span>)}
                {weeks.map(n => <span key={n} className="g-tick" style={{ left: X(n) + 4, top: 26 }}>{zoom === 'Month' ? Number(ds(n).slice(8)) : fmt(ds(n))}</span>)}
              </div>
            </div>
            {groups.map(g => {
              const ds2 = g.rows.filter(i => i.start && i.end);
              const a = ds2.length ? Math.min(...ds2.map(i => dn(i.start))) : null, b = ds2.length ? Math.max(...ds2.map(i => dn(i.end))) : null;
              return (
                <React.Fragment key={g.p.id}>
                  <div className="g-row head"><div className="g-lab"><span className="ttl">{g.p.name}</span></div><div className="g-track" style={{ width: W }}>{a !== null && <span className="g-span" style={{ left: X(a), width: X(b + 1) - X(a) }} />}</div></div>
                  {g.rows.map(i => {
                    const has = i.start && i.end;
                    const sp = has ? span(i) : null;
                    return (
                      <div className="g-row" key={i.id}>
                        <div className="g-lab"><span className="code">{i.code}</span><button className="link" title={i.title} onClick={() => open(i.id)}>{i.title}</button></div>
                        <div className="g-track" style={{ width: W }}>
                          {has ? <>
                            <div className="g-bar" tabIndex={0} role="button" aria-label={`${i.code} ${i.title}, ${range(ds(sp.s), ds(sp.e))}`} data-s={i.status} data-c={model.meta[i.id].conflicts.length ? '1' : '0'}
                              style={{ left: X(sp.s), width: Math.max(px, X(sp.e + 1) - X(sp.s)) }}
                              onPointerEnter={() => setHot(i.id)} onPointerLeave={() => setHot(h => h === i.id ? null : h)} onPointerDown={e => down(e, i)} onPointerMove={move} onPointerUp={() => up(i)} onPointerCancel={() => setDrag(null)} onKeyDown={e => key(e, i)}>
                              <i data-h="l" /><i data-h="r" />
                            </div>
                            <span className="g-date" style={{ left: X(sp.e + 1) + 6 }}>{range(ds(sp.s), ds(sp.e))}</span>
                          </> : <span className="g-date" style={{ left: X(today) + 8 }}><button className="link small" onClick={() => open(i.id)}>Set dates</button></span>}
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </>}
    </>
  );
}

/* ---------- Generic records (decisions, risks, KPIs, documents) ---------- */
function FieldEdit({ f, row, col }) {
  const { api, model } = useCtx();
  const save = v => { const extra = f.onSet ? f.onSet(v, row, model) : {}; api.patch(col, row.id, { [f.k]: v, ...extra }); if (f.log) api.log(row.projectId, null, f.log(v, row)); };
  const id = `${col}-${row.id}-${f.k}`;
  const v = row[f.k];
  let ctl;
  if (f.t === 'text' || f.t === 'url') ctl = <EditText id={id} value={v} onSave={save} placeholder={f.ph} />;
  else if (f.t === 'area') ctl = <EditText id={id} multi value={v} onSave={save} placeholder={f.ph} />;
  else if (f.t === 'date') ctl = <EditDate id={id} value={v} onSave={save} />;
  else if (f.t === 'sel') ctl = <Sel id={id} cls="in" pills={false} value={v || f.opts[0]} options={f.opts} onChange={save} />;
  else if (f.t === 'person') ctl = <Sel id={id} cls="in" pills={false} value={v || ''} options={[['', 'No owner'], ...model.people.map(p => [p.id, p.name])]} onChange={save} />;
  else if (f.t === 'phase') ctl = <Sel id={id} cls="in" pills={false} value={v || ''} options={[['', 'No phase'], ...model.allPhases.filter(p => p.projectId === row.projectId).map(p => [p.id, p.name])]} onChange={save} />;
  else if (f.t === 'items') ctl = <MultiPick id={id} addLabel="Link work item" value={v || []} onChange={save} options={model.allItems.filter(i => i.projectId === row.projectId).sort(byCode).map(i => ({ id: i.id, label: `${i.code} ${i.title}` }))} />;
  return <div className={`f${f.wide ? ' wide' : ''}`}><label htmlFor={id}>{f.l}</label>{ctl}</div>;
}

function EditDate({ value, onSave, id, label }) {
  const { ro } = useCtx();
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return <input id={id} aria-label={label} type="date" className="in" disabled={ro} value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== (value || '')) onSave(v); }} />;
}

function RecRow({ row, col, schema, titleKey, chips, closed, startOpen, delAsk }) {
  const { api, model } = useCtx();
  const [open, setOpen] = useState(!!startOpen);
  return (
    <article className="rec" data-closed={closed && closed(row) ? '1' : '0'}>
      <div className="rec-h">
        <div className="t"><EditText className="bare" multi label="Title" value={row[titleKey]} onSave={v => api.patch(col, row.id, { [titleKey]: v })} /></div>
        <div className="chips">{chips(row, model).filter(Boolean).map((c, n) => <span key={n} className={`flag ${c[1] || 'mute'}`}>{c[0]}</span>)}</div>
        <button className="tog" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Details'}</button>
      </div>
      {open && <div className="rec-b">
        {schema.map(f => <FieldEdit key={f.k} f={f} row={row} col={col} />)}
        <div className="wide"><Confirm label="Delete" ask={delAsk} onYes={() => api.del(col, row.id)} /></div>
      </div>}
    </article>
  );
}

function Records({ title, col, rows, schema, titleKey, chips, closed, addPh, defaults, emptyText, before, sort, groups, groupKey }) {
  const { model, api, ro } = useCtx();
  const [v, setV] = useState('');
  const [fresh, setFresh] = useState(null);
  const [grp, setGrp] = useState(groups ? groups[0] : '');
  const canAdd = model.project && !ro;
  const add = e => {
    e.preventDefault(); const t = v.trim(); if (!t) return;
    const id = api.add(col, { projectId: model.project.id, [titleKey]: t, itemIds: [], order: rows.length + 1, ...defaults, ...(groups ? { [groupKey]: grp } : {}) });
    api.log(model.project.id, null, `added to ${title.toLowerCase()}: ${t}`);
    setFresh(id); setV('');
  };
  const list = sort ? [...rows].sort(sort) : rows;
  const renderList = rs => <div className="list">{rs.map(r => <RecRow key={r.id} row={r} col={col} schema={schema} titleKey={titleKey} chips={chips} closed={closed} startOpen={r.id === fresh} />)}</div>;
  return (
    <>
      <ViewHead title={title} />
      {before}
      {canAdd && <form className="addbar" onSubmit={add}><input id={`add-${col}`} className="in" placeholder={addPh} aria-label={addPh} value={v} onChange={e => setV(e.target.value)} />{groups && <select id={`add-${col}-group`} className="in group-sel" aria-label="Section" value={grp} onChange={e => setGrp(e.target.value)}>{groups.map(g => <option key={g}>{g}</option>)}</select>}<button className="btn primary">Add</button></form>}
      {!model.project && <p className="small quiet">Pick a project in the list to add here.</p>}
      {!list.length ? <div className="empty"><p>{emptyText}</p></div> : groups ? groups.map(g => {
        const rs = list.filter(r => (r[groupKey] || groups[0]) === g);
        return rs.length ? <section className="rgroup" key={g}><h2>{g}<span className="num">{rs.length}</span></h2>{renderList(rs)}</section> : null;
      }) : renderList(list)}
    </>
  );
}

function Decisions() {
  const { model } = useCtx();
  const schema = [
    { k: 'status', l: 'Status', t: 'sel', opts: ['Open', 'Decided'], onSet: (v, r, m) => ({ decidedAt: v === 'Decided' ? m.today : null }), log: (v, r) => `marked decision ${v.toLowerCase()}: ${r.text}` },
    { k: 'owner', l: 'Who decides', t: 'person' },
    { k: 'due', l: 'Decide by', t: 'date' },
    { k: 'phaseId', l: 'Phase', t: 'phase' },
    { k: 'itemIds', l: 'Work items waiting on this', t: 'items', wide: true },
    { k: 'resolution', l: 'Decision made', t: 'area', wide: true, ph: 'Record what was decided and why' },
  ];
  const chips = (r, m) => [
    r.status === 'Decided' ? ['Decided', 'good'] : ['Open', 'warn'],
    m.pid === 'all' && [m.projectById[r.projectId]?.name],
    r.owner && [m.nameOf(r.owner)],
    r.due && r.status !== 'Decided' && [`By ${fmt(r.due)}`, r.due < m.today ? 'crit' : 'mute'],
    (r.itemIds || []).length > 0 && [`Holds ${(r.itemIds || []).map(i => m.byId[i]?.code).filter(Boolean).join(', ')}`, 'info'],
  ];
  const open = model.decisions.filter(d => d.status !== 'Decided').length;
  return <Records title="Decisions" col="decisions" rows={model.decisions} schema={schema} titleKey="text" chips={chips} closed={r => r.status === 'Decided'}
    addPh="Add a decision the team needs to make" defaults={{ status: 'Open', phaseId: '', owner: '', due: '', resolution: '' }}
    before={<p className="quiet">{open} open of {model.decisions.length}. Link a decision to the work it holds up and that work shows a warning until it is decided.</p>}
    sort={(a, b) => (a.status === 'Decided') - (b.status === 'Decided')} emptyText="No decisions yet. Add the first question the team needs to settle." />;
}

const SC = { Low: 1, Medium: 2, High: 3 };
const riskScore = r => (SC[r.likelihood] || 0) * (SC[r.impact] || 0);
function Risks() {
  const { model } = useCtx();
  const LV = ['Not set', 'Low', 'Medium', 'High'];
  const schema = [
    { k: 'status', l: 'Status', t: 'sel', opts: ['Open', 'Mitigating', 'Closed'] },
    { k: 'likelihood', l: 'Likelihood', t: 'sel', opts: LV },
    { k: 'impact', l: 'Impact', t: 'sel', opts: LV },
    { k: 'owner', l: 'Owner', t: 'person' },
    { k: 'mitigation', l: 'Mitigation', t: 'area', wide: true, ph: 'What reduces this risk' },
    { k: 'itemIds', l: 'Linked work items', t: 'items', wide: true },
  ];
  const chips = (r, m) => {
    const s = riskScore(r);
    return [s ? (s >= 6 ? ['High risk', 'crit'] : s >= 3 ? ['Medium risk', 'warn'] : ['Low risk', 'good']) : ['Not scored'], [r.status || 'Open'], r.owner && [m.nameOf(r.owner)], (r.itemIds || []).length > 0 && [(r.itemIds || []).map(i => m.byId[i]?.code).filter(Boolean).join(', '), 'info']];
  };
  const active = model.risks.filter(r => r.status !== 'Closed');
  const count = (l, i) => active.filter(r => r.likelihood === l && r.impact === i).length;
  const tint = s => s >= 6 ? 'var(--crit-soft)' : s >= 3 ? 'var(--warn-soft)' : 'var(--good-soft)';
  const unscored = active.filter(r => !riskScore(r)).length;
  const heat = (
    <section className="panel">
      <h2>Risk map</h2>
      <div className="heat" role="table" aria-label="Open risks by likelihood and impact">
        {['High', 'Medium', 'Low'].map(i => (
          <React.Fragment key={i}><div className="l">{i} impact</div>{['Low', 'Medium', 'High'].map(l => <div key={l} style={{ background: tint(SC[l] * SC[i]) }}>{count(l, i) || ''}</div>)}</React.Fragment>
        ))}
        <div className="l" /><div className="l">Low</div><div className="l">Medium</div><div className="l">High likelihood</div>
      </div>
      {unscored > 0 && <p className="small quiet">{unscored} open risk{unscored > 1 ? 's are' : ' is'} not scored yet.</p>}
    </section>
  );
  return <Records title="Risks" col="risks" rows={model.risks} schema={schema} titleKey="title" chips={chips} closed={r => r.status === 'Closed'} addPh="Add something that could go wrong" defaults={{ status: 'Open', likelihood: 'Not set', impact: 'Not set', owner: '', mitigation: '' }} before={heat} emptyText="No risks logged yet." />;
}

const KPI_SECTIONS = ['Ops', 'Hiring', 'Customer Success', 'Finance', 'Major Accounts'];
const ACCOUNTS = 'Major Accounts';
const RAG = [['R', 'Red'], ['Y', 'Yellow'], ['G', 'Green']];
const weekOf = s => { const n = dn(s); return ds(n - ((n + 3) % 7)); };

function ScoreRow({ row }) {
  const { api, ro, model } = useCtx();
  const week = useContext(WeekCtx);
  const [open, setOpen] = useState(false);
  const rag = row.rag || {};
  const cur = rag[week] || '';
  const isAccount = row.section === ACCOUNTS;
  const trail = Array.from({ length: 6 }, (_, i) => ds(dn(week) - 7 * (6 - i)));
  const set = v => {
    const next = { ...rag };
    if (cur === v) delete next[week]; else next[week] = v;
    api.patch('kpis', row.id, { rag: next });
    api.log(row.projectId, null, cur === v ? `cleared ${row.name} for the week of ${fmt(week)}` : `marked ${row.name} ${RAG.find(x => x[0] === v)[1]} for the week of ${fmt(week)}`);
  };
  const schema = isAccount
    ? [{ k: 'section', l: 'Section', t: 'sel', opts: KPI_SECTIONS }, { k: 'owner', l: 'Owner', t: 'person' }, { k: 'purpose', l: 'Notes', t: 'area', wide: true, ph: 'Contacts, scope or anything to watch' }, { k: 'itemIds', l: 'Linked work items', t: 'items', wide: true }]
    : [{ k: 'section', l: 'Section', t: 'sel', opts: KPI_SECTIONS }, { k: 'baseline', l: 'Baseline', t: 'text', ph: 'Not measured yet' }, { k: 'current', l: 'Current', t: 'text', ph: 'Not measured yet' }, { k: 'owner', l: 'Owner', t: 'person' },
      { k: 'formula', l: 'Formula', t: 'area', wide: true, ph: 'How this is calculated' }, { k: 'purpose', l: 'Purpose', t: 'area', wide: true, ph: 'What decision this number supports' }, { k: 'benchmark', l: 'Residential benchmark', t: 'text', wide: true, ph: 'How Residential tracks this today' }, { k: 'source', l: 'Data source', t: 'text', wide: true, ph: 'Where the numbers come from' }, { k: 'itemIds', l: 'Linked work items', t: 'items', wide: true }];
  return (
    <div className="sc-item">
      <div className="sc-row">
        <div className="sc-name"><EditText className="bare" multi label={isAccount ? 'Account name' : 'KPI name'} value={row.name} onSave={v => v && api.patch('kpis', row.id, { name: v })} /></div>
        <div className="sc-target"><span className="sc-lbl">Target</span><EditText className="bare" label={`Target for ${row.name}`} placeholder="Set target" value={row.target} onSave={v => api.patch('kpis', row.id, { target: v })} /></div>
        <div className="rag" role="group" aria-label={`Status for ${row.name}, week of ${fmt(week)}`}>
          {RAG.map(([k, l]) => <button key={k} type="button" data-c={k} disabled={ro} aria-label={l} aria-pressed={cur === k} title={l} onClick={() => set(k)}>{k}</button>)}
        </div>
        <div className="trail" aria-label="Previous six weeks">
          {trail.map(w => <i key={w} data-v={rag[w] || ''} title={`Week of ${fmt(w)}: ${(RAG.find(x => x[0] === rag[w]) || [0, 'not checked'])[1]}`} />)}
        </div>
        <button className="tog" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Details'}</button>
      </div>
      {open && <div className="rec-b">
        {schema.map(f => <FieldEdit key={f.k} f={f} row={row} col="kpis" />)}
        <div className="wide"><Confirm label="Delete" ask="Delete this row for everyone?" onYes={() => api.del('kpis', row.id)} /></div>
      </div>}
    </div>
  );
}

const WeekCtx = createContext('');
function Kpis() {
  const { model, api, ro } = useCtx();
  const thisWeek = weekOf(model.today);
  const [week, setWeek] = useState(thisWeek);
  const [v, setV] = useState('');
  const [grp, setGrp] = useState(KPI_SECTIONS[0]);
  const rows = model.kpis;
  const n = k => rows.filter(r => (r.rag || {})[week] === k).length;
  const add = e => {
    e.preventDefault(); const t = v.trim(); if (!t || !model.project) return;
    api.add('kpis', { projectId: model.project.id, name: t, section: grp, itemIds: [], order: Math.max(0, ...rows.map(r => r.order || 0)) + 1, target: '', baseline: '', current: '', owner: '', formula: '', purpose: '', source: '', benchmark: '', rag: {} });
    api.log(model.project.id, null, `added to the scorecard: ${t}`);
    setV('');
  };
  return (
    <WeekCtx.Provider value={week}>
      <ViewHead title="KPI Scorecard" />
      <section className="sc-bar">
        <div className="sc-week">
          <button className="btn icon" aria-label="Previous week" onClick={() => setWeek(ds(dn(week) - 7))}>‹</button>
          <div><span className="quiet small">Weekly check-in</span><b>Week of {fmt(week)}</b></div>
          <button className="btn icon" aria-label="Next week" disabled={week >= thisWeek} onClick={() => setWeek(ds(dn(week) + 7))}>›</button>
          {week !== thisWeek && <button className="btn" onClick={() => setWeek(thisWeek)}>This week</button>}
        </div>
        <div className="sc-counts">
          {RAG.slice().reverse().map(([k, l]) => <span key={k}><i data-v={k} /><b className="num">{n(k)}</b> {l}</span>)}
          <span><i data-v="" /><b className="num">{rows.length - n('R') - n('Y') - n('G')}</b> Not checked</span>
        </div>
      </section>
      <p className="small quiet">Green is at target or better. Yellow is within 5% of target. Red is more than 5% off target.</p>
      {model.project && !ro && <form className="addbar" onSubmit={add}><input id="add-kpi" className="in" placeholder="Add a KPI or account" aria-label="Add a KPI or account" value={v} onChange={e => setV(e.target.value)} /><select id="add-kpi-group" className="in group-sel" aria-label="Section" value={grp} onChange={e => setGrp(e.target.value)}>{KPI_SECTIONS.map(g => <option key={g}>{g}</option>)}</select><button className="btn primary">Add</button></form>}
      {!rows.length && <div className="empty"><p>No KPIs yet. Add the numbers and accounts this project needs to check each week.</p></div>}
      {KPI_SECTIONS.map(g => {
        const rs = rows.filter(r => (r.section || KPI_SECTIONS[0]) === g);
        if (!rs.length) return null;
        return (
          <section className="group sc-group" key={g}>
            <div className="ghead"><h2>{g}</h2><span className="small quiet num">{rs.length}</span></div>
            <div className="sc-table">
              <div className="sc-row sc-head"><span>{g === ACCOUNTS ? 'Account' : 'KPI'}</span><span>Target</span><span>Week of {fmt(week)}</span><span>Last 6 weeks</span><span /></div>
              {rs.map(r => <ScoreRow key={r.id} row={r} />)}
            </div>
          </section>
        );
      })}
    </WeekCtx.Provider>
  );
}

/* ---------- Team ---------- */
function Team() {
  const { model, api, ro } = useCtx();
  const [v, setV] = useState('');
  const add = e => { e.preventDefault(); const t = v.trim(); if (!t) return; api.add('people', { name: t }); setV(''); };
  const load = id => model.items.filter(i => i.status !== 'Done' && (i.owners || []).includes(id));
  const max = Math.max(1, ...model.people.map(p => load(p.id).length));
  const parts = [['Not started', '#cfe3d7'], ['In progress', '#ff7049'], ['Blocked', '#ff0051']];
  const none = model.items.filter(i => i.status !== 'Done' && !(i.owners || []).length).length;
  return (
    <>
      <ViewHead title="Team" />
      <p className="quiet">{none} open item{none === 1 ? '' : 's'} with no owner. Names added here appear in every owner list.</p>
      {!ro && <form className="addbar" onSubmit={add}><input id="add-person" className="in" placeholder="Add a person or team" aria-label="Add a person or team" value={v} onChange={e => setV(e.target.value)} /><button className="btn primary">Add</button></form>}
      <div className="legend">{parts.map(p => <span key={p[0]}><i style={{ background: p[1] }} />{p[0]}</span>)}</div>
      <section className="panel">
        <ul className="team">
          {model.people.map(p => {
            const l = load(p.id);
            return (
              <li key={p.id}>
                <span className="who"><Avatar name={p.name} /><EditText className="bare" label="Name" value={p.name} onSave={t => t && api.patch('people', p.id, { name: t })} /></span>
                <div className="stack" title={`${l.length} open items`} style={{ width: `${l.length / max * 100}%`, minWidth: l.length ? 12 : 0 }}>{parts.map(x => { const n = l.filter(i => i.status === x[0]).length; return n ? <i key={x[0]} style={{ flex: n, background: x[1] }} /> : null; })}</div>
                <span className="confirm"><span className="num small">{l.length} open</span><Confirm label="Remove" ask="Remove this person?" onYes={() => {
                  model.allItems.filter(i => (i.owners || []).includes(p.id)).forEach(i => api.patch('items', i.id, { owners: i.owners.filter(o => o !== p.id) }));
                  api.del('people', p.id);
                }} /></span>
              </li>
            );
          })}
        </ul>
        {!model.people.length && <p className="quiet">Add the people who will own work.</p>}
      </section>
    </>
  );
}

/* ---------- Activity ---------- */
function Activity() {
  const { model, profiles, open } = useCtx();
  const days = {};
  model.activity.forEach(a => { (days[a.at.slice(0, 10)] = days[a.at.slice(0, 10)] || []).push(a); });
  return (
    <>
      <ViewHead title="Activity" />
      {model.activity.length ? <div className="act">{Object.keys(days).sort().reverse().map(d => (
        <section key={d}><h3>{fmt(d)}</h3>
          <ul className="alist">{days[d].map(a => <li key={a.id}><span className="date tag">{new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><div><strong>{profiles[a.by]?.name || 'Someone'}</strong> {a.itemId && model.byId[a.itemId] ? <button className="link" style={{ fontWeight: 400 }} onClick={() => open(a.itemId)}>{a.text}</button> : a.text}</div></li>)}</ul>
        </section>))}</div> : <div className="empty"><p>Changes to status, owners, dates and decisions will appear here as people make them.</p></div>}
    </>
  );
}

/* ---------- Setup ---------- */
function Setup({ onDeleted }) {
  const { model, api } = useCtx();
  const [typed, setTyped] = useState('');
  const p = model.project;
  if (!p) return <><ViewHead title="Project setup" /><div className="empty"><p>Pick a project in the list to change its setup.</p></div></>;
  const swap = (a, b) => { api.patch('phases', a.id, { order: b.order }); api.patch('phases', b.id, { order: a.order }); };
  const wipe = async () => {
    for (const [col, rows] of [['items', model.items], ['decisions', model.decisions], ['risks', model.risks], ['kpis', model.kpis], ['docs', model.docs], ['phases', model.phases]]) for (const r of rows) await api.del(col, r.id);
    await api.del('projects', p.id);
    onDeleted();
  };
  return (
    <>
      <ViewHead title="Project setup" />
      <section className="panel">
        <div className="f"><label htmlFor="pname">Project name</label><EditText id="pname" value={p.name} onSave={v => v && api.patch('projects', p.id, { name: v })} /></div>
        <div className="f"><label htmlFor="psum">Summary</label><EditText id="psum" multi value={p.summary} onSave={v => api.patch('projects', p.id, { summary: v })} /></div>
      </section>
      <section className="panel">
        <h2>Phases</h2>
        <div>
          {model.phases.map((ph, n) => {
            const count = model.items.filter(i => i.phaseId === ph.id).length;
            return (
              <div className="ph-row" key={ph.id}>
                <span className="confirm">
                  <button className="btn" aria-label={`Move ${ph.name} up`} disabled={!n} onClick={() => swap(ph, model.phases[n - 1])}>↑</button>
                  <button className="btn" aria-label={`Move ${ph.name} down`} disabled={n === model.phases.length - 1} onClick={() => swap(ph, model.phases[n + 1])}>↓</button>
                </span>
                <EditText label="Phase name" value={ph.name} onSave={v => v && api.patch('phases', ph.id, { name: v })} />
                <div className="goal"><EditText label="Phase goal" placeholder="Goal for this phase" value={ph.goal} onSave={v => api.patch('phases', ph.id, { goal: v })} /></div>
                {count ? <span className="small quiet num">{count} item{count > 1 ? 's' : ''}</span> : <Confirm label="Delete" ask="Delete phase?" onYes={() => api.del('phases', ph.id)} />}
              </div>
            );
          })}
        </div>
        <PhaseAdd />
      </section>
      <section className="panel">
        <h2>Delete this project</h2>
        <p className="small quiet">This removes the project and its work items, decisions, risks, KPIs and documents for everyone. Type the project name to confirm.</p>
        <div className="addbar"><input id="del-confirm" className="in" aria-label="Type the project name to confirm" value={typed} onChange={e => setTyped(e.target.value)} /><button className="btn danger" disabled={typed !== p.name} onClick={wipe}>Delete project</button></div>
      </section>
    </>
  );
}

/* ---------- Item sheet ---------- */
function ItemSheet({ it, close }) {
  const { model, api, ro, profiles } = useCtx();
  const act = useActions();
  const m = model.meta[it.id];
  const [check, setCheck] = useState('');
  const [note, setNote] = useState('');
  const set = (k, label) => v => act.setField(it, k, v, label);
  const list = it.checklist || [];
  const setList = l => api.patch('items', it.id, { checklist: l });
  const addCheck = e => { e.preventDefault(); const t = check.trim(); if (!t) return; setList([...list, { id: `c${Date.now()}`, text: t, done: false }]); setCheck(''); };
  const comments = model.comments.filter(c => c.itemId === it.id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const addNote = e => { e.preventDefault(); const t = note.trim(); if (!t) return; api.add('comments', { itemId: it.id, projectId: it.projectId, text: t, by: model.meId || null }); api.log(it.projectId, it.id, `commented on ${it.code} ${it.title}`); setNote(''); };
  const depOpts = model.allItems.filter(o => o.projectId === it.projectId && o.id !== it.id).sort(byCode).map(o => ({ id: o.id, label: `${o.code} ${o.title}`, short: o.code }));
  const decs = model.decisions.filter(d => (d.itemIds || []).includes(it.id));
  return (
    <>
      <div className="shade" onClick={close} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={`${it.code} ${it.title}`}>
        <div className="vh" style={{ alignItems: 'center' }}>
          <span className="eyebrow" style={{ margin: 0 }}>{model.projectById[it.projectId]?.name} · {it.code}</span>
          <button className="btn" onClick={close}>Close</button>
        </div>
        <EditText className="bare sheet-t" multi label="Title" value={it.title} onSave={v => v && act.setField(it, 'title', v)} />
        {(m.overdue || m.conflicts.length > 0 || m.waiting.length > 0) && <div className="chips"><Flags it={it} /></div>}
        <div className="grid2">
          <div className="f"><label htmlFor="s-status">Status</label><Sel id="s-status" cls="in" pills={false} value={it.status} options={STATUS} onChange={v => act.setStatus(it, v)} /></div>
          <div className="f"><label htmlFor="s-pri">Priority</label><Sel id="s-pri" cls="in" pills={false} value={it.priority || 'Not set'} options={LEVELS} onChange={set('priority', 'priority')} /></div>
          <div className="f"><label htmlFor="s-eff">Effort</label><Sel id="s-eff" cls="in" pills={false} value={it.effort || 'Not set'} options={LEVELS} onChange={set('effort', 'effort')} /></div>
          <div className="f"><label htmlFor="s-start">Start</label><EditDate id="s-start" value={it.start} onSave={v => act.setDates(it, v, it.end && v && it.end < v ? v : it.end)} /></div>
          <div className="f"><label htmlFor="s-end">End</label><EditDate id="s-end" value={it.end} onSave={v => act.setDates(it, it.start && v && v < it.start ? v : it.start, v)} /></div>
          <div className="f"><label htmlFor="s-phase">Phase</label><Sel id="s-phase" cls="in" pills={false} value={it.phaseId} options={model.allPhases.filter(p => p.projectId === it.projectId).map(p => [p.id, p.name])} onChange={v => act.moveToPhase(it, v)} /></div>
        </div>
        <div className="f"><span className="lb">Owners</span><OwnerPick id="s-own" value={it.owners} onChange={o => act.setOwners(it, o)} /></div>
        {it.status === 'Blocked' && <div className="f"><label htmlFor="s-why">What is blocking this</label><EditText id="s-why" value={it.blockedReason} onSave={set('blockedReason')} /></div>}
        <div className="sec">
          <div className="f"><label htmlFor="s-area">Area</label><EditText id="s-area" value={it.area} onSave={set('area')} /></div>
          <div className="f"><label htmlFor="s-prob">Current issue</label><EditText id="s-prob" multi value={it.problem} placeholder="What is wrong today" onSave={set('problem')} /></div>
          <div className="f"><label htmlFor="s-sol">Solution and deliverables</label><EditText id="s-sol" multi value={it.solution} placeholder="What will be built or changed" onSave={set('solution')} /></div>
          <div className="f"><label htmlFor="s-out">Desired outcome</label><EditText id="s-out" multi value={it.outcome} placeholder="How we know this is done" onSave={set('outcome')} /></div>
        </div>
        <div className="sec">
          <h3>Checklist <span className="num quiet">{m.checkDone}/{m.checkAll}</span></h3>
          {list.map(c => (
            <div className="chk" key={c.id} data-d={c.done ? '1' : '0'}>
              <input id={`ck-${c.id}`} type="checkbox" aria-label={c.text} disabled={ro} checked={!!c.done} onChange={e => setList(list.map(x => x.id === c.id ? { ...x, done: e.target.checked } : x))} />
              <EditText className="bare" multi label="Checklist step" value={c.text} onSave={v => v && setList(list.map(x => x.id === c.id ? { ...x, text: v } : x))} />
              {!ro && <button className="x" aria-label="Remove step" onClick={() => setList(list.filter(x => x.id !== c.id))}>×</button>}
            </div>
          ))}
          {!ro && <form className="addbar" onSubmit={addCheck}><input id="s-check" className="in" placeholder="Add a step" aria-label="Add a checklist step" value={check} onChange={e => setCheck(e.target.value)} /><button className="btn">Add</button></form>}
        </div>
        <div className="sec">
          <h3>Depends on</h3>
          <MultiPick id="s-deps" addLabel="Add dependency" value={it.deps || []} options={depOpts} onChange={d => { api.patch('items', it.id, { deps: d }); }} />
          {m.conflicts.map(c => <p key={c.id} className="small" style={{ color: 'var(--crit)' }}>This starts {fmt(it.start)}, before {c.code} ends {fmt(c.end)}.</p>)}
        </div>
        {decs.length > 0 && <div className="sec"><h3>Linked decisions</h3><ul className="alist">{decs.map(d => <li key={d.id}><span className={`flag tag ${d.status === 'Decided' ? 'good' : 'warn'}`}>{d.status}</span><div>{d.text}{d.resolution && <p className="small quiet">{d.resolution}</p>}</div></li>)}</ul></div>}
        <div className="sec">
          <h3>Comments</h3>
          {comments.map(c => <div className="cmt" key={c.id}><small>{profiles[c.by]?.name || 'Someone'} · {fmt(String(c.createdAt).slice(0, 10))}</small>{c.text}</div>)}
          {!ro && <form onSubmit={addNote} className="list"><textarea id="s-note" className="in" rows={2} placeholder="Add a comment" aria-label="Add a comment" value={note} onChange={e => setNote(e.target.value)} /><div><button className="btn">Post comment</button></div></form>}
        </div>
        <div className="sec"><div><Confirm label="Delete work item" onYes={async () => { close(); await act.deleteItem(it); }} /></div></div>
      </aside>
    </>
  );
}

/* ---------- Modals ---------- */
function NewProject({ close, created }) {
  const { api, model } = useCtx();
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [phases, setPhases] = useState('');
  const save = e => {
    e.preventDefault(); const n = name.trim(); if (!n) return;
    const id = api.add('projects', { name: n, summary: summary.trim(), order: model.projects.length + 1 });
    phases.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach((p, i) => api.add('phases', { projectId: id, name: p, goal: '', order: i + 1 }));
    api.log(id, null, `created project ${n}`);
    created(id);
  };
  return (
    <><div className="shade" onClick={close} />
      <form className="modal" role="dialog" aria-modal="true" aria-label="New project" onSubmit={save}>
        <h2>New project</h2>
        <div className="f"><label htmlFor="np-name">Name</label><input id="np-name" autoFocus className="in" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="f"><label htmlFor="np-sum">What it will deliver</label><textarea id="np-sum" className="in" rows={2} value={summary} onChange={e => setSummary(e.target.value)} /></div>
        <div className="f"><label htmlFor="np-ph">Phases, one per line (optional)</label><textarea id="np-ph" className="in" rows={3} value={phases} onChange={e => setPhases(e.target.value)} /></div>
        <div className="actions"><button className="btn primary" disabled={!name.trim()}>Create project</button><button type="button" className="btn" onClick={close}>Cancel</button></div>
      </form></>
  );
}

function Weekly({ text, close }) {
  const r = useRef();
  const [v, setV] = useState(text);
  const [ok, setOk] = useState(false);
  const copy = () => {
    const done = () => setOk(true);
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(done).catch(() => r.current.select());
    else r.current.select();
  };
  return (
    <><div className="shade" onClick={close} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Weekly update">
        <h2>Weekly update</h2>
        <textarea id="weekly" ref={r} className="in" style={{ overflow: 'auto' }} rows={15} value={v} onChange={e => setV(e.target.value)} />
        <div className="actions"><button className="btn primary" onClick={copy}>{ok ? 'Copied' : 'Copy text'}</button><button className="btn" onClick={close}>Close</button></div>
      </div></>
  );
}

function YourName({ value, onSave }) {
  const [v, setV] = useState(value || '');
  useEffect(() => setV(value || ''), [value]);
  return <div className="you"><label htmlFor="your-name">Your name</label><input id="your-name" className="in" placeholder="Shown on your changes" value={v} onChange={e => setV(e.target.value)} onBlur={() => onSave(v.trim())} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} /></div>;
}

/* ---------- App ---------- */
function App() {
  const store = useStore();
  const { data, stage, ro, api, toast, profiles, dl, me } = store;
  const [view, go] = useHashView();
  const [pid, setPidRaw] = useState(() => lsGet('pid'));
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null);
  const [filters, setFilters] = useState({ q: '', owner: '', status: '', priority: '' });
  const setPid = p => { setPidRaw(p); lsSet('pid', p); setOpenId(null); };
  const projects = useMemo(() => [...data.projects].sort(byOrder), [data.projects]);
  const eff = pid === 'all' || projects.some(p => p.id === pid) ? pid : (projects[0]?.id || 'all');
  const model = useMemo(() => ({ ...buildModel(data, eff), meId: me.id }), [data, eff, me.id]);
  useEffect(() => { const f = e => { if (e.key === 'Escape') { setOpenId(null); setModal(null); } }; addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  const ctx = { model, api, ro, profiles, dl, open: setOpenId };
  const item = openId ? model.byId[openId] : null;
  const count = {
    items: model.items.filter(i => i.status !== 'Done').length,
    decisions: model.decisions.filter(d => d.status !== 'Decided').length,
    risks: model.risks.filter(r => r.status !== 'Closed').length,
    kpis: model.kpis.length, team: model.people.length,
  };
  const prog = id => { const l = data.items.filter(i => i.projectId === id); return `${l.filter(i => i.status === 'Done').length}/${l.length} done`; };
  let body;
  if (!projects.length && stage !== 'ready') {
    const msg = stage === 'none' ? 'Open this page in Claude to load the shared project data.' : stage === 'error' ? 'The project data stopped loading. Reload the page to try again.' : stage === 'slow' ? 'The project data can’t be reached yet. Check your connection; this page will keep trying.' : 'Loading projects, work items, decisions and the timeline.';
    body = <div className="empty"><img src={LOGO} alt="UrbanMop" width="128" height="43" /><p>{msg}</p></div>;
  } else if (!projects.length) {
    body = <div className="empty"><h2>No projects yet</h2><p>Create the first project, then add phases and work items.</p>{!ro && <button className="btn primary" onClick={() => setModal({ type: 'new' })}>New project</button>}</div>;
  } else {
    const P = { filters, setFilters };
    body = view === 'overview' ? <Overview setModal={setModal} setFilters={setFilters} go={go} />
      : view === 'items' ? <Items {...P} /> : view === 'board' ? <Board {...P} /> : view === 'timeline' ? <Timeline {...P} />
        : view === 'decisions' ? <Decisions /> : view === 'risks' ? <Risks /> : view === 'kpis' ? <Kpis />
          : view === 'team' ? <Team /> : view === 'activity' ? <Activity /> : <Setup onDeleted={() => { setPid('all'); go('overview'); }} />;
  }
  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className="rail" aria-label="Projects and views">
          <div className="brand"><img src={LOGO} alt="UrbanMop" width="128" height="43" /><span>Commercial Project Tracker</span></div>
          {window.__HOSTED && <YourName value={me.id} onSave={store.setName} />}
          <div className="rail-sec">
            <p className="rail-label">Projects</p>
            <div className="plist">
              {projects.length > 1 && <button className="pbtn" aria-current={eff === 'all'} onClick={() => setPid('all')}><b>All projects</b><small>{data.items.filter(i => i.status === 'Done').length}/{data.items.length} done</small></button>}
              {projects.map(p => <button key={p.id} className="pbtn" aria-current={eff === p.id} onClick={() => setPid(p.id)}><b>{p.name}</b><small>{prog(p.id)}</small></button>)}
              {!ro && stage !== 'none' && <button className="pnew" onClick={() => setModal({ type: 'new' })}>+ New project</button>}
            </div>
          </div>
          <div className="rail-sec">
            <p className="rail-label">Views</p>
            <div className="nav">
              {VIEWS.map(v => <button key={v[0]} className="nbtn" aria-current={view === v[0] ? 'page' : undefined} onClick={() => go(v[0])}><Ico n={v[0]} /><span className="lb">{v[1]}</span><span className="n">{count[v[0]] ?? ''}</span></button>)}
            </div>
          </div>
        </nav>
        <main className="main"><div className="wrap">
          {ro && <p className="banner">You have view access. Ask Leslie for Contributor access to make changes.</p>}
          {stage === 'slow' && projects.length > 0 && <p className="banner">This may be out of date. The latest project data can’t be reached yet.</p>}
          {body}
        </div></main>
      </div>
      {item && <ItemSheet key={item.id} it={item} close={() => setOpenId(null)} />}
      {modal?.type === 'new' && <NewProject close={() => setModal(null)} created={id => { setModal(null); setPid(id); go('overview'); }} />}
      {modal?.type === 'weekly' && <Weekly text={modal.text} close={() => setModal(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

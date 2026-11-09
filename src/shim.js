// Gives the app the same data, people and download functions it uses inside Claude, backed by this server.
(function () {
  var S = {}, subs = [], loaded = false, NAME_KEY = 'um-tracker-name', stream = null;
  function nameGet() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
  function nameSet(v) { try { localStorage.setItem(NAME_KEY, v); } catch (e) { } }
  function snap(c, q) {
    var rows = Object.keys(S[c] || {}).map(function (id) { var d = S[c][id]; return { id: id, exists: true, data: function () { return d; }, metadata: { fromCache: false, hasPendingWrites: false } }; });
    if (q.field) { var dir = q.dir === 'desc' ? -1 : 1; rows.sort(function (a, b) { return String(a.data()[q.field]).localeCompare(String(b.data()[q.field])) * dir; }); }
    else rows.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    if (q.n) rows = rows.slice(0, q.n);
    return { docs: rows, size: rows.length, empty: !rows.length, metadata: { fromCache: !loaded, hasPendingWrites: false }, docChanges: function () { return []; } };
  }
  function fire(c) { subs.slice().forEach(function (s) { if (!c || s.c === c) s.next(snap(s.c, s.q)); }); }
  function load() {
    return fetch('/api/data', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); }).then(function (d) { S = d; loaded = true; fire(); });
  }
  function loadWithRetry() { load().catch(function () { setTimeout(loadWithRetry, 3000); }); }
  function listen() {
    if (stream) stream.close();
    var opened = false;
    stream = new EventSource('/api/events');
    stream.onopen = function () { if (opened) load().catch(function () { }); opened = true; };
    stream.onmessage = function (m) {
      var e = JSON.parse(m.data); S[e.col] = S[e.col] || {};
      if (e.data === null) delete S[e.col][e.id]; else S[e.col][e.id] = e.data;
      fire(e.col);
    };
  }
  function post(body) {
    return fetch('/api/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      if (r.ok) return;
      return r.json().catch(function () { return {}; }).then(function (j) { throw { code: j.code === 'invalid_argument' ? 'unavailable' : (j.code || 'unavailable'), message: 'write failed' }; });
    }).catch(function (e) { load().catch(function () { }); throw e && e.code ? e : { code: 'unavailable', message: 'write failed' }; });
  }
  function docRef(c, id) {
    return {
      id: id, path: c + '/' + id,
      set: function (d) { S[c] = S[c] || {}; S[c][id] = d; fire(c); return post({ op: 'set', col: c, id: id, data: d }); },
      update: function (d) { S[c] = S[c] || {}; S[c][id] = Object.assign({}, S[c][id], d); fire(c); return post({ op: 'update', col: c, id: id, data: d }); },
      delete: function () { if (S[c]) delete S[c][id]; fire(c); return post({ op: 'delete', col: c, id: id }); },
    };
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function col(c, q) {
    q = q || {};
    return {
      path: c,
      doc: function (id) { return docRef(c, id || newId()); },
      add: function (d) { var r = docRef(c, newId()); return r.set(d).then(function () { return r; }); },
      orderBy: function (f, dir) { return col(c, Object.assign({}, q, { field: f, dir: dir })); },
      limit: function (n) { return col(c, Object.assign({}, q, { n: n })); },
      get: function () { return Promise.resolve(snap(c, q)); },
      onSnapshot: function (next) {
        var s = { c: c, q: q, next: next }; subs.push(s);
        if (loaded) setTimeout(function () { next(snap(c, q)); });
        return function () { subs.splice(subs.indexOf(s), 1); };
      },
    };
  }
  var db = { collection: function (c) { return col(c); }, doc: function (p) { var a = p.split('/'); return docRef(a[0], a[1]); } };
  var user = {
    me: function () { var n = nameGet(); return Promise.resolve({ id: n || null, name: n, avatarUrl: '', color: '', email: null, isOwner: false, canEdit: true }); },
    can: function () { return Promise.resolve(true); },
    setName: nameSet,
    profiles: function (ids) { var o = {}; [].concat(ids).forEach(function (i) { o[i] = { id: i, name: i, avatarUrl: '', color: '', email: null, isMe: i === nameGet(), guest: false }; }); return Promise.resolve(o); },
  };
  var downloads = {
    save: function (f) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([f.data], { type: 'text/csv' })); a.download = f.filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      return Promise.resolve({ status: 'saved' });
    },
  };
  window.__HOSTED = true;
  window.claude = { use: function (n) { return Promise.resolve({ db: db, user: user, downloads: downloads }[n] || null); } };
  loadWithRetry(); listen();
})();

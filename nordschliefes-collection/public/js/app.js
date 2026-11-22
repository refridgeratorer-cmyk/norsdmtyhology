// Nordschliefe's Collection - frontend. Hash routing, all data comes from /api.
const S = { me: null, uni: [] }, $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = 'home book map globe eye shield sword crown users archive file-text clock calendar search settings plus edit trash user upload flag folder skull flame star scroll landmark compass anchor key lock radio tv alert-triangle ghost music heart'.split(' ');
const THEMES = [['meridian', 'Meridian (white / classified)'], ['aurelis', 'Aurelis (red / military)'], ['afterhours', 'After Hours (purple / chaotic)'], ['azure', 'Azure (blue)'], ['verdant', 'Verdant (green)']];
const ic = (n, c = '') => `<i data-lucide="${esc(n)}" class="${c}"></i>`;
const paint = () => window.lucide && lucide.createIcons();
function toast(m) { const t = $('#toast'), d = document.createElement('div'); d.textContent = m; t.append(d); setTimeout(() => d.remove(), 3000); }
async function api(url, opt = {}) {
  const o = { credentials: 'same-origin', ...opt };
  if (o.body && !(o.body instanceof FormData)) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.body); }
  let r; try { r = await fetch('/api' + url, o); } catch { throw new Error('Cannot reach the server.'); }
  let j; try { j = await r.json(); } catch { throw new Error('The server sent an unexpected reply.'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }
const isW = () => S.me?.role === 'writer';
const av = (u, s = 28) => u?.profile_picture ? `<img class="avatar" style="--s:${s}px" src="${esc(u.profile_picture)}" alt="">` : `<span class="avatar" style="--s:${s}px">${esc((u?.display_name || '?')[0].toUpperCase())}</span>`;
const crumbs = a => `<nav class="crumbs ui"><a href="#/">ARCHIVE</a>${a.map(([l, h]) => `<span>/</span>${h ? `<a href="${h}">${esc(l.toUpperCase())}</a>` : esc(l.toUpperCase())}`).join('')}</nav>`;

// ---- tiny safe Markdown (escapes HTML first) ----
function md(src) {
  const inl = t => esc(t).replace(/!\[([^\]]*)\]\((\/uploads\/[\w.\/-]+|https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<img src="${u}" alt="${a}">${a ? `<em class="cap">${a}</em>` : ''}`)
    .replace(/\[([^\]]+)\]\((#\/[^\s)]*|https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<a href="${u}"${u[0] === '#' ? '' : ' target="_blank" rel="noopener"'}>${a}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  let out = '', list = null; const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of String(src).split(/\r?\n/)) {
    let m; if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out += `<h${m[1].length + 1}>${inl(m[2])}</h${m[1].length + 1}>`; }
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { close(); out += '<hr>'; }
    else if ((m = line.match(/^>\s?(.*)/))) { close(); out += `<blockquote>${inl(m[1])}</blockquote>`; }
    else if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/))) { const t = /\d/.test(m[1]) ? 'ol' : 'ul'; if (list !== t) { close(); out += `<${t}>`; list = t; } out += `<li>${inl(m[2])}</li>`; }
    else if (line.trim()) { close(); out += `<p>${inl(line)}</p>`; } else close(); }
  close(); return out; }

// ---- chrome ----
function nav() {
  const m = S.me;
  $('#nav').innerHTML = `<div class="nav"><a class="brand" href="#/">NORDSCHLIEFE'S COLLECTION</a>
  <a class="i" href="#/">${ic('home')}<span>Home</span></a><a class="i" href="#/universes">${ic('globe')}<span>Universes</span></a>
  <a class="i" href="#/about">${ic('book')}<span>About</span></a><a class="i" href="#/search">${ic('search')}<span>Search</span></a>
  ${isW() ? `<a class="i" href="#/writer"><b class="wm">✦ WRITER MODE</b></a>` : ''}
  ${m ? `<a class="i" href="#/profile/${esc(m.username)}">${av(m)}<span>${esc(m.display_name)}</span></a><button class="btn" id="out">${ic('lock')}Log out</button>`
      : `<a class="i" href="#/login">${ic('user')}<span>Profile</span></a>`}</div>`;
  $('#out')?.addEventListener('click', async () => { await api('/logout', { method: 'POST' }); S.me = null; nav(); location.hash = '#/'; toast('Logged out.'); });
  paint(); }
async function loadUni() { S.uni = (await api('/universes')).universes; }
const uCard = u => `<a class="card" data-theme="${esc(u.theme)}" href="#/u/${esc(u.slug)}">${ic(u.icon, 'ic')}<h3>${esc(u.name)}</h3><p>${esc(u.description)}</p><div class="meta">${u.categories.length} categories</div></a>`;

// ---- pages ----
const pages = {
  async home() { return `<section class="hero"><p class="tag ui">Universes, worldbuilding scribbles, questionable ideas, and an unreasonable amount of lore.</p><h1>NORDSCHLIEFE'S COLLECTION</h1>
    <p>Welcome. This is basically where I dump all the worlds I've made, the characters I've become way too attached to, and whatever insane idea I decided needed 700 pages of backstory. Some of these started as random notes. Some started as maps. Some started because I thought something sounded cool and then accidentally built an entire universe around it. Everything here is a work in progress. Explore around. Click things. Read the lore. Get lost somewhere you probably weren't supposed to.</p></section>
    <div class="grid">${S.uni.map(uCard).join('')}</div>`; },
  async universes() { return crumbs([['Universes']]) + `<h1>Universes</h1><div class="grid">${S.uni.map(uCard).join('') || '<p class="empty">Nothing here yet.</p>'}</div>`; },
  async about() { return crumbs([['About']]) + `<h1>About</h1><div class="prose"><p>It's basically my brain in website form.</p><p>This collection holds universes, characters, lore, maps, stories, random ideas, and a healthy number of unfinished projects. Nothing here is final. It all grows when I do.</p><p>Make an account to vote on entries and get a profile of your own.</p></div>`; },
  async universe(us) { const u = S.uni.find(x => x.slug === us); if (!u) throw new Error('Universe not found.'); document.body.dataset.theme = u.theme;
    return crumbs([[u.name]]) + `<h1>${esc(u.name)}</h1><div class="prose">${md(u.content || u.description)}</div>${addCat(u)}<div class="grid">${u.categories.map(c =>
      `<a class="card" data-theme="${esc(u.theme)}" href="#/u/${u.slug}/${esc(c.slug)}">${ic(c.icon, 'ic')}<h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><div class="meta">${c.count} entries</div></a>`).join('') }</div>${u.categories.length ? '' : `<div class="panel empty-state"><h2>NO CATEGORIES YET</h2><p>This archive is currently empty.</p>${addCat(u)}</div>`}`; },
  async category(us, cs) { const u = S.uni.find(x => x.slug === us); if (u) document.body.dataset.theme = u.theme; const d = await api(`/c/${us}/${cs}`);
    return crumbs([[u.name, `#/u/${us}`], [d.category.name]]) + `<h1>${esc(d.category.name)}</h1><p>${esc(d.category.description)}</p>${d.entries.length ? `<div class="acts">${addBtn(u.id, d.category.id)}</div><div class="grid">${d.entries.map(e => eCard(e, u.theme)).join('')}</div>` : emptyState(u.id, d.category.id)}`; },
  async entry(us, cs, es) { const u = S.uni.find(x => x.slug === us); if (u) document.body.dataset.theme = u.theme; const { entry: e, related } = await api(`/e/${us}/${cs}/${es}`);
    return crumbs([[e.uname, `#/u/${us}`], [e.cname, `#/u/${us}/${cs}`], [e.title]]) + (e.banner ? `<img class="banner" src="${esc(e.banner)}" alt="">` : '') +
      `<h1>${ic(e.icon, 'ic')} ${esc(e.title)} ${e.status === 'draft' ? '<small class="draft ui">DRAFT</small>' : ''}</h1><p class="tag ui">${esc(e.description)}</p>${votes(e)}
      <article class="prose">${md(e.content)}</article>${related.length ? `<h2>Related entries</h2><div class="grid">${related.map(r => eCard(r, u.theme)).join('')}</div>` : ''}`; },
  async search(q = '') { return crumbs([['Search']]) + `<h1>Search</h1><div class="search"><input id="q" value="${esc(q)}" placeholder="Search universes, characters, places…" autofocus></div><div id="res"></div>`; },
  async login() { if (S.me) return location.hash = '#/profile/' + S.me.username, '';
    return crumbs([['Profile']]) + `<h1>Enter the archive</h1><div class="grid"><form class="panel" id="lf"><h3>Log in</h3><label class="ui">Username</label><input name="username" autocomplete="username" required><label class="ui">Password</label><input name="password" type="password" autocomplete="current-password" required><div class="err"></div><button class="btn pri">Log in</button></form>
      <form class="panel" id="rf"><h3>Create reader account</h3><label class="ui">Username</label><input name="username" autocomplete="username" required><label class="ui">Display name</label><input name="display_name"><label class="ui">Password (8+ characters)</label><input name="password" type="password" autocomplete="new-password" required><div class="err"></div><button class="btn pri">Sign up</button></form></div>`; },
  async profile(name) { const d = await api('/users/' + encodeURIComponent(name)), u = d.user, mine = S.me?.id === u.id;
    return crumbs([['Profile'], [u.username]]) + `<div class="profile">${av(u, 110)}<div><h1>${esc(u.display_name)}</h1><div class="ui">@${esc(u.username)} <span class="badge ${u.role === 'writer' ? 'w' : ''}">${u.role === 'writer' ? '✦ WRITER' : 'READER'}</span></div></div></div>
      <p class="prose">${esc(u.bio) || '<span class="empty">No bio yet.</span>'}</p><div class="stats"><div><b>${d.votes_given}</b>Votes given</div><div><b>${esc(u.created_at.slice(0, 10))}</b>Joined</div></div>
      ${mine ? `<div class="acts"><button class="btn" id="edp">${ic('edit')}Edit profile</button>${isW() ? `<a class="btn pri" href="#/writer">${ic('settings')}Writer dashboard</a>` : ''}</div>` : ''}`; },
  async writer() { if (!isW()) throw new Error('Writer access only.'); const { entries } = await api('/entries');
    return crumbs([['Writer dashboard']]) + `<h1>✦ Writer dashboard</h1><div class="acts"><button class="btn pri" data-a="au">${ic('plus')}ADD UNIVERSE</button><button class="btn pri" data-a="ac">${ic('plus')}ADD CATEGORY</button><button class="btn pri" data-a="ae">${ic('plus')}ADD ENTRY</button></div>
      <h2>Current universes</h2><div class="panel">${S.uni.map(u => `<div class="row"><span class="t">${ic(u.icon)} ${esc(u.name)}</span><button class="btn" data-a="eu" data-id="${u.id}">EDIT</button><button class="btn dng" data-a="du" data-id="${u.id}">DELETE</button></div>`).join('')}</div>
      <h2>Current categories</h2><div class="panel">${S.uni.flatMap(u => u.categories.map(c => `<div class="row"><span class="t">${esc(u.name)} / ${esc(c.name)}</span><button class="btn" data-a="ec" data-id="${c.id}">EDIT</button><button class="btn dng" data-a="dc" data-id="${c.id}">DELETE</button></div>`)).join('')}</div>
      <h2>Current entries</h2><div class="panel">${entries.map(e => `<div class="row"><span class="t">${esc(e.uname)} / ${esc(e.cname)} / ${esc(e.title)} ${e.status === 'draft' ? '<small class="draft">DRAFT</small>' : ''}</span><button class="btn" data-a="ee" data-id="${e.id}">EDIT</button><button class="btn dng" data-a="de" data-id="${e.id}">DELETE</button></div>`).join('') || '<p class="empty">No entries yet.</p>'}</div>`; }
};
const addCat = u => isW() ? `<div class="acts"><button class="btn pri" data-addcat data-u="${u.id}">${ic('plus')}ADD CATEGORY</button></div>` : '';
const addBtn = (u, c) => isW() ? `<button class="btn pri" data-add data-u="${u}" data-c="${c}">${ic('plus')}ADD ENTRY</button>` : '';
const emptyState = (u, c) => `<div class="panel empty-state"><h2>NO ENTRIES YET</h2><p>This archive is currently empty.</p>${addBtn(u, c)}</div>`;
const eCard = (e, th) => `<a class="card" data-theme="${esc(th)}" href="#/u/${esc(e.uslug)}/${esc(e.cslug)}/${esc(e.slug)}">${e.image ? `<img class="th" src="${esc(e.image)}" alt="">` : ''}${ic(e.icon, 'ic')}<h3>${esc(e.title)}</h3><p>${esc(e.description)}</p><div class="meta"><span>↑ ${e.up}</span><span>↓ ${e.down}</span>${e.status === 'draft' ? '<span class="draft">DRAFT</span>' : ''}</div></a>`;
const votes = e => `<div class="votes" data-id="${e.id}"><button class="btn ${e.my_vote === 1 ? 'on' : ''}" data-v="1">↑ <span>${e.up}</span></button><button class="btn ${e.my_vote === -1 ? 'on' : ''}" data-v="-1">↓ <span>${e.down}</span></button></div>`;

// ---- router ----
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent); document.body.dataset.theme = 'home';
  let name = 'home', args = parts;
  if (parts[0] === 'u') { name = ['universe', 'category', 'entry'][parts.length - 2] || 'home'; args = parts.slice(1); }
  else if (parts[0]) { name = parts[0]; args = parts.slice(1); if (name === 'search') args = [new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '']; }
  const app = $('#app'); app.innerHTML = '<p class="loading">Loading…</p>';
  try { app.innerHTML = await (pages[name] || pages.home)(...args); } catch (e) { app.innerHTML = `${crumbs([])}<h1>Nothing here</h1><p class="err">${esc(e.message)}</p><a class="btn" href="#/">Back to the archive</a>`; }
  app.style.animation = 'none'; app.offsetHeight; app.style.animation = ''; bind(name); paint(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', route);

function bind(name) {
  const A = $('#app');
  if (name === 'login') {
    for (const [id, url] of [['#lf', '/login'], ['#rf', '/register']]) $(id).addEventListener('submit', async ev => { ev.preventDefault(); const f = ev.target;
      try { const r = await api(url, { method: 'POST', body: Object.fromEntries(new FormData(f)) }); S.me = r.user; await loadUni(); nav(); location.hash = '#/profile/' + r.user.username; toast('Welcome, ' + r.user.display_name + '.'); }
      catch (e) { f.querySelector('.err').textContent = e.message; } }); }
  if (name === 'search') { const q = $('#q'), res = $('#res'); let t;
    const go = async () => { if (q.value.trim().length < 2) { res.innerHTML = '<p class="empty">Type at least 2 letters.</p>'; return; }
      try { const { results } = await api('/search?q=' + encodeURIComponent(q.value)); res.innerHTML = results.map(r => `<a class="result" href="${esc(r.href)}">${ic(r.icon, 'ic')}<div><b>${esc(r.title)}</b><small>${esc(r.path)} · ${r.type}</small></div></a>`).join('') || '<p class="empty">No matches.</p>'; paint(); } catch (e) { res.innerHTML = `<p class="err">${esc(e.message)}</p>`; } };
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(go, 180); }); if (q.value) go(); }
  A.querySelector('.votes')?.addEventListener('click', async ev => { const box = ev.currentTarget, b = ev.target.closest('[data-v]'); if (!b) return; if (!S.me) { toast('Log in to vote.'); location.hash = '#/login'; return; }
    try { const r = await api(`/entries/${box.dataset.id}/vote`, { method: 'POST', body: { vote: +b.dataset.v } }); const [u, d] = box.querySelectorAll('.btn');
      u.querySelector('span').textContent = r.up; d.querySelector('span').textContent = r.down; u.classList.toggle('on', r.my_vote === 1); d.classList.toggle('on', r.my_vote === -1); } catch (e) { toast(e.message); } });
  A.querySelectorAll('[data-add]').forEach(b => b.onclick = () => form('ae', null, { universe_id: +b.dataset.u, category_id: +b.dataset.c }));
  A.querySelectorAll('[data-addcat]').forEach(b => b.onclick = () => form('ac', null, { universe_id: +b.dataset.u }));
  $('#edp')?.addEventListener('click', profileForm);
  if (name === 'writer') A.addEventListener('click', async ev => { const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, id = +b.dataset.id;
    if (a[0] === 'd') { if (!confirm('Delete this permanently? Anything inside it is deleted too.')) return; const k = { u: 'universes', c: 'categories', e: 'entries' }[a[1]];
      try { await api(`/${k}/${id}`, { method: 'DELETE' }); await loadUni(); toast('Deleted.'); route(); } catch (e) { toast(e.message); } }
    else form(a, id); }); }

// ---- modals ----
function modal(html) { const r = $('#modal-root'); r.innerHTML = `<div class="bg"><div class="modal">${html}</div></div>`; r.querySelector('.bg').addEventListener('mousedown', e => { if (e.target.classList.contains('bg')) closeM(); }); r.querySelector('[data-x]')?.addEventListener('click', closeM); paint(); return r; }
const closeM = () => $('#modal-root').innerHTML = '';
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}" ${v == sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const iconOpts = sel => opts(ICONS.map(i => [i, i]), sel);
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function profileForm() { const r = modal(`<h2>Edit profile</h2><form id="pf"><label>Display name</label><input name="display_name" maxlength="40" value="${esc(S.me.display_name)}"><label>Bio</label><textarea name="bio" rows="4" maxlength="500">${esc(S.me.bio)}</textarea><label>Profile picture (PNG, JPG, WEBP, GIF - max 3 MB)</label><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif"><div class="err"></div><div class="btns"><button type="button" class="btn" data-x>CANCEL</button><button class="btn pri">SAVE</button></div></form>`);
  $('#pf').addEventListener('submit', async ev => { ev.preventDefault(); const fd = new FormData(ev.target); if (!fd.get('avatar').size) fd.delete('avatar');
    try { S.me = (await api('/me', { method: 'PUT', body: fd })).user; closeM(); nav(); route(); toast('Profile saved.'); } catch (e) { ev.target.querySelector('.err').textContent = e.message; } }); }

async function form(a, id, pre) { // a: au/ac/ae (add) or eu/ec/ee (edit)
  const kind = { u: 'universes', c: 'categories', e: 'entries' }[a[1]], edit = a[0] === 'e'; let d = pre ? { ...pre } : {}, entries = [];
  if (edit && kind === 'entries') { entries = (await api('/entries')).entries; const x = entries.find(e => e.id === id); const full = await api(`/e/${x.uslug}/${x.cslug}/${x.slug}`); d = full.entry; const cat = S.uni.flatMap(u => u.categories.map(c => ({ ...c, u }))).find(c => c.slug === x.cslug && c.u.slug === x.uslug); d.universe_id = cat.u.id; d.category_id = cat.id; }
  else if (edit) d = kind === 'universes' ? S.uni.find(u => u.id === id) : S.uni.flatMap(u => u.categories).find(c => c.id === id);
  const uni = S.uni.map(u => [u.id, u.name]), selU = d.universe_id || S.uni[0]?.id;
  const f = { universes: `<label>Universe name</label><input name="name" required value="${esc(d.name)}"><label>Slug (used in the web address)</label><input name="slug" required value="${esc(d.slug)}"><label>Description</label><input name="description" value="${esc(d.description)}"><label>Long description (Markdown)</label><textarea name="content" rows="5">${esc(d.content)}</textarea><label>Icon</label><select name="icon">${iconOpts(d.icon || 'globe')}</select><label>Theme</label><select name="theme">${opts(THEMES, d.theme)}</select>${imgField('image', d.image, 'Banner image')}`,
    categories: `<label>Universe</label><select name="universe_id">${opts(uni, selU)}</select><label>Category name</label><input name="name" required value="${esc(d.name)}"><label>Slug</label><input name="slug" value="${esc(d.slug)}"><label>Description</label><input name="description" value="${esc(d.description)}"><label>Icon</label><select name="icon">${iconOpts(d.icon || 'folder')}</select>`,
    entries: `<label>Universe</label><select id="su">${opts(uni, selU)}</select><label>Category</label><select name="category_id" id="sc"></select><label>Title</label><input name="title" required value="${esc(d.title)}"><label>Slug</label><input name="slug" required value="${esc(d.slug)}"><label>Short description</label><input name="description" value="${esc(d.description)}">
      <label>Main content (Markdown)</label><div class="tb">${[['# ', 'H', 'H1'], ['**', 'B', 'Bold'], ['*', 'I', 'Italic'], ['- ', '•', 'List'], ['> ', '❝', 'Quote'], ['[', '🔗', 'Link'], ['---', '—', 'Separator']].map(([m, l, t]) => `<button type="button" class="btn" data-m="${m}" title="${t}">${l}</button>`).join('')}<button type="button" class="btn" id="im">${ic('upload')}Image</button><input type="file" id="imf" hidden accept="image/*"></div>
      <div class="split two"><textarea name="content" id="ct" rows="14">${esc(d.content)}</textarea><div class="preview prose" id="pv"></div></div>
      <label>Icon</label><select name="icon">${iconOpts(d.icon || 'file-text')}</select>${imgField('image', d.image, 'Card image (optional)')}${imgField('banner', d.banner, 'Banner image (optional)')}<label>Status</label><select name="status">${opts([['published', 'Published'], ['draft', 'Draft (only you can see it)']], d.status)}</select>` }[kind];
  const r = modal(`<h2>${edit ? 'Edit' : 'Add'} ${{ universes: 'universe', categories: 'category', entries: 'entry' }[kind]}</h2><form id="wf">${f}<div class="err"></div><div class="btns"><button type="button" class="btn" data-x>CANCEL</button><button class="btn pri">${edit ? 'SAVE' : 'CREATE'}</button></div></form>`);
  const F = $('#wf'); if (!edit && F.slug && F.name) F.name.addEventListener('input', () => { if (!F.slug.dataset.t) F.slug.value = slugify(F.name.value); }), F.slug.addEventListener('input', () => F.slug.dataset.t = 1);
  if (!edit && F.title) F.title.addEventListener('input', () => { if (!F.slug.dataset.t) F.slug.value = slugify(F.title.value); }), F.slug.addEventListener('input', () => F.slug.dataset.t = 1);
  if (kind === 'entries') { const fill = () => { const u = S.uni.find(x => x.id == $('#su').value); $('#sc').innerHTML = opts((u?.categories || []).map(c => [c.id, c.name]), d.category_id); }; $('#su').onchange = () => { d.category_id = null; fill(); }; fill();
    const ct = $('#ct'), pv = () => $('#pv').innerHTML = md(ct.value); ct.addEventListener('input', pv); pv();
    r.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = b.dataset.m, s = ct.selectionStart, e = ct.selectionEnd, sel = ct.value.slice(s, e) || 'text'; let ins;
      if (m === '---') ins = '\n\n---\n\n'; else if (m === '[') ins = `[${sel}](https://)`; else if ('**' === m || m === '*') ins = m + sel + m; else ins = m + sel; ct.setRangeText(ins, s, e, 'end'); ct.focus(); pv(); });
    $('#im').onclick = () => $('#imf').click(); $('#imf').onchange = async ev => { try { const fd = new FormData(); fd.append('image', ev.target.files[0]); const { url } = await api('/upload', { method: 'POST', body: fd }); ct.setRangeText(`\n![Caption](${url})\n`, ct.selectionStart, ct.selectionEnd, 'end'); pv(); } catch (e) { F.querySelector('.err').textContent = e.message; } }; }
  r.querySelectorAll('input[type=file][data-img]').forEach(inp => inp.onchange = async () => { try { const fd = new FormData(); fd.append('image', inp.files[0]); const { url } = await api('/upload', { method: 'POST', body: fd }); F[inp.dataset.img].value = url; inp.nextElementSibling.textContent = 'Uploaded ✓'; } catch (e) { F.querySelector('.err').textContent = e.message; } });
  F.addEventListener('submit', async ev => { ev.preventDefault(); const body = Object.fromEntries([...new FormData(F)].filter(([k, v]) => typeof v === 'string'));
    try { await api(`/${kind}${edit ? '/' + id : ''}`, { method: edit ? 'PUT' : 'POST', body }); await loadUni(); closeM(); toast(edit ? 'Saved.' : 'Created.'); (pre || location.hash === '#/writer') ? route() : location.hash = '#/writer'; }
    catch (e) { F.querySelector('.err').textContent = e.message; } }); }
const imgField = (n, v, l) => `<label>${l}</label><input type="file" data-img="${n}" accept="image/png,image/jpeg,image/webp,image/gif"><small class="ui">${v ? 'Current image kept unless replaced.' : ''}</small><input type="hidden" name="${n}" value="${esc(v || '')}">`;

(async () => { try { S.me = (await api('/me')).user; await loadUni(); } catch (e) { $('#app').innerHTML = `<p class="err">${esc(e.message)}</p>`; } nav(); route(); })();

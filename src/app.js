// Piylove Movie Schedule: filter, tab, dan hitung mundur di browser.
(function () {
  'use strict';

  var TZ = 'Asia/Jakarta';
  var RECENT_DAYS = 30;

  function todayIso() {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var get = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
    return get('year') + '-' + get('month') + '-' + get('day');
  }
  function addDays(iso, n) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
  }
  function diff(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }
  function relText(date, precision, today) {
    if (precision === 'month') return 'Tanggal menyusul';
    var d = diff(today, date);
    if (d === 0) return 'Hari ini';
    if (d === 1) return 'Besok';
    if (d === -1) return 'Kemarin';
    return d > 1 ? d + ' hari lagi' : (-d) + ' hari lalu';
  }

  var today = todayIso();

  // Label "x hari lagi" selalu dihitung ulang dari tanggal hari ini.
  document.querySelectorAll('[data-date]').forEach(function (el) {
    var rel = el.querySelector('[data-rel]');
    if (!rel) return;
    var d = el.getAttribute('data-date');
    var precision = el.getAttribute('data-precision');
    rel.textContent = relText(d, precision, today);
    var n = diff(today, d);
    if (precision !== 'month' && n >= 0 && n <= 3) rel.setAttribute('data-soon', '');
    if (precision !== 'month' && n === 0) el.setAttribute('data-is-today', '');
  });

  var schedule = document.querySelector('[data-schedule]');
  var controls = document.querySelector('.controls');
  if (!schedule || !controls) return;

  function setControlsHeight() {
    document.documentElement.style.setProperty('--controls-h', controls.offsetHeight + 'px');
  }
  setControlsHeight();
  window.addEventListener('resize', setControlsHeight);

  var groups = Array.prototype.slice.call(schedule.querySelectorAll('.day'));
  var emptyBox = schedule.querySelector('[data-empty]');
  var search = controls.querySelector('[data-search]');
  var state = { tab: 'akan', p: '', k: '', q: '' };

  // baca filter dari alamat (?p=netflix&k=drakor) supaya bisa dibagikan
  var params = new URLSearchParams(location.search);
  ['tab', 'p', 'k', 'q'].forEach(function (key) { if (params.get(key)) state[key] = params.get(key); });
  if (state.tab !== 'baru') state.tab = 'akan';

  function groupKind(g) {
    var sort = g.getAttribute('data-sort');
    if (sort >= today) return 'akan';
    if (sort >= addDays(today, -RECENT_DAYS)) return 'baru';
    return 'lama';
  }

  function matches(entry) {
    if (state.p && (' ' + entry.getAttribute('data-platforms') + ' ').indexOf(' ' + state.p + ' ') < 0) return false;
    if (state.k && (' ' + entry.getAttribute('data-cats') + ' ').indexOf(' ' + state.k + ' ') < 0) return false;
    if (state.q) {
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      var hay = entry.getAttribute('data-q');
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    }
    return true;
  }

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.tab !== 'akan') p.set('tab', state.tab);
    if (state.p) p.set('p', state.p);
    if (state.k) p.set('k', state.k);
    if (state.q) p.set('q', state.q);
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function apply() {
    var counts = {};
    var visibleGroups = 0;
    groups.forEach(function (g) {
      var kind = groupKind(g);
      var shown = 0;
      g.querySelectorAll('.entry').forEach(function (e) {
        var ok = matches(e);
        e.hidden = !ok;
        if (ok) shown++;
      });
      if (kind === 'akan' && g.getAttribute('data-precision') === 'day') counts[g.getAttribute('data-date')] = shown;
      var visible = kind === state.tab && shown > 0;
      g.hidden = !visible;
      if (visible) visibleGroups++;
    });

    // urutan: akan tayang dari yang terdekat, baru tayang dari yang terbaru
    var ordered = groups.slice().sort(function (a, b) {
      var x = a.getAttribute('data-sort'), y = b.getAttribute('data-sort');
      return state.tab === 'baru' ? (x < y ? 1 : -1) : (x < y ? -1 : 1);
    });
    ordered.forEach(function (g) { schedule.insertBefore(g, emptyBox); });
    emptyBox.hidden = visibleGroups > 0;

    document.querySelectorAll('[data-wk]').forEach(function (a) {
      var n = counts[a.getAttribute('data-wk')] || 0;
      a.querySelector('[data-wk-count]').textContent = n + ' judul';
      if (n) a.removeAttribute('data-empty'); else a.setAttribute('data-empty', '');
    });

    controls.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === state.tab)); });
    controls.querySelectorAll('[data-p]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-p') === state.p)); });
    controls.querySelectorAll('[data-k]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === state.k)); });
    if (search && search.value !== state.q) search.value = state.q;
    syncUrl();
  }

  controls.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-tab')) state.tab = b.getAttribute('data-tab');
    else if (b.hasAttribute('data-p')) state.p = b.getAttribute('data-p');
    else if (b.hasAttribute('data-k')) state.k = b.getAttribute('data-k');
    else return;
    apply();
  });

  var t;
  if (search) {
    search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { state.q = search.value.trim(); apply(); }, 120);
    });
  }

  var reset = schedule.querySelector('[data-reset]');
  if (reset) reset.addEventListener('click', function () {
    state.p = ''; state.k = ''; state.q = '';
    apply();
  });

  // tautan ke tanggal tertentu (#tgl-2026-11-06): buka tab yang berisi tanggal itu
  function openHash() {
    if (!location.hash || location.hash.indexOf('#tgl-') !== 0) return;
    var g = document.getElementById(location.hash.slice(1));
    if (!g || !g.classList.contains('day')) return;
    var kind = groupKind(g);
    if (kind !== 'lama' && kind !== state.tab) { state.tab = kind; apply(); }
    if (g.hidden) { state.p = ''; state.k = ''; state.q = ''; apply(); }
    g.scrollIntoView();
  }
  window.addEventListener('hashchange', openHash);

  apply();
  openHash();
})();

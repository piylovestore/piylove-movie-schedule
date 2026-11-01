// Pembaca HTML kecil tanpa library luar. Cukup untuk HTML Wikipedia yang rapi.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', bull: '•',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', ccedil: 'ç', ouml: 'ö', uuml: 'ü', auml: 'ä', times: '×', thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '', zwnj: '',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    const v = NAMED[e.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// Tag yang otomatis menutup tag terbuka sebelumnya.
const AUTO_CLOSE = {
  td: { closes: ['td', 'th'], stopAt: ['tr', 'table'] },
  th: { closes: ['td', 'th'], stopAt: ['tr', 'table'] },
  tr: { closes: ['tr', 'td', 'th'], stopAt: ['table', 'tbody', 'thead', 'tfoot'] },
  tbody: { closes: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], stopAt: ['table'] },
  thead: { closes: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], stopAt: ['table'] },
  tfoot: { closes: ['tbody', 'thead', 'tfoot', 'tr', 'td', 'th'], stopAt: ['table'] },
  li: { closes: ['li'], stopAt: ['ul', 'ol'] },
  p: { closes: ['p'], stopAt: ['div', 'td', 'th', 'li', 'body'] },
};

export function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi;
  let last = 0;
  let m;
  const addText = (t) => { if (t) top().children.push({ text: decodeEntities(t), parent: top() }); };

  while ((m = re.exec(html))) {
    addText(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) {
      const name = m[1].toLowerCase();
      const idx = stack.map((n) => n.tag).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
      continue;
    }
    if (!m[2]) continue; // komentar / doctype
    const name = m[2].toLowerCase();
    const rule = AUTO_CLOSE[name];
    if (rule) {
      for (let i = stack.length - 1; i > 0; i--) {
        const t = stack[i].tag;
        if (rule.stopAt.includes(t)) break;
        if (rule.closes.includes(t)) { stack.length = i; break; }
      }
    }
    const node = { tag: name, attrs: parseAttrs(m[3] || ''), children: [], parent: top() };
    top().children.push(node);
    if (VOID.has(name) || m[4] === '/') continue;
    if (RAW.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, last);
      const stop = end < 0 ? html.length : end;
      node.children.push({ text: html.slice(last, stop), parent: node });
      const close = html.indexOf('>', stop);
      last = re.lastIndex = close < 0 ? html.length : close + 1;
      continue;
    }
    stack.push(node);
  }
  addText(html.slice(last));
  return root;
}

export const isEl = (n) => n && n.tag !== undefined;
export const hasClass = (n, c) => isEl(n) && (' ' + (n.attrs.class || '') + ' ').includes(' ' + c + ' ');
export const children = (n, tags) => n.children.filter((c) => isEl(c) && (!tags || tags.includes(c.tag)));

/** Semua elemen turunan dalam urutan dokumen yang lolos filter. */
export function findAll(n, pred, out = []) {
  for (const c of n.children) {
    if (!isEl(c)) continue;
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  }
  return out;
}

export function closest(n, pred) {
  let p = n.parent;
  while (p) { if (pred(p)) return p; p = p.parent; }
  return null;
}

/** Teks elemen; `skip` menentukan elemen yang diabaikan. */
export function textOf(n, skip) {
  if (!isEl(n)) return n.text || '';
  if (skip && skip(n)) return '';
  if (n.tag === 'br') return ' ';
  return n.children.map((c) => textOf(c, skip)).join('');
}

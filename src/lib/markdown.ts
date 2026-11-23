function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function inline(t: string) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) => {
      const raw = href.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (!/^https?:\/\//i.test(raw)) return label;
      return `<a href="${esc(raw)}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

/** Small markdown renderer. HTML is escaped before tags are added. */
export function md(src: string) {
  const blocks: string[] = [];
  src = src.replace(/```([\s\S]*?)```/g, (_, c: string) => {
    blocks.push(c.replace(/^\n/, ''));
    return `\u0000${blocks.length - 1}\u0000`;
  });
  const lines = src.split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^\u0000\d+\u0000$/.test(l.trim())) {
      out += `<pre><code>${esc(blocks[+l.trim().slice(1, -1)])}</code></pre>`;
      i++;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) {
      out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
      i++;
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out += `<blockquote>${q.map(inline).join('<br>')}</blockquote>`;
      continue;
    }
    if (/^\|/.test(l)) {
      let rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const parsed = rows
        .filter((r) => !/^\|[\s\-:|]+\|$/.test(r))
        .map((r) => r.replace(/^\||\|$/g, '').split('|'));
      out += `<table>${parsed
        .map((r, ri) => `<tr>${r.map((c) => (ri ? `<td>${inline(c.trim())}</td>` : `<th>${inline(c.trim())}</th>`)).join('')}</tr>`)
        .join('')}</table>`;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ol = /^\s*\d+\./.test(l);
      const it: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) it.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ''));
      out += `<${ol ? 'ol' : 'ul'}>${it
        .map((x) => {
          const c = x.match(/^\[( |x)\]\s(.*)/);
          return c
            ? `<li style="list-style:none;margin-left:-18px">${c[1] === 'x' ? '☑' : '☐'} ${inline(c[2])}</li>`
            : `<li>${inline(x)}</li>`;
        })
        .join('')}</${ol ? 'ol' : 'ul'}>`;
      continue;
    }
    if (/^---+$/.test(l.trim())) {
      out += '<hr style="border:none;border-top:1px solid var(--border)">';
      i++;
      continue;
    }
    if (l.trim()) out += `<p>${inline(l)}</p>`;
    i++;
  }
  return out;
}

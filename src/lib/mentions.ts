export type MentionMember = { id: string; name: string };

export function extractMentions(text: string, members: MentionMember[]) {
  if (text.includes('@全員')) return { all: true, ids: [] as string[] };
  const names = [...members].sort((a, b) => b.name.length - a.name.length);
  const ids = new Set<string>();
  const re = /@([^\s@]+(?:\s[^\s@、。！!?？]+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = m[1];
    const hit = names.find((x) => n.startsWith(x.name) || n.startsWith(x.name.replace(/\s/g, '')));
    if (hit) ids.add(hit.id);
  }
  return { all: false, ids: [...ids] };
}

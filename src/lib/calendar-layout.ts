export type TimeSpan = { start: number; end: number };

export type Placed<T> = T & { col: number; cols: number };

/** Assign side-by-side columns to overlapping intervals (week/day calendar). */
export function placeEvents<T extends TimeSpan>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const groups: T[][] = [];
  let current: T[] = [];
  let groupEnd = -Infinity;
  for (const item of sorted) {
    if (!current.length || item.start < groupEnd) {
      current.push(item);
      groupEnd = Math.max(groupEnd, item.end);
    } else {
      groups.push(current);
      current = [item];
      groupEnd = item.end;
    }
  }
  if (current.length) groups.push(current);

  const placed: Placed<T>[] = [];
  for (const group of groups) {
    const assigned: { item: T; col: number }[] = [];
    for (const item of group) {
      const used = new Set<number>();
      for (const prev of assigned) {
        if (prev.item.start < item.end && item.start < prev.item.end) used.add(prev.col);
      }
      let col = 0;
      while (used.has(col)) col++;
      assigned.push({ item, col });
    }
    const cols = Math.max(...assigned.map((a) => a.col)) + 1;
    for (const entry of assigned) placed.push({ ...entry.item, col: entry.col, cols });
  }
  return placed;
}

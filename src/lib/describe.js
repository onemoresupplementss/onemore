// Turns the plain-text Description from the sheet into parts the product page can lay out:
//   intro paragraphs, a "Per serving" block shown as number tiles, titled bullet lists and a
//   "How to use" note. Text that doesn't follow the pattern is still shown, as paragraphs.
//
// Sheet format (blank line between blocks, bullets start with •, - or *):
//   Short intro sentence.
//
//   Per serving (36 g):
//   • 25 g protein
//   • 5.5 g BCAAs
//
//   Why you'll like it:
//   • Mixes easily
//
//   How to use: Mix 1 scoop in water.

const BULLET = /^\s*[•\-*]\s*/;
const UNIT = '(?:mg|mcg|kcal|g|kg|ml|IU|billion CFU|million spores|calories|%)';

/** "25 g protein" -> { value: "25 g", label: "protein" }; returns null when there is no amount. */
export function splitAmount(item) {
  const s = item.trim();
  let m = s.match(new RegExp(`^(?:about|approx\\.?)\\s+([\\d.,]+\\s*${UNIT}?\\+?)\\s+(.+)$`, 'i'));
  if (m) return /^(kcal|calories)$/i.test(m[2]) ? { value: `~${m[1]} kcal`, label: 'energy' } : { value: `~${m[1]}`, label: m[2] };
  m = s.match(new RegExp(`^(?:over|more than)\\s+([\\d.,]+\\s*${UNIT}?)\\s+(.+)$`, 'i'));
  if (m) return { value: `${m[1]}+`, label: m[2] };
  m = s.match(new RegExp(`^(?:less than|under)\\s+([\\d.,]+\\s*${UNIT}?)\\s+(.+)$`, 'i'));
  if (m) return { value: `<${m[1]}`, label: m[2].replace(/^each of\s+/i, '') };
  m = s.match(/^(?:zero|no)\s+(added sugar|sugar)$/i);
  if (m) return { value: '0 g', label: m[1] };
  m = s.match(/^only\s+(.+)$/i);
  if (m) return splitAmount(m[1]);
  m = s.match(/^([\d.,]+)\s*(kcal|calories)$/i);
  if (m) return { value: `${m[1]} kcal`, label: 'energy' };
  m = s.match(new RegExp(`^([\\d.,]+\\s*${UNIT}?\\+?)\\s+(.+)$`, 'i'));
  if (m && /\d/.test(m[1])) return { value: m[1].replace(/\s+/g, ' '), label: m[2] };
  return null;
}

export function parseDescription(text) {
  const out = { intro: [], stats: null, sections: [], howTo: null };
  const blocks = String(text || '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const how = lines[0].match(/^(how to (?:use|prepare|take))\s*:\s*(.*)$/i);
    if (how) {
      out.howTo = { title: how[1].replace(/^./, (c) => c.toUpperCase()), text: [how[2], ...lines.slice(1)].filter(Boolean).join(' ') };
      continue;
    }
    const titled = lines.length > 1 && /:$/.test(lines[0]) && lines.slice(1).every((l) => BULLET.test(l));
    if (titled) {
      const title = lines[0].replace(/:$/, '');
      const items = lines.slice(1).map((l) => l.replace(BULLET, ''));
      if (!out.stats && /^per\s/i.test(title)) {
        const tiles = [];
        const extras = [];
        for (const it of items) {
          const a = splitAmount(it);
          if (a) tiles.push(a);
          else extras.push(it);
        }
        if (tiles.length) {
          out.stats = { title, tiles, extras };
          continue;
        }
      }
      out.sections.push({ title, items });
      continue;
    }
    out.intro.push(lines.join('\n'));
  }
  return out;
}

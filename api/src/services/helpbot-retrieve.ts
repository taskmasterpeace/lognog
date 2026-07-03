/**
 * Dependency-free lexical retrieval over the chunked user guide (guide-index.json).
 * BM25-lite (TF-IDF with length normalization) + a title/breadcrumb boost. Ported
 * from the ship-helpbot skill's retrieve.mjs so the help bot ranks guide sections
 * the same way the skill's CLI verifier does.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export interface GuideSection {
  id: string;
  title: string;
  level?: number;
  anchor: string;
  breadcrumb?: string[];
  text: string;
  tokens?: number;
}

export interface GuideHit {
  id: string;
  title: string;
  anchor: string;
  breadcrumb: string[];
  score: number;
  text: string;
}

const STOP = new Set(
  ('a an and are as at be by for from has have how i in into is it its of on or ' +
    'that the to was what when where which who why will with you your do does can could should ' +
    'this these those there here about my me we our').split(' ')
);

const tokenize = (s: string): string[] =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

const stem = (w: string): string =>
  w
    .replace(/ies$/, 'y')
    .replace(/(sses|ches|shes|xes)$/, (m) => m.slice(0, -2))
    .replace(/([^s])s$/, '$1')
    .replace(/ing$/, '')
    .replace(/ed$/, '');

const norm = (s: string): string[] => tokenize(s).map(stem);

export function rank(query: string, sections: GuideSection[], k = 4): GuideHit[] {
  const q = norm(query);
  if (!q.length || !sections.length) return [];
  const N = sections.length;
  const docs = sections.map((s) => {
    const body = norm(s.text || '');
    const title = norm([s.title, ...(s.breadcrumb || [])].join(' '));
    const tf = new Map<string, number>();
    for (const w of body) tf.set(w, (tf.get(w) || 0) + 1);
    return { s, tf, len: body.length || 1, titleSet: new Set(title) };
  });
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / N;
  const df = new Map<string, number>();
  for (const term of new Set(q)) {
    let c = 0;
    for (const d of docs) if (d.tf.has(term)) c++;
    df.set(term, c);
  }
  const k1 = 1.5;
  const b = 0.75;
  const scored = docs.map((d) => {
    let score = 0;
    for (const term of q) {
      const f = d.tf.get(term) || 0;
      if (f > 0) {
        const dfv = df.get(term) || 0;
        const idf = Math.log(1 + (N - dfv + 0.5) / (dfv + 0.5));
        score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / avgLen));
      }
      if (d.titleSet.has(term)) score += 2.4;
    }
    return { s: d.s, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k)
    .map(({ s, score }) => ({
      id: s.id,
      title: s.title,
      anchor: s.anchor,
      breadcrumb: s.breadcrumb || [],
      score: +score.toFixed(3),
      text: s.text,
    }));
}

let cachedIndex: { version?: string; sections: GuideSection[] } | null = null;

// Candidate locations: baked into the image at /app/guide-index.json (Docker),
// or the repo docs/ folder in dev.
function indexPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'guide-index.json'),
    path.join(process.cwd(), '..', 'docs', 'guide-index.json'),
    path.join(process.cwd(), 'docs', 'guide-index.json'),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

export function loadGuideIndex(): { version?: string; sections: GuideSection[] } {
  if (cachedIndex) return cachedIndex;
  const p = indexPath();
  if (!p) {
    cachedIndex = { sections: [] };
    return cachedIndex;
  }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    cachedIndex = { version: parsed.version, sections: parsed.sections || [] };
  } catch {
    cachedIndex = { sections: [] };
  }
  return cachedIndex;
}

// Allow tests / a post-deploy refresh to reset the cache.
export function resetGuideIndexCache(): void {
  cachedIndex = null;
}

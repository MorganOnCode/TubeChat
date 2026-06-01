/** Client-safe topic model — normalizer + lifecycle from the design's
    topic-card-template.md. No db imports. */

export const TCATS = ["All", "Events", "Government", "People", "Science", "History", "Phenomena"] as const;
export const TCAT_LIST = TCATS.filter((c) => c !== "All") as string[];
export const NEW_THRESHOLD = 40;

export interface RawTopic {
  n: string;
  slug?: string;
  cat?: string;
  blurb?: string;
  c?: number;
  v?: number;
  ch?: number;
  spark?: number[];
  pk?: number;
  hot?: boolean;
  status?: "new" | "indexing" | "live";
  discovered?: string;
}

export interface Topic {
  n: string;
  display: string;
  slug: string;
  cat: string;
  blurb?: string;
  c: number;
  v: number;
  ch: number;
  spark: number[] | null;
  pk: number | null;
  hot: boolean;
  status: "new" | "indexing" | "live";
  discovered?: string;
}

export function slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ACRONYMS = new Set([
  "ufo", "uap", "nhi", "aaro", "usa", "us", "cia", "fbi", "dod", "nasa", "tr3b", "ai", "us",
]);

/** Display casing for lowercase-stored tag names (title-case + known acronyms). */
export function prettyTopic(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return w.toUpperCase();
      const bare = lower.replace(/s$/, "");
      if (ACRONYMS.has(bare)) return bare.toUpperCase() + "s"; // ufos -> UFOs
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Normalize a (possibly sparse) raw topic into a renderable card model. */
export function makeTopic(raw: RawTopic): Topic {
  const n = raw.n || "Untitled topic";
  const slug = raw.slug || slugify(n);
  const cat = raw.cat && TCAT_LIST.includes(raw.cat) ? raw.cat : "Uncategorized";
  const c = Number.isFinite(raw.c) ? (raw.c as number) : 0;
  const v = Number.isFinite(raw.v) ? (raw.v as number) : 0;
  const ch = Number.isFinite(raw.ch) ? (raw.ch as number) : 0;

  const spark = Array.isArray(raw.spark) && raw.spark.length >= 2 ? raw.spark : null;

  let pk: number | null = null;
  if (spark) pk = Number.isFinite(raw.pk) ? (raw.pk as number) : spark.indexOf(Math.max(...spark));

  let hot: boolean;
  if (typeof raw.hot === "boolean") {
    hot = raw.hot;
  } else if (spark) {
    const h = spark.length >> 1;
    const a = spark.slice(0, h).reduce((x, y) => x + y, 0) / Math.max(1, h);
    const b = spark.slice(h).reduce((x, y) => x + y, 0) / Math.max(1, spark.length - h);
    hot = b > a * 1.6;
  } else {
    hot = false;
  }

  let status: "new" | "indexing" | "live";
  if (raw.status && ["new", "indexing", "live"].includes(raw.status)) status = raw.status;
  else status = !spark ? "indexing" : c < NEW_THRESHOLD ? "new" : "live";
  if (status !== "live") hot = false;

  return { n, display: prettyTopic(n), slug, cat, blurb: raw.blurb, c, v, ch, spark, pk, hot, status, discovered: raw.discovered };
}

const CAT_RULES: [string, RegExp][] = [
  ["Government", /(disclosure|congress|aaro|hearing|senate|pentagon|government|legislation|policy|schumer|amendment|classif)/i],
  ["People", /(grusch|elizondo|lazar|coulthart|puthoff|fravor|whistleblow|witness|pilot|experiencer|skeptic)/i],
  ["Events", /(tic tac|nimitz|crash|retrieval|phoenix lights|drone|jellyfish|incident|wreck)/i],
  ["Science", /(biolog|physics|reverse engineer|sensor|radar|propulsion|material|technolog|consciousness|remote viewing|warp)/i],
  ["History", /(roswell|ancient|history|1947|cold war|project|archive|vatican|nazi)/i],
  ["Phenomena", /(orb|abduction|encounter|skinwalker|paranormal|apparition|craft|sighting|nhi|telepath)/i],
];

/** Heuristic category for an auto-clustered tag (real clustering = Phase C). */
export function categorize(name: string): string {
  for (const [cat, re] of CAT_RULES) if (re.test(name)) return cat;
  return "Uncategorized";
}

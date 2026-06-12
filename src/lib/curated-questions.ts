/**
 * Questions that appear as clickable links on the site (the /digest "Dispatch"
 * stories, lead, answer-of-the-week, and cited sources). Pre-warming these into
 * query_cache means a click serves a synthesized answer for free + instantly —
 * zero LLM, zero quota. Keep this roughly in sync with the links on /digest.
 *
 * Run `npm run prewarm` after a deploy (and after a corpus re-embed) to refresh.
 */
export const CURATED_QUESTIONS: string[] = [
    // Lead + answer of the week
    "What do the Immaculate Constellation papers actually claim, and where do channels agree?",
    "How credible is the Wilson-Davis memo, really?",
    // The week in UAP (digest WEEK stories)
    "Pilots & sensors: what actually changed at the May hearings",
    "The new Bob Lazar interview — every claim cross-referenced",
    "Skinwalker Ranch: the orb incidents nobody had indexed yet",
    "A quiet week for ancient — only three channels posted",
    "NHI biologics: the testimony timeline, finally in one place",
    // Cited sources surfaced on the digest
    "Hal Puthoff on the Wilson-Davis notes & provenance",
    "Immaculate Constellation — what the document actually says",
    "Cross-examining the leak: a skeptic reads the same pages",
    // Evergreen archive questions (common entry points)
    "What is the strongest evidence for non-human intelligence discussed across the archive?",
    "What did the 2023 UAP congressional hearings actually establish?",
    "Who are the most cited whistleblowers and what do they claim?",
];

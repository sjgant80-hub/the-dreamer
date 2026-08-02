// dreamer.mjs — THE DREAM-CYCLE: make any local model sharper OVERNIGHT, without retraining.
//
// The wall the industry keeps hitting: "memory ≠ learning." A retrieval-augmented model just looks up raw
// episodic memory (yesterday's facts) — it never gets sharper, because nothing reorganizes. This is the bolt-on
// that makes memory ACT like learning: give the model a sleep/wake cycle. Overnight it REPLAYS the day, MERGES
// duplicates, forms TYPED connections, GENERALIZES across instances, RESOLVES contradictions by evidence, and
// PRUNES noise. Next morning, retrieval walks the reorganized graph — so the model answers questions it could not
// answer the night before. The WEIGHTS never change; the KNOWLEDGE STRUCTURE does. Gary's method, generalized.
//
// HONEST SCOPE: this is knowledge CONSOLIDATION, not gradient learning / fine-tuning — no parameters are touched.
// It does not invent facts from nothing; generalizations are recombinations of what was seen, kept as HYPOTHESES
// with provenance + confidence, and a specific counter-fact always overrides them (a penguin is a bird, but it
// still doesn't fly). It sharpens the model's CONTEXT, not its parameters. Model-agnostic bolt-on: feed it the
// day's memories, get back a consolidated store + retrieve/answer. Pure, deterministic, offline, zero-dep.
// Built on the-kg (typed edges) + seedmind (which dreams for ONE organism; this generalizes it for ANY model).

// ── relation vocabulary ──
const TRANSITIVE = new Set(['isa', 'partof', 'related']);       // closure predicates
const FUNCTIONAL = new Set(['is', 'color', 'location', 'status']); // one value per subject → contradictions resolve
const GENERALIZABLE = new Set(['can', 'eats', 'has', 'lives']);  // shared across a class → a rule for the class
const NEG = { can: 'cannot', eats: 'noteats', has: 'nothas', lives: 'notlives' };   // explicit negatives override rules
const key = (s, p, o) => `${s}${p}${o}`;

// ── an empty consolidated store ──
export function emptyStore() {
  return { facts: new Map(), subjects: new Map(), edges: [], day: 0, log: [] };
}

// normalize one raw memory into a fact-ish shape (fuzz-safe: bad input → a harmless text-only episode)
function norm(ep, day) {
  const t = x => (x == null ? '' : String(x)).trim().toLowerCase();
  const s = t(ep && ep.s), p = t(ep && ep.p), o = t(ep && ep.o);
  const conf = Number.isFinite(+((ep || {}).conf)) ? Math.max(0, +ep.conf) : 1;
  return { s, p, o, conf, day, text: (ep && ep.text) ? String(ep.text) : (s && p ? `${s} ${p} ${o}` : ''), triple: !!(s && p && o) };
}

// ── INGEST a day's raw episodes into the store as episodic facts (this is the "awake" write path) ──
export function ingest(store, episodes = [], day = store.day + 1) {
  store.day = day;
  const eps = (Array.isArray(episodes) ? episodes : []).map(e => norm(e, day));
  store._today = eps;                                     // remember the day for replay/raw-baseline
  if (!store._episodes) store._episodes = [];            // full ingestion-order log (the raw episodic baseline)
  for (const e of eps) {
    store._episodes.push(e);
    if (e.s) { if (!store.subjects.has(e.s)) store.subjects.set(e.s, { id: e.s, episodes: [], degree: 0 }); store.subjects.get(e.s).episodes.push(e); }
    if (!e.triple) continue;
    const k = key(e.s, e.p, e.o), f = store.facts.get(k);
    if (f) { f.evidence += 1; f.conf = Math.max(f.conf, e.conf); f.lastDay = day; }
    else store.facts.set(k, { s: e.s, p: e.p, o: e.o, conf: e.conf, evidence: 1, firstDay: day, lastDay: day, inferred: false, superseded: false, provenance: [] });
  }
  return store;
}

// transitive closure of a predicate from a subject (cycle-safe) — e.g. all classes a thing is-a, all the way up.
export function closure(store, subject, pred = 'isa') {
  const out = new Set(), stack = [subject], seen = new Set();
  while (stack.length) {
    const x = stack.pop(); if (seen.has(x)) continue; seen.add(x);
    for (const f of store.facts.values()) {
      if (f.superseded || f.p !== pred || f.s !== x) continue;
      if (!out.has(f.o)) { out.add(f.o); stack.push(f.o); }
    }
  }
  return out;
}

// ── THE DREAM CYCLE — one night of sleep ──
export function dreamCycle(store, { minInstances = 2 } = {}) {
  const report = { day: store.day, merged: 0, transitive: 0, generalized: 0, contradictions: 0, pruned: 0, edges: 0, rules: [] };

  // 1 · REPLAY + CONSOLIDATE — merge is already done in ingest (evidence counts). Count the compression achieved.
  report.merged = (store._today || []).filter(e => e.triple).length - [...store.facts.values()].filter(f => f.lastDay === store.day && !f.inferred).length;
  if (report.merged < 0) report.merged = 0;

  // 2 · RESOLVE CONTRADICTIONS — for FUNCTIONAL predicates a subject should hold ONE value; keep the best-evidenced,
  //     newest wins ties. The losers are marked superseded (kept for provenance, ignored at recall). Evidence over
  //     recency: 4× "sky is blue" beats a single late "sky is grey".
  const byFunc = new Map();
  for (const f of store.facts.values()) { if (f.inferred || !FUNCTIONAL.has(f.p)) continue; const g = `${f.s}${f.p}`; (byFunc.get(g) || byFunc.set(g, []).get(g)).push(f); }
  for (const group of byFunc.values()) {
    if (group.length < 2) continue;
    const score = f => f.conf * f.evidence;
    group.sort((a, b) => score(b) - score(a) || b.lastDay - a.lastDay);
    for (let i = 1; i < group.length; i++) if (!group[i].superseded) { group[i].superseded = true; report.contradictions++; }
  }

  // 3 · LINK (typed edges) + TRANSITIVE closure (REM bridge #1): materialize inferred transitive facts so tomorrow
  //     a→c is one hop. e.g. robin isa bird, bird isa animal ⟹ robin isa animal.
  for (const p of TRANSITIVE) {
    const subs = new Set([...store.facts.values()].filter(f => f.p === p && !f.superseded).map(f => f.s));
    for (const s of subs) for (const o of closure(store, s, p)) {
      const k = key(s, p, o);
      if (!store.facts.has(k)) { store.facts.set(k, { s, p, o, conf: 0.9, evidence: 1, firstDay: store.day, lastDay: store.day, inferred: true, superseded: false, provenance: [`${p}-closure`] }); report.transitive++; }
    }
  }

  // 4 · GENERALIZE (REM bridge #2 — the creative leap): if ≥minInstances instances of a class share (p,o) for a
  //     GENERALIZABLE predicate, and none of them explicitly deny it, emit (Class,p,o) as an INFERRED rule with
  //     provenance + confidence = supporters/known. This is knowledge that lived in NO single episode.
  const classes = new Set([...store.facts.values()].filter(f => f.p === 'isa' && !f.superseded).map(f => f.o));
  const instancesOf = C => [...store.subjects.keys()].filter(s => closure(store, s, 'isa').has(C));
  const has = (s, p, o) => { const f = store.facts.get(key(s, p, o)); return f && !f.superseded; };
  for (const C of classes) {
    const inst = instancesOf(C);
    const claims = new Map();   // `${p}|${o}` -> {p,o,support:[],deny:[]}
    for (const s of inst) for (const f of store.facts.values()) {
      if (f.superseded || f.inferred || f.s !== s || !GENERALIZABLE.has(f.p)) continue;
      const g = `${f.p}${f.o}`, rec = claims.get(g) || claims.set(g, { p: f.p, o: f.o, support: new Set(), deny: new Set() }).get(g);
      rec.support.add(s);
    }
    // record explicit denials (penguin cannot fly) so a rule never overrides a specific fact
    for (const s of inst) for (const f of store.facts.values()) {
      if (f.superseded || f.s !== s) continue;
      for (const [p, neg] of Object.entries(NEG)) if (f.p === neg) { const g = `${p}${f.o}`; const rec = claims.get(g); if (rec) rec.deny.add(s); }
    }
    for (const rec of claims.values()) {
      const support = [...rec.support].filter(s => !rec.deny.has(s));
      if (support.length < minInstances) continue;
      const k = key(C, rec.p, rec.o);
      if (store.facts.has(k)) continue;
      const conf = support.length / (support.length + rec.deny.size);
      store.facts.set(k, { s: C, p: rec.p, o: rec.o, conf, evidence: support.length, firstDay: store.day, lastDay: store.day, inferred: true, superseded: false, provenance: support });
      report.generalized++; report.rules.push(`${C} ${rec.p} ${rec.o}  (from ${support.length}: ${support.join(', ')})`);
    }
  }

  // 5 · degrees + typed edges (for the graph view) + PRUNE noise — subjects with no triples and low salience that
  //     never connected to anything are forgotten (forgetting is part of getting sharper).
  for (const s of store.subjects.values()) s.degree = 0;
  store.edges = [];
  for (const f of store.facts.values()) {
    if (f.superseded) continue;
    const type = f.p === 'isa' ? 'generalizes' : FUNCTIONAL.has(f.p) ? 'attribute' : 'relates';
    store.edges.push({ a: f.s, type, b: f.o, pred: f.p, inferred: f.inferred });
    if (store.subjects.has(f.s)) store.subjects.get(f.s).degree++;
    if (store.subjects.has(f.o)) store.subjects.get(f.o).degree++;
  }
  report.edges = store.edges.length;
  for (const [name, sub] of [...store.subjects]) {
    const triples = sub.episodes.some(e => e.triple);
    const salient = sub.episodes.some(e => e.conf >= 1.5);
    if (!triples && sub.degree === 0 && !salient) { store.subjects.delete(name); report.pruned++; }
  }

  store.log.push(report);
  return report;
}

// convenience: a full night = ingest today's episodes then dream.
export function sleep(store, episodes, opts) { ingest(store, episodes); return dreamCycle(store, opts); }

// ══ RECALL ══
// RAW (no dream): the naive episodic baseline — the single most-recent matching episode's value. No merge, no
// inheritance, no transitivity, no contradiction resolution. This is what "memory without learning" can do.
export function answerRaw(store, { s, p }) {
  const eps = store._episodes || [];
  let last = null;                             // naive recency — the last thing it heard wins (no consolidation)
  for (const e of eps) if (e.triple && e.s === s && e.p === p) last = e.o;
  return last;
}

// DREAM: recall over the consolidated graph — explicit facts, then inherited generalizations (unless an explicit
// negative or specific fact overrides), with transitive closure. This is memory acting like learning.
export function answerDream(store, { s, p }) {
  // explicit, non-superseded facts win first
  const explicit = [...store.facts.values()].filter(f => f.s === s && f.p === p && !f.superseded && !f.inferred);
  if (explicit.length) { explicit.sort((a, b) => (b.conf * b.evidence) - (a.conf * a.evidence)); return explicit[0].o; }
  // functional: allow a resolved/ inferred value
  const anyExplicitResolved = [...store.facts.values()].filter(f => f.s === s && f.p === p && !f.inferred);
  if (anyExplicitResolved.length) { anyExplicitResolved.sort((a, b) => (b.conf * b.evidence) - (a.conf * a.evidence) || b.lastDay - a.lastDay); return anyExplicitResolved[0].o; }
  // inherit from classes via isa-closure, but NEVER over a specific negative (penguin cannot fly)
  if (GENERALIZABLE.has(p)) {
    const neg = NEG[p];
    for (const C of closure(store, s, 'isa')) {
      for (const f of store.facts.values()) {
        if (f.s !== C || f.p !== p || f.superseded) continue;
        if (neg && store.facts.has(key(s, neg, f.o))) continue;    // the instance overrides the class rule
        return f.o;
      }
    }
  }
  return null;
}

// all values (for multi-valued predicates like 'can') under the dream store, honoring overrides.
export function answerAll(store, { s, p }) {
  const out = new Set();
  for (const f of store.facts.values()) if (f.s === s && f.p === p && !f.superseded && !f.inferred) out.add(f.o);
  if (GENERALIZABLE.has(p)) { const neg = NEG[p];
    for (const C of closure(store, s, 'isa')) for (const f of store.facts.values())
      if (f.s === C && f.p === p && !f.superseded && !(neg && store.facts.has(key(s, neg, f.o)))) out.add(f.o);
  }
  // remove anything explicitly negated for this subject
  if (NEG[p]) for (const f of store.facts.values()) if (f.s === s && f.p === NEG[p] && !f.superseded) out.delete(f.o);
  return [...out];
}

// score a labelled query set: returns {correct,total,hits[]} for a given answer fn.
export function score(store, queries, fn) {
  let correct = 0; const hits = [];
  for (const q of queries) {
    let got, ok;
    if (q.all) { got = fn(store, q).sort(); ok = JSON.stringify(got) === JSON.stringify([...q.expect].sort()); }
    else { got = fn(store, q); ok = got === q.expect; }
    if (ok) correct++; hits.push({ q, got, ok });
  }
  return { correct, total: queries.length, hits };
}

export default { emptyStore, ingest, dreamCycle, sleep, closure, answerRaw, answerDream, answerAll, score };

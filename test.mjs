// test.mjs — PROOF-OF-PLAY for THE DREAMER. Zero tokens. The claim under test is the industry's wall: "memory ≠
// learning." We MEASURE it: feed a model the same day of raw memories, and show that AFTER one night's dream-cycle
// — with NO retraining, NO weight change — it answers next-morning questions it could NOT answer the night before
// (generalization, transitivity, evidence-over-recency). Same information in, accuracy UP. That is memory acting
// like learning. Plus the honesty guard: an overnight generalization NEVER overrides a specific counter-fact.
import { readFileSync } from 'node:fs';
import { emptyStore, ingest, dreamCycle, sleep, closure, answerRaw, answerDream, answerAll, score } from './dreamer.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

// ── ONE DAY of a model's raw episodic memory (messy on purpose) ──
const DAY1 = [
  // evidence vs recency: it hears "sky is blue" four times, then a single late noisy "sky is grey"
  { s: 'sky', p: 'is', o: 'blue' }, { s: 'sky', p: 'is', o: 'blue' }, { s: 'sky', p: 'is', o: 'blue' }, { s: 'sky', p: 'is', o: 'blue' },
  { s: 'sky', p: 'is', o: 'grey' },
  // three birds that fly — a rule waiting to be found (never stated as a rule)
  { s: 'sparrow', p: 'isa', o: 'bird' }, { s: 'sparrow', p: 'can', o: 'fly' },
  { s: 'eagle', p: 'isa', o: 'bird' }, { s: 'eagle', p: 'can', o: 'fly' },
  { s: 'hawk', p: 'isa', o: 'bird' }, { s: 'hawk', p: 'can', o: 'fly' },
  // a bird it never saw fly, and a class hierarchy for transitivity
  { s: 'robin', p: 'isa', o: 'bird' }, { s: 'bird', p: 'isa', o: 'animal' },
  // the honesty case: a bird that explicitly does NOT fly
  { s: 'penguin', p: 'isa', o: 'bird' }, { s: 'penguin', p: 'cannot', o: 'fly' }, { s: 'penguin', p: 'can', o: 'swim' },
  // pure noise that should be forgotten, not clutter tomorrow's recall
  { text: 'the coffee was lukewarm' }, { text: 'standup ran long' }, { s: 'random42', p: '', o: '' },
];

// the next-morning quiz (labelled). Some of these the raw store CANNOT answer.
const QUIZ = [
  { s: 'robin', p: 'can', expect: 'fly' },     // GENERALIZATION: robin is a bird, birds fly → fly (never stated)
  { s: 'sky', p: 'is', expect: 'blue' },        // EVIDENCE beats recency: blue×4 over a late "grey"
  { s: 'hawk', p: 'can', expect: 'fly' },       // sanity — explicit, both should get it
  { s: 'penguin', p: 'can', expect: 'swim' },   // honesty — the specific fact, not the class rule
];

console.log('\n=== §1 · THE WALL — raw episodic memory does NOT get sharper (memory ≠ learning) ===');
const raw = emptyStore(); ingest(raw, DAY1);   // ingested but NEVER dreamed
{
  const r = score(raw, QUIZ, answerRaw);
  ok(r.correct < QUIZ.length, `un-dreamed, the model misses questions it has the pieces for (${r.correct}/${r.total} correct)`);
  ok(answerRaw(raw, { s: 'robin', p: 'can' }) === null, 'it cannot generalize: "can a robin fly?" → no answer (it never saw a robin fly)');
  ok(answerRaw(raw, { s: 'sky', p: 'is' }) === 'grey', 'it trusts the last thing it heard: "sky is…" → "grey" (the noise), not the evidence');
  const rawJoined = [...raw.facts.values()].some(f => f.s === 'robin' && f.p === 'isa' && f.o === 'animal');
  ok(!rawJoined, 'it holds "robin isa bird" and "bird isa animal" but never JOINED them — no materialized "robin is an animal"');
}

console.log('\n=== §2 · ONE NIGHT — the dream-cycle reorganizes the day (no weights touched) ===');
const mind = emptyStore();
const rep = sleep(mind, DAY1);   // ingest + dream
{
  ok(rep.generalized >= 1 && rep.rules.some(r => r.startsWith('bird can fly')), `it FORMED a rule that lived in no single memory: ${rep.rules.find(r => r.startsWith('bird can fly')) || '(none)'}`);
  ok(rep.transitive >= 1, `it wired transitive links (${rep.transitive}) — e.g. robin → bird → animal`);
  ok(rep.contradictions >= 1, `it resolved ${rep.contradictions} contradiction(s) by evidence (blue over grey)`);
  ok(rep.pruned >= 1, `it forgot ${rep.pruned} piece(s) of noise`);
}

console.log('\n=== §3 · THE FLAG — next morning it is measurably SHARPER on the same information ===');
{
  const before = score(mind, QUIZ, answerRaw).correct;   // what raw recall would still give on this store
  const after = score(mind, QUIZ, answerDream);
  ok(after.correct > before, `overnight accuracy jumps with NO retraining: ${before}/${QUIZ.length} → ${after.correct}/${QUIZ.length}`);
  ok(after.correct === QUIZ.length, `it now answers ALL of them (${after.correct}/${after.total})`);
  after.hits.forEach(h => ok(h.ok, `  · "${h.q.s} ${h.q.p}?" → "${h.got}"` + (h.ok ? '' : ` (expected "${h.q.expect}")`)));
  // the three it could only get by REORGANIZING, called out:
  ok(answerDream(mind, { s: 'robin', p: 'can' }) === 'fly', '  GENERALIZATION: "can a robin fly?" → fly (from the rule it built)');
  ok(answerDream(mind, { s: 'sky', p: 'is' }) === 'blue', '  EVIDENCE: "sky is…" → blue (the noise was outvoted)');
  const joined = [...mind.facts.values()].some(f => f.s === 'robin' && f.p === 'isa' && f.o === 'animal' && f.inferred);
  ok(joined && closure(mind, 'robin', 'isa').has('animal'), '  TRANSITIVITY: the night MATERIALIZED "robin is an animal" — now a one-hop fact');
}

console.log('\n=== §4 · HONESTY — a generalization NEVER overrides a specific counter-fact ===');
{
  const can = answerAll(mind, { s: 'penguin', p: 'can' });
  ok(can.includes('swim'), 'a penguin can still swim (its own fact survives)');
  ok(!can.includes('fly'), 'and it did NOT wrongly inherit "birds fly" — the penguin overrides the rule');
  // EXACT set, not just .includes: answerAll must return ['swim'] and nothing else (no cross-subject / non-'can' leakage)
  ok(can.slice().sort().join(',') === 'swim', `a penguin can EXACTLY [swim] — no bird's fly, no other predicate leaks in (got [${can.slice().sort().join(', ')}])`);
  const spCan = answerAll(mind, { s: 'sparrow', p: 'can' });
  ok(spCan.includes('fly'), 'while a sparrow, with no counter-fact, DOES get "fly" from the same rule');
  ok(spCan.slice().sort().join(',') === 'fly', `a sparrow can EXACTLY [fly] — the rule adds nothing spurious (got [${spCan.slice().sort().join(', ')}])`);
  // robin has NO explicit 'can' fact: its whole answer must come from inheriting the rule → exactly [fly]
  const rbCan = answerAll(mind, { s: 'robin', p: 'can' });
  ok(rbCan.slice().sort().join(',') === 'fly', `robin (no explicit 'can') answers EXACTLY [fly] purely by inheritance (got [${rbCan.slice().sort().join(', ')}])`);
  const flyRule = [...mind.facts.values()].find(f => f.s === 'bird' && f.o === 'fly' && f.inferred);
  // EXACT provenance: the rule is supported by the three birds SEEN to fly — not robin/penguin, and not any subclass rule
  ok(flyRule && flyRule.provenance.slice().sort().join(',') === 'eagle,hawk,sparrow' && flyRule.conf < 1,
     `the rule is a HYPOTHESIS supported by EXACTLY the seen fliers (${flyRule.provenance.slice().sort().join(', ')}) with confidence ${flyRule.conf.toFixed(2)}, not a certainty`);
}

console.log('\n=== §5 · MANY NIGHTS — it keeps improving and does not blow up ===');
{
  const DAY2 = [{ s: 'owl', p: 'isa', o: 'bird' }, { s: 'owl', p: 'can', o: 'fly' }, { s: 'robin', p: 'can', o: 'fly' }, { s: 'sky', p: 'is', o: 'blue' }];
  const acc1 = score(mind, QUIZ, answerDream).correct;
  const factsBefore = mind.facts.size;
  sleep(mind, DAY2);
  const acc2 = score(mind, QUIZ, answerDream).correct;
  ok(acc2 >= acc1, `accuracy is monotone across nights (${acc1} → ${acc2}, of ${QUIZ.length})`);
  ok(mind.facts.size < factsBefore * 3, `the store stays bounded — consolidation merges, it does not hoard (${factsBefore} → ${mind.facts.size} facts)`);
  ok(answerDream(mind, { s: 'owl', p: 'can' }) === 'fly', 'a new bird learned on night 2 also flies');
}

console.log('\n=== §6 · DETERMINISM + FUZZ + SOVEREIGN ===');
{
  const a = emptyStore(); sleep(a, DAY1); const b = emptyStore(); sleep(b, DAY1);
  const ser = s => JSON.stringify([...s.facts.keys()].sort());
  ok(ser(a) === ser(b), 'same day in → the exact same consolidated knowledge out (deterministic)');
  let threw = false;
  const garbage = [null, undefined, {}, { s: NaN, p: 5, o: {} }, { s: 'x'.repeat(9999) }, 42, 'nope', [{ s: 'a', p: 'isa', o: 'b' }, null]];
  for (const g of garbage) { try { const st = emptyStore(); ingest(st, Array.isArray(g) ? g : [g]); dreamCycle(st); answerDream(st, { s: 'a', p: 'can' }); answerRaw(st, { s: 'a', p: 'can' }); answerAll(st, { s: 'a', p: 'can' }); } catch (e) { threw = true; } }
  ok(!threw, 'garbage days / malformed memories never throw');
  const src = readFileSync(new URL('./dreamer.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const net = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'require(', 'node:http', 'node:net', 'node:dgram', 'import('].filter(t => src.includes(t));
  ok(net.length === 0, `the engine has NO network primitive — it dreams on your own machine (found: ${net.join(', ') || 'nothing'})`);
}

console.log('\n=== §7 · BOUNDARY HARDENING — pin every product decision on its exact edge (mutation-gate kills) ===');
{
  // ── report.merged is the compression number the night reports: today's triples minus the unique facts kept.
  const hm = emptyStore(); const hrep = sleep(hm, DAY1);
  ok(hrep.merged === 3, `compression count is exact: 16 triples in → 13 unique facts kept → merged = ${hrep.merged} (=3)`);
  // multi-night: merged must count ONLY today's kept facts (lastDay===day AND not inferred) — not every earlier explicit fact.
  const hm2 = emptyStore(); sleep(hm2, [{ s: 'a', p: 'isa', o: 'b' }]);
  const hrep2 = sleep(hm2, [{ s: 'c', p: 'isa', o: 'd' }, { s: 'c', p: 'isa', o: 'd' }, { s: 'c', p: 'isa', o: 'd' }]);
  ok(hrep2.merged === 2, `night-2 compression counts only that night's facts: 3 dup triples → 1 kept → merged = ${hrep2.merged} (=2), earlier facts excluded`);

  // ── ingest's default day is store.day + 1 (advances), observable on store.day.
  const hd = emptyStore(); ingest(hd, []); ingest(hd, []);
  ok(hd.day === 2, `ingest advances the clock: two default ingests → day ${hd.day} (=2)`);

  // ── closure(): exact transitive set over 'isa' only — never the start node, never a non-isa edge, never a garbage cycle.
  const hc = emptyStore();
  ingest(hc, [{ s: 'a', p: 'isa', o: 'b' }, { s: 'b', p: 'isa', o: 'c' }, { s: 'x', p: 'isa', o: 'a' }, { s: 'a', p: 'can', o: 'zzz' }]);
  ok([...closure(hc, 'a', 'isa')].sort().join(',') === 'b,c', `closure(a,isa) = EXACTLY {b,c} — not 'a', not 'x', not the 'can' edge 'zzz' (got {${[...closure(hc, 'a', 'isa')].sort().join(',')}})`);

  // ── typed edges: isa→'generalizes', functional→'attribute', everything else→'relates'.
  const isaE = mind.edges.find(e => e.pred === 'isa'), funcE = mind.edges.find(e => e.pred === 'is'), relE = mind.edges.find(e => e.pred === 'can');
  ok(isaE && isaE.type === 'generalizes', `an isa edge is typed 'generalizes' (got '${isaE && isaE.type}')`);
  ok(funcE && funcE.type === 'attribute', `a functional (is) edge is typed 'attribute' (got '${funcE && funcE.type}')`);
  ok(relE && relE.type === 'relates', `a plain (can) edge is typed 'relates' (got '${relE && relE.type}')`);

  // ── contradiction resolution is FUNCTIONAL-only: a subject may keep MANY values for a non-functional predicate.
  const hbat = emptyStore(); sleep(hbat, [{ s: 'bat', p: 'can', o: 'fly' }, { s: 'bat', p: 'can', o: 'screech' }]);
  ok(answerAll(hbat, { s: 'bat', p: 'can' }).sort().join(',') === 'fly,screech', `non-functional 'can' keeps BOTH values — no false contradiction (got [${answerAll(hbat, { s: 'bat', p: 'can' }).sort().join(', ')}])`);

  // ── evidence beats recency in the resolution sort, even when the newer fact is the loser (score, then lastDay — not the reverse).
  const hev = emptyStore();
  sleep(hev, [{ s: 'sky', p: 'is', o: 'blue' }, { s: 'sky', p: 'is', o: 'blue' }, { s: 'sky', p: 'is', o: 'blue' }, { s: 'sky', p: 'is', o: 'blue' }]);
  sleep(hev, [{ s: 'sky', p: 'is', o: 'red' }]);   // newer, but only 1 evidence
  ok(answerDream(hev, { s: 'sky', p: 'is' }) === 'blue', `evidence (blue×4) beats a NEWER low-evidence 'red' — recency does not win (got ${answerDream(hev, { s: 'sky', p: 'is' })})`);

  // ── generalization threshold sits EXACTLY at minInstances (default 2): two supporters is enough to form a rule.
  const hg = emptyStore();
  const hgr = sleep(hg, [{ s: 'p1', p: 'isa', o: 'cls' }, { s: 'p1', p: 'eats', o: 'seed' }, { s: 'p2', p: 'isa', o: 'cls' }, { s: 'p2', p: 'eats', o: 'seed' }]);
  ok(hgr.generalized >= 1 && answerDream(hg, { s: 'p1', p: 'eats' }) === 'seed', `EXACTLY two supporters forms the class rule (generalized ${hgr.generalized}, cls eats → ${answerDream(hg, { s: 'p1', p: 'eats' })})`);

  // ── a superclass rule is supported ONLY by concrete instances, never by a subclass's own inferred rule (no rule-on-rule inflation).
  const animalRule = [...mind.facts.values()].find(f => f.s === 'animal' && f.p === 'can' && f.o === 'fly' && f.inferred);
  ok(animalRule && animalRule.provenance.slice().sort().join(',') === 'eagle,hawk,sparrow',
     `'animal can fly' is supported by the concrete fliers only, NOT by 'bird can fly' (got [${animalRule && animalRule.provenance.slice().sort().join(', ')}])`);

  // ── salience threshold is inclusive at exactly 1.5: a text-only, unconnected episode with conf 1.5 is KEPT, not pruned.
  const hs = emptyStore(); ingest(hs, [{ s: 'vip', p: '', o: '', conf: 1.5, text: 'keep me' }]); dreamCycle(hs);
  ok(hs.subjects.has('vip'), 'a lone salient (conf===1.5) subject is kept — the >= threshold is inclusive');

  // ── pruning needs ALL THREE of: no triples AND degree 0 AND not salient. A connected (degree>0) subject survives; a subject with triples survives.
  const hp = emptyStore(); ingest(hp, [{ s: 'child', p: 'isa', o: 'parent' }, { s: 'parent', p: '', o: '', text: 'note' }]); dreamCycle(hp);
  ok(hp.subjects.has('parent'), 'a connected subject (no triples of its own but degree>0) is NOT pruned');
  ok(hp.subjects.has('child'), 'a subject with a triple is NOT pruned');

  // ── answerDream / answerAll must NOT leak another subject's value: robin inherits fly from the rule, never fish→swim (higher evidence, same predicate, ingested first).
  const hf = emptyStore();
  sleep(hf, [
    { s: 'fish', p: 'can', o: 'swim' }, { s: 'fish', p: 'can', o: 'swim' }, { s: 'fish', p: 'can', o: 'swim' }, { s: 'fish', p: 'can', o: 'swim' }, { s: 'fish', p: 'can', o: 'swim' },
    { s: 'sparrow', p: 'isa', o: 'bird' }, { s: 'sparrow', p: 'can', o: 'fly' },
    { s: 'eagle', p: 'isa', o: 'bird' }, { s: 'eagle', p: 'can', o: 'fly' },
    { s: 'robin', p: 'isa', o: 'bird' },
  ]);
  ok(answerDream(hf, { s: 'robin', p: 'can' }) === 'fly', `answerDream(robin,can) inherits 'fly' from the class rule, NOT fish's high-evidence 'swim' (got ${answerDream(hf, { s: 'robin', p: 'can' })})`);
  ok(answerAll(hf, { s: 'robin', p: 'can' }).sort().join(',') === 'fly', `answerAll(robin,can) = EXACTLY [fly], no cross-subject 'swim' (got [${answerAll(hf, { s: 'robin', p: 'can' }).sort().join(', ')}])`);

  // ── score() with .all queries compares the SORTED value set by equality — a correct multi-value answer scores as correct.
  const scAll = score(mind, [{ s: 'sparrow', p: 'can', all: true, expect: ['fly'] }], answerAll);
  ok(scAll.correct === 1, `score() grades an .all (multi-value) query by set-equality: sparrow can [fly] → ${scAll.correct}/1 correct`);
  const scAllBad = score(mind, [{ s: 'sparrow', p: 'can', all: true, expect: ['swim'] }], answerAll);
  ok(scAllBad.correct === 0, `score() rejects a wrong .all answer: sparrow can ≠ [swim] → ${scAllBad.correct}/1`);

  // ── norm()'s text field: a full triple with no supplied text renders "s p o"; an episode with a falsy subject renders "" (not a partial string).
  const ht = emptyStore(); ingest(ht, [{ s: 'a', p: 'isa', o: 'b' }, { s: '', p: 'x', o: 'y' }]);
  ok(ht._episodes.find(e => e.p === 'isa').text === 'a isa b', `a triple with no explicit text renders 's p o' → "${ht._episodes.find(e => e.p === 'isa').text}"`);
  ok(ht._episodes.find(e => e.p === 'x').text === '', `an episode with an empty subject renders empty text, not a partial "${ht._episodes.find(e => e.p === 'x').text}"`);
  // a triple requires ALL THREE of s, p, o — a truthy object alone must NOT make it a triple (else a bogus ('','x','y') fact is stored).
  ok(ht._episodes.find(e => e.p === 'x').triple === false, 'an episode with an empty subject is NOT a triple (needs s AND p AND o, not just o)');
  ok(![...ht.facts.values()].some(f => f.p === 'x'), 'and no fact is created from that non-triple episode');
}


console.log('\n=== §K · EVIDENCE-OVER-RECENCY holds even when every fact is superseded (kills a baselined bug) ===');
{
  // When ALL facts for (s,p) are superseded, answerDream falls to the functional-resolution branch — which must
  // STILL choose by evidence (the module's stated doctrine), not recency. The `|| → &&` mutant on that comparator
  // sorts by newest instead. Auditor-found: a real answerDream(sky,is) grey→blue flip, previously baselined away.
  const st = { facts: new Map(), day: 3 };
  st.facts.set('sky|is|grey', { s: 'sky', p: 'is', o: 'grey', conf: 1, evidence: 11, firstDay: 1, lastDay: 2, inferred: false, superseded: true, provenance: [] });
  st.facts.set('sky|is|blue', { s: 'sky', p: 'is', o: 'blue', conf: 1, evidence: 4, firstDay: 1, lastDay: 3, inferred: false, superseded: true, provenance: [] });
  ok(answerDream(st, { s: 'sky', p: 'is' }) === 'grey', 'all-superseded (s,p): the functional fallback answers by EVIDENCE (grey, ev 11) not recency (blue, day 3) — pins the (score || lastDay) tiebreak');
}

const done = fail === 0;
console.log('\n' + (done
  ? `=== ✅ MEMORY ACTS LIKE LEARNING — one night's reorganization, no retraining, ${score(mind, QUIZ, answerDream).correct}/${QUIZ.length} in the morning · ${pass}/${pass} · zero tokens ===`
  : `=== ❌ ${fail} FAILED / ${pass + fail} ===`));
process.exit(done ? 0 : 1);

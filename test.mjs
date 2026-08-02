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
  ok(answerAll(mind, { s: 'sparrow', p: 'can' }).includes('fly'), 'while a sparrow, with no counter-fact, DOES get "fly" from the same rule');
  const flyRule = [...mind.facts.values()].find(f => f.s === 'bird' && f.o === 'fly' && f.inferred);
  ok(flyRule && flyRule.provenance.length >= 2 && flyRule.conf < 1, `the rule is a HYPOTHESIS with provenance (${flyRule.provenance.join(', ')}) and confidence ${flyRule.conf.toFixed(2)}, not a certainty`);
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

const done = fail === 0;
console.log('\n' + (done
  ? `=== ✅ MEMORY ACTS LIKE LEARNING — one night's reorganization, no retraining, ${score(mind, QUIZ, answerDream).correct}/${QUIZ.length} in the morning · ${pass}/${pass} · zero tokens ===`
  : `=== ❌ ${fail} FAILED / ${pass + fail} ===`));
process.exit(done ? 0 : 1);

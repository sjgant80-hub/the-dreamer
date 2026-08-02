# the dreamer — make any model sharper *overnight*, without retraining

**▶ Live: https://sjgant80-hub.github.io/the-dreamer/**  (press **sleep**, then ask *"robin can ?"* — raw memory shrugs, the dreamed memory says **fly**)

The whole industry hits the same wall: **"memory ≠ learning."** A retrieval-augmented model just looks up raw
episodic memory — it never gets sharper, because nothing reorganizes. `the dreamer` is the bolt-on that changes
that: give any local model a **sleep/wake cycle**. Overnight it **replays** the day, **merges** duplicates, wires
**typed connections**, **generalizes** across instances, **resolves contradictions by evidence**, and **prunes**
noise. Next morning, retrieval walks the reorganized graph — so the model answers questions it *could not answer
the night before*. **The weights never change. The knowledge structure does.** Gary's method, generalized.

## The claim, measured (this is the wedge)

Feed the model one day of raw memories. Quiz it. Sleep. Quiz it again on the **same information**:

| question | raw memory (no sleep) | after the dream-cycle |
|---|---|---|
| can a **robin** fly? | *no answer* (never saw a robin fly) | **fly** — built the rule *"birds fly"* from 3 instances |
| the **sky** is…? | *grey* (the last, noisy thing it heard) | **blue** — evidence (4×) outvoted the noise |
| is a **robin** an animal? | holds the two links, never joined them | **yes** — materialized *robin → bird → animal* |
| can a **penguin** fly? | — | **no** — the specific fact overrides the rule |

**Overnight accuracy 2/4 → 4/4, no retraining.** That is memory acting like learning. Proven in `test.mjs §3`.

## Honest scope

- **Real:** it consolidates episodic → semantic — merge, typed edges, transitive closure, evidence-weighted
  contradiction resolution, class generalization, forgetting. Measurably lifts next-morning accuracy on the same
  data, deterministically. All local, no network (checkable in source).
- **NOT claimed:** this is **knowledge consolidation, not gradient learning / fine-tuning** — no parameters are
  touched. It doesn't invent facts: generalizations are recombinations of what was seen, kept as **hypotheses
  with provenance + confidence**, and a specific counter-fact **always** wins (a penguin is a bird, but it still
  doesn't fly — `§4` proves the rule never clobbers the exception). It sharpens the model's **context**, not its
  parameters.

## The bolt-on

Model-agnostic. Feed it any local model's day of memories as `{s, p, o}` triples (+ free text) — from Ollama,
a BYOK model, or your own store — and get back a consolidated store + `answerDream` / `answerAll`. The engine is
pure and deterministic; run the cycle nightly on your own machine and your local model is sharper each morning.

## Proven — `node test.mjs`, zero tokens, 27/27

`§1` the wall (raw memory misses what it has the pieces for) · `§2` one night reorganizes (rule formed,
transitive wired, contradiction resolved, noise pruned) · `§3` **the flag** — measurably sharper next morning,
same info, no retraining · `§4` **honesty** — a generalization never overrides a specific counter-fact; the rule
is a hypothesis with provenance · `§5` many nights (monotone + bounded, no hoarding) · `§6` deterministic +
fuzz-safe + no network primitive.

## Files

`dreamer.mjs` (the kernel — ingest, the dream-cycle, closure, `answerRaw` vs `answerDream`) · `test.mjs` (the
27/27 gate with the measurable benchmark) · `index.html` (the live *day → sleep → morning* demo: watch memory
reorganize, quiz raw-vs-dreamed side by side). Zero-dep, Node + browser, offline. Built on
[the-kg](https://sjgant80-hub.github.io/the-kg/) + [seedmind](https://sjgant80-hub.github.io/seedmind/).

```bash
node test.mjs                 # the proof
python -m http.server 8080    # then open http://localhost:8080 and press "sleep"
```

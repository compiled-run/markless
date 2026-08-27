# Crop's two size caps: the seed wall is about form, not about infinity

## What was asked

U640 closed the non-finite residual on the web side: a `shared()` seed of
`Number.POSITIVE_INFINITY` now reaches the served cell and every resume lane reads
it back as `Infinity`. Crop still carried the workaround U635 measured — the two
size caps seeded `undefined`, with `sizeCeiling` reading `undefined` as no limit —
so this unit was to re-measure, and drop the `undefined` branch if the rows stayed
green.

## What was measured

Baseline, untouched tree: `vp test --project ui packages/headless/components/src/crop`
is **58 passed (58)**.

With the caps seeded `Number.POSITIVE_INFINITY` in the `shared()` initializer, the
`undefined` branch dropped from `sizeCeiling`, the instance-state fields narrowed to
`number`, and the two props defaulting to `Number.POSITIVE_INFINITY`:
**8 failed | 50 passed (58)** — the same 8 U635 saw, still red after U640.

The failures are not cap failures. The whole per-instance seed falls back to the
`state()` defaults: `name` comes back `''`, a disabled crop reports `tabindex="0"`,
and the rectangle falls back to `0, 0, 40×40` instead of the `defaultValue`.

### The discriminating runs

Only the seed expression in the `shared()` initializer was varied; everything else
was held fixed.

| seed written as | value it denotes | rows |
| --- | --- | --- |
| `999` | finite | 58 passed |
| `1e400` | `Infinity` | **58 passed** |
| `Number.POSITIVE_INFINITY` | `Infinity` | 8 failed |
| `Number.MAX_SAFE_INTEGER` | **finite** | 8 failed |
| `Infinity` | `Infinity` | 8 failed |

A numeric literal that *is* `Infinity` is green. An ordinary finite number written
as a member expression is red. So the axis is the **form the seed is written in** —
literal folds, a name or a member expression does not — and the value's finiteness
has nothing to do with it. U635's "8 red rows" were attributed to infinity; that
attribution was wrong, which is why U640's non-finite work could not close this.

The compiler already knows about part of this: `collect-shared.ts` carries a fix so
that an unfoldable seed no longer unregisters the shape's *field set*. The residual
is one layer down — the fields register, but the per-instance seed **values** never
reach the protocol cells, all-or-nothing across the whole seed object.

Nothing is reported when the fold gives up. The build is clean, no `MARKLESS_*`
diagnostic is emitted, the family renders, and the seeded fields silently hold the
`state()` defaults. A family author meets this as wrong runtime behaviour with no
compiler evidence pointing at the seed.

A second, unrelated constraint showed up while measuring and is worth recording:
the compiler refuses `crop.maxWidth = maxWidth ?? Number.POSITIVE_INFINITY` in a
component body with `MARKLESS_SHARED_SEED_UNSUPPORTED` — a body seeds a shared
instance only from its own props or from constants. The fallback has to be written
as a destructuring default on the prop, not as a coalesce at the assignment.

## What was left in the tree

The crop source is unchanged — the `undefined`-means-no-limit workaround stays, per
the packet's "keep it only if a row goes red for a reason you can name". Only
`note.md`'s seed-wall paragraph was edited, to replace the infinity attribution with
the measurement above.

Writing the caps as `1e400` would make all 58 rows green today. It was not adopted:
it is an obscure spelling of a compiler workaround, it would need a comment to
survive review, and it hides a framework defect inside one family.

## The owner question

The fix belongs in the compiler's seed folding — an identifier or member expression
resolving to a module-visible constant should fold, or the fold should refuse
loudly instead of silently emptying the seed. That is a framework package, outside
this unit's contract. Three ways forward:

- Fix the fold in the compiler, then drop crop's `undefined` branch in a follow-up.
- Make the give-up loud (a diagnostic naming the seed property), and keep the
  `undefined` branch until the fold lands.
- Accept `undefined`-means-no-limit as the family idiom for an unbounded cap.

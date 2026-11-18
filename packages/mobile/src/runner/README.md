# The phone runner

One runner per machine owns the phones. Workers do not boot simulators or emulators. They submit rungs and read the
results. Do not wrap `wait` or `submit --wait` in `heavy`: the job's chunks need the machine queue's slots
while you wait.

```sh
# From your checkout. The submit compiles the rungs, so it goes through the machine queue; waiting does not.
heavy pnpm --filter @markless/mobile phones submit --affected            # the rungs your change can affect; prints a job id
heavy pnpm --filter @markless/mobile phones submit 03-counter n2-orders  # named rungs
heavy pnpm --filter @markless/mobile phones submit --all                 # the whole ladder
heavy pnpm --filter @markless/mobile phones submit --failed <job>        # only the rungs that failed in <job>, rebuilt from your checkout
pnpm --filter @markless/mobile phones wait <job>                         # exits 0 only if the job passed
pnpm --filter @markless/mobile phones status                              # phones, and jobs not finished yet
pnpm --filter @markless/mobile phones result <job> --copy-screenshots     # report again; copy screenshots into your rung folders
pnpm --filter @markless/mobile phones affected [--base <rev>]             # which rungs, and why, without running them
```

## What happens on `submit`

1. The rungs are compiled **in your checkout**, with your compiler and your `MARKLESS_DRAGON_DIR`. Dragon is the
   style compiler; the variable names its checkout.
2. The submit writes a bundle under `~/.cache/markless-phones/jobs/<job>/bundle/` (`MARKLESS_PHONES_HOME` moves this
   folder). The bundle holds:
    - each rung's payload, style and fonts;
    - its flow, with the screenshot steps added;
    - its manifest entries;
    - a copy of your hosts (`src/adapters`), shells and conformance vectors.
3. After that the runner never reads your checkout. You can keep editing, switch branches or delete the worktree while
   the job waits.
4. The job is split into chunks: up to 8 rungs on one platform each (`--chunk <n>` changes the size). Any free phone of
   that platform takes the oldest job's next chunk. With two phones of a platform, a job's chunks for that platform run
   on both at once.
5. Each chunk runs through the machine queue (`~/.claude/bin/heavy`, reserving 2 GB; the measured peak was 0.9 GB):
    - it builds or reuses the shell around **your** hosts, cached by source content in `~/.cache/markless-proof`;
    - it runs the hosts' own tests, which are remembered per source set and simulator;
    - then, for each rung, it installs the app and runs the flow with Maestro, the tool that drives the phone through
      each flow. Maestro's driver app is installed once per phone boot, not before every flow.
6. Before a phone takes a chunk, the runner checks that the phone answers (the simulator reads Booted; the emulator is
   an adb `device` with `sys.boot_completed` 1). A phone that does not answer is restarted first, so a job never starts
   on a dead phone. Idle phones are checked every 30 s as well.
7. If a phone stops answering during a chunk, the runner restarts it and runs that chunk's failed rungs once more. The
   result lists those rungs under "ran again after its phone restarted". A rung that fails twice is a failure.

A rung that does not compile fails at `build` on every platform it was asked for, and never reaches a phone. A host whose
own tests fail fails every rung of that chunk at `host-tests`.

## Where results go

`~/.cache/markless-phones/jobs/<job>/`:

| Path                                     | What                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `result/ios.json`, `result/android.json` | The harness's `markless.proof-report/0` reports, in the order you named the rungs. `phones result` and the harness's `verdict` read them. |
| `result/summary.json`                    | Passed or failed, the problems, the job's wall time, and the rungs that ran again.                                                        |
| `screenshots/<rung>/<platform>/`         | A screenshot after each step and before each action, plus Maestro's shot at a failure.                                                    |
| `logs/<chunk>.log`                       | Each chunk's own log: queue waits, host tests, PASS or FAIL per rung with timings.                                                        |
| `bundle/`                                | Exactly what ran.                                                                                                                         |

The runner's log is `~/.cache/markless-phones/daemon.log`, and the phones' states are in `phones.json`.

## Starting and stopping

`submit` starts the runner if none runs, with the default pool: simulator `markless-runner` and AVD
`markless_runner` on console port 5570. To pick the phones yourself:

```sh
pnpm --filter @markless/mobile phones start --ios markless-runner --android markless_runner@5570
pnpm --filter @markless/mobile phones stop            # the phones keep running for the next runner
pnpm --filter @markless/mobile phones stop --phones   # and shut the pool's own phones down
```

The runner runs its own copy of the run code, from the checkout that started it (`phones status` names that checkout).
The data comes from each job's bundle, so the bundle carries your hosts, shells, flows and payloads. The code that
installs an app and drives Maestro (`src/harness/{ios,android,maestro}.ts`, `src/runner/run-chunk.ts`) is the runner's.
If you changed that code, restart the runner from your checkout before you submit, or run the harness directly as
before (`pnpm --filter @markless/mobile proof ...`).

## Which rungs `--affected` picks

The choice comes from the yuku project graph (`packages/analyzer/test-support/project-graph.ts`), the same graph the
pre-commit hook uses to pick unit tests. No text in the code is searched.

| Change                                                                                                                           | Rungs                                |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| A path that is a run-all rule of the graph (lockfile, any `package.json`, tsconfig and similar)                                  | every rung                           |
| Anything under `src/adapters/`, `src/harness/shells/` or `conformance/` (the hosts)                                              | every rung                           |
| A module that the harness or the runner imports, directly or not: compiler, runtime, router, web, serializer, the harness itself | every rung                           |
| A file inside a rung's folder                                                                                                    | that rung                            |
| A module that a rung's `App.tsrx`, pages or `document.tsrx` imports, directly or not                                             | that rung                            |
| `proofs/app.json`                                                                                                                | every rung                           |
| A rung whose imports include one that does not resolve                                                                           | that rung, whenever anything changed |

Changed files are those committed since the merge base with `--base`, plus uncommitted and untracked ones. The default
base is `origin/cw/native-integration` when that branch exists, else `origin/main`.

The graph links `@markless/web`'s inline defer loader to the UI families through a declared dynamic import. Because the
harness reaches web through the router, a change in `@markless/ui` selects every rung.

## Phone facts this runner works around

- An iOS run and an Android run at the same time were stable: 6 of 6 rounds passed with the driver not reinstalled
  (2026-11-18). The older harness runs them one after the other.
- `heavy` stops processes a job leaves behind. So the runner boots phones itself, holding a queue admission only while
  the phone boots, and only each chunk runs inside the queue.

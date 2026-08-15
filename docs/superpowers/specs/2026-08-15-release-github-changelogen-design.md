# Markless Release Cut + GitHub Releases Design

Date: 2026-08-15  
Status: approved in chat; awaiting file review before implementation plan

## Problem

Markless packages are at `0.2.2` on npm (`0.2.0`, `0.2.1`, `0.2.2` all published), but GitHub Releases stop at `v0.1.1`.

That gap is intentional in the current CI publish workflow: `.github/workflows/release.yml` publishes via npm trusted publishing and explicitly does not create tags or GitHub Releases. Tagging and release notes were left as a manual owner step, and that step was not done for the `0.2.x` line.

A second, related gap: Markless already has a local `pnpm release` orchestrator that can bump, publish from a laptop, tag, and create a GitHub Release, but production publishing actually goes through CI. The local path and the CI path disagree about who creates GitHub Releases.

## Goal

Make every shipped version produce:

1. lockstep version bump across the release package set
2. an annotated `v<version>` tag
3. a GitHub Release whose notes cover the full commit range
4. an npm publish that cannot succeed unless the matching GitHub tag and Release already exist

Match the proven `oxc-tsrx` shape: `bumpp` for version cuts, `changelogen` (plus a completeness wrapper) for release notes, with cut and publish kept as separate workflows.

## Non-goals

- Do not rename `.github/workflows/release.yml`. npm trusted-publisher entries name that filename literally.
- Do not move npm publishing into the cut workflow. Cut must never request `id-token: write`.
- Do not replace the existing curated `CHANGELOG.md` with raw changelogen output. Product changelog writing stays human-curated; GitHub Release notes are generated from git history.
- Do not auto-publish on merge or on tag push. Both cut and publish remain `workflow_dispatch`.

## Architecture

Two dispatched workflows, same separation as `oxc-tsrx`:

```text
Manual Release (cut)
  bumpp root version
  -> sync all release manifests
  -> verify lockstep / release tests
  -> commit + annotated tag
  -> generate notes (changelogen + remainder)
  -> push commit/tag
  -> create GitHub Release
  -> stop (nothing on npm)

Release (publish, existing release.yml)
  require matching GitHub tag + Release at this commit
  -> assert version lockstep
  -> build / pack / publish via OIDC
  -> verify provenance
```

Owner sequence for a normal release:

1. Dispatch **Manual Release** on `main` (`dry-run`, then `release`).
2. Review the GitHub Release.
3. Dispatch **Release** (`release.yml`) at the tagged SHA (`dry-run`, then `publish` with the confirmation phrase).

## Design decisions

### 1. Cut workflow owns GitHub; publish workflow owns npm

**Decision:** Add `.github/workflows/manual-release.yml` for version cut, tag, notes, and GitHub Release. Keep npm publication in `.github/workflows/release.yml`.

**Why:** Combining `contents: write` and `id-token: write` in one irreversible job creates partial-state risk and mixes authorities. `oxc-tsrx` already proved the safer split: cut stops at GitHub; publish is a second human-dispatched gate.

### 2. `bumpp` bumps the root; Markless sync owns the package set

**Decision:** Cut workflow runs:

```bash
pnpm exec bumpp package.json --release <type> [--preid <id>] --yes --no-commit --no-tag --no-push
```

Then a Markless sync script rewrites every release package version derived from `scripts/release/release-packages.mjs` so the set stays lockstep.

**Why:** `bumpp` should not commit a half-updated tree. Markless already derives the release set from manifests; the sync step must use that same derivation and never restate package names as literals.

Local preparation command becomes:

```bash
pnpm release          # bumpp interactively on root, then sync
pnpm release:check    # sync --check / lockstep assertion
pnpm release:notes    # generate notes for a range
```

The current laptop-publishing `scripts/release/run-release.mjs` path is retired or reduced to a thin wrapper that refuses to publish and points at the CI workflows.

### 3. Release notes: changelogen plus remainder, fail-closed

**Decision:** Port the `oxc-tsrx` `scripts/release-notes.ts` pattern into Markless as `scripts/release/release-notes.mjs` (JS to match the existing release scripts).

Behavior:

- run `changelogen` for Conventional Commit sections
- append every commit in the range that changelogen dropped under an "Other changes" section
- refuse to write notes unless every commit in `from..to` appears in the final body
- resolve `HEAD~1` to a concrete SHA before passing `--to`, so compare links are not dead
- default `--from` to the latest annotated release tag matching `v[0-9]*`, or the first commit if none exists
- never leave changelogen temp files in the repo

Cut workflow note range: previous release tag → commit before the release commit.

### 4. Publish workflow requires the GitHub Release first

**Decision:** After checkout in `release.yml` publish mode (and preferably also dry-run), assert:

- tag `v${version}` exists
- the tag points at the checked-out commit
- a GitHub Release exists for that tag

If any check fails, stop before packing or publishing.

**Why:** This closes the exact failure mode that produced npm `0.2.2` with GitHub stuck at `v0.1.1`.

Also fix the stale repository guard in `release.yml` from `markless-dev/markless` to `compiled-run/markless`.

### 5. Permissions and triggers stay fail-closed

Manual Release:

- workflow default `contents: read`
- release job `contents: write`
- no `id-token: write`
- only `compiled-run/markless`
- only the default branch
- modes: `dry-run` | `release`
- bump types: `patch` | `minor` | `major` | `prerelease`

Existing Release (`release.yml`):

- keep `id-token: write` for trusted publishing
- add `contents: read` sufficient for tag/release existence checks via `gh` + `GITHUB_TOKEN`
- keep dry-run default and typed confirmation phrase for publish
- filename remains `release.yml`

### 6. Tests lock the contract in place

Add focused tests that fail if GitHub finalization is removed again:

- cut workflow creates an annotated `v$VERSION` tag
- cut workflow pushes tag/commit only in `release` mode
- notes come from `scripts/release/release-notes.mjs`, not ad-hoc `git log`
- notes `--to` is a resolved SHA, never literal `HEAD~1`
- GitHub Release is created from the generated notes file via a SHA-pinned action
- cut workflow never requests `id-token` and never runs npm/pnpm publish
- publish workflow asserts matching GitHub tag/Release before registry writes
- publish workflow still refuses stored npm tokens
- `release-notes.mjs` covers every commit in a fixture range, including non-conventional subjects

Extend or replace coverage around the current `publish-shape.test.ts` / release script tests as needed; prefer a dedicated release-path contract file modeled on `oxc-tsrx/tests/release/release-path.test.mjs`.

### 7. Backfill the missing GitHub Releases

After the tooling lands (or as an operator step using the new notes generator), create:

| Version | Tag target commit | Notes |
|---|---|---|
| `0.2.0` | `96999ab3` | Successful publish SHA for 0.2.0, not the earlier failed `803aeeb8` cut |
| `0.2.1` | `0b4a1b77` | Successful publish SHA |
| `0.2.2` | `cb78c185` | Successful publish SHA |

For each:

1. generate complete notes with `release-notes.mjs` for the appropriate previous-tag..commit range
2. create annotated tag at the listed commit if missing
3. create GitHub Release with those notes
4. verify tag points at the intended SHA and the Release body covers the range

Do not republish npm packages as part of backfill.

## File map

Create:

- `.github/workflows/manual-release.yml`
- `scripts/release/release-notes.mjs`
- `scripts/release/sync-version.mjs` (or equivalent name; bumpp root → release package lockstep)
- `scripts/release/assert-github-release.mjs` (tag/release existence gate for publish workflow)
- focused release-path / notes tests under `scripts/release/` or `tests/release/`

Modify:

- `.github/workflows/release.yml` — GitHub existence gate; repository owner guard
- `package.json` — add `changelogen`; rewrite `release` / add `release:check` / `release:notes`
- `.ruler/skills/markless-implementation/release.md` (+ generated skill copies via `pnpm rules`)
- retire or neuter laptop publish behavior in `scripts/release/run-release.mjs`

Preserve:

- `.github/workflows/release.yml` filename
- OIDC trusted publishing path
- `scripts/release/release-packages.mjs` as the single derivation of the release set
- curated `CHANGELOG.md`

## Operator runbook (after landing)

### Cut

1. On `main`, dispatch Manual Release with `mode=dry-run` and the intended bump type.
2. Confirm the artifacted notes and lockstep summary look right.
3. Dispatch again with `mode=release`.
4. Confirm tag `vX.Y.Z` and the GitHub Release exist.

### Publish

1. Dispatch Release (`release.yml`) at the tagged commit with `mode=dry-run` and `version=X.Y.Z`.
2. Dispatch again with `mode=publish` and confirm phrase `publish markless X.Y.Z`.
3. Confirm provenance verification succeeds.

### Local prep only

```bash
pnpm release            # choose next version; sync manifests; no publish
pnpm release:check
pnpm release:notes -- --from v0.2.2 --to HEAD --out /tmp/notes.md
```

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Trusted publisher breaks if `release.yml` is renamed | Filename is load-bearing; tests and docs call that out; do not rename |
| Cut workflow accidentally gains publish power | No `id-token: write`; contract test bans publish commands |
| Changelogen hides non-conventional commits | Remainder section + fail-closed coverage check |
| Dead compare links from `HEAD~1` | Resolve to SHA before passing `--to` |
| Publish without GitHub Release | Existence gate before pack/publish |
| Unrelated dirty work on feature branches | Implement on an isolated branch/worktree; keep docs/feature work separate |
| Backfill tags the wrong 0.2.0 commit | Use successful workflow SHAs listed above |

## Success criteria

- Dispatching Manual Release in `release` mode creates tag + GitHub Release with complete notes.
- Dispatching the existing Release workflow without that GitHub Release fails before any registry write.
- Successful publish still produces provenance for every release package.
- `v0.2.0`, `v0.2.1`, and `v0.2.2` exist on GitHub and match the published npm versions.
- Focused contract tests fail if GitHub finalization or the publish gate is removed.
- Required verify includes `pnpm exec tsc --noEmit -p tsconfig.json` plus the new/updated release tests.

## Open implementation details (defaults unless overridden)

These are researched defaults, not open product questions:

- Port notes generator as `.mjs` to match `scripts/release/*`.
- Pin `softprops/action-gh-release` by full commit SHA, same posture as `oxc-tsrx`.
- Checkout with `fetch-depth: 0` for notes generation.
- Keep `CHANGELOG.md` human-curated; do not auto-overwrite it during cut.
- Implement on a focused branch isolated from unrelated `feat/docs-work` changes.

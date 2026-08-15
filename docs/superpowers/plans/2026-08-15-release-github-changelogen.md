# Release Cut + GitHub Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bumpp/changelogen release-cut workflow and prevent npm publication unless the matching GitHub tag and Release already exist.

**Architecture:** A new Manual Release workflow owns version cutting, complete release-note generation, the release commit, annotated tag, and GitHub Release. The existing load-bearing `release.yml` keeps sole ownership of OIDC npm publication and gains a fail-closed preflight that binds the requested version, tag, Release, and checked-out SHA.

**Tech Stack:** Node.js ESM, Vitest, GitHub Actions YAML, `bumpp`, `changelogen`, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-08-15-release-github-changelogen-design.md`

## Global Constraints

- Do not rename `.github/workflows/release.yml`; npm trusted-publisher entries name it literally.
- Manual Release must never request `id-token: write` or run an npm/pnpm publish command.
- Existing Release remains `workflow_dispatch`, defaults to dry-run, and retains typed publish confirmation.
- Derive the release package set from `scripts/release/release-packages.mjs`; never copy package names into versioning code.
- Keep `CHANGELOG.md` human-curated; generated history is the GitHub Release body.
- Release notes must account for every commit in the chosen range.
- Resolve a `HEAD~1` endpoint to a concrete SHA before giving it to changelogen.
- Use a SHA-pinned GitHub Release action.
- Every implementation task follows red-green-refactor.
- Final verification must include `pnpm exec tsc --noEmit -p tsconfig.json`.

---

### Task 1: Lockstep Version Sync and Safe Local Release Commands

**Files:**
- Create: `scripts/release/sync-version.mjs`
- Create: `scripts/release/versioning.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Delete: `scripts/release/run-release.mjs`

**Interfaces:**
- Consumes: `releasePackages()`, `repoRoot`, and `rootVersion()` from `scripts/release/release-packages.mjs`.
- Produces: CLI `node scripts/release/sync-version.mjs [--check]`; package scripts `release`, `release:check`.

- [ ] **Step 1: Write failing version-sync tests**

Create `scripts/release/versioning.test.ts` using temporary fixture repositories. Test these observable behaviors:

```ts
test('sync-version rewrites every derived release manifest to the root version', async () => {
  const fixture = await versionFixture({
    root: '1.2.3',
    packages: [
      { name: '@markless/a', version: '0.0.1' },
      { name: '@markless/private', version: '9.9.9', private: true },
    ],
  });
  await runSync(fixture);
  expect(await versionOf(fixture, 'packages/a/package.json')).toBe('1.2.3');
  expect(await versionOf(fixture, 'packages/private/package.json')).toBe('9.9.9');
});

test('--check reports drift without writing', async () => {
  const fixture = await versionFixture({
    root: '1.2.3',
    packages: [{ name: '@markless/a', version: '0.0.1' }],
  });
  const before = await readFile(join(fixture, 'packages/a/package.json'), 'utf8');
  const result = await runSync(fixture, ['--check'], { reject: false });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('@markless/a');
  expect(await readFile(join(fixture, 'packages/a/package.json'), 'utf8')).toBe(before);
});
```

Make the production script accept `MARKLESS_REPO_ROOT` only for isolated test fixtures; default to `repoRoot`. The fixture still exercises the production CLI and real package-derivation rules.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
pnpm exec vitest run scripts/release/versioning.test.ts
```

Expected: FAIL because `sync-version.mjs` does not exist.

- [ ] **Step 3: Implement `sync-version.mjs`**

Implement argument parsing for only `--check`. Read root version as semver text, derive non-private package manifests using the same directory rules as `release-packages.mjs`, preserve JSON indentation and final newline, and either:

- default mode: rewrite mismatched release manifests
- `--check`: list mismatches on stderr and exit 1 without writes

Refactor `release-packages.mjs` minimally if needed so its derivation accepts an explicit root without duplicating logic.

- [ ] **Step 4: Replace laptop publication with preparation-only scripts**

Change root scripts to:

```json
"release": "bumpp package.json --no-commit --no-tag --no-push && node scripts/release/sync-version.mjs",
"release:check": "node scripts/release/sync-version.mjs --check"
```

Delete `scripts/release/run-release.mjs`, which publishes from a laptop and conflicts with the CI-only release policy. Run `pnpm install --lockfile-only` to update the lockfile only as required.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm exec vitest run scripts/release/versioning.test.ts scripts/release/publish-shape.test.ts
pnpm release:check
```

Expected: PASS; current manifests are already lockstep.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/release/release-packages.mjs scripts/release/sync-version.mjs scripts/release/versioning.test.ts scripts/release/run-release.mjs
git commit -m "feat(release): make bumpp prepare lockstep versions"
```

---

### Task 2: Complete Changelogen Release Notes

**Files:**
- Create: `scripts/release/release-notes.mjs`
- Create: `scripts/release/release-notes.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `node scripts/release/release-notes.mjs [--from <ref>] [--to <ref>] [--out <path>]`.
- Produces: package script `release:notes`.
- Output contract: every commit in `from..to` appears by abbreviated SHA in the final Markdown.

- [ ] **Step 1: Add changelogen and write failing tests**

Install:

```bash
pnpm add -D changelogen
```

Create a temporary git fixture in `release-notes.test.ts` with:

1. an initial tagged commit
2. `feat(core): conventional subject`
3. `Plain prose subject changelogen will not classify`

Test:

```ts
test('release notes include conventional and unclassified commits', async () => {
  const result = await runNotes(fixture, ['--from', 'v1.0.0', '--to', 'HEAD']);
  expect(result.stdout).toContain('conventional subject');
  expect(result.stdout).toContain('Plain prose subject');
  expect(result.stdout).toContain(conventionalSha.slice(0, 7));
  expect(result.stdout).toContain(proseSha.slice(0, 7));
  expect(result.stderr).toContain('2 covered');
});

test('invalid ranges fail without writing the output file', async () => {
  const out = join(fixture, 'notes.md');
  const result = await runNotes(
    fixture,
    ['--from', 'missing', '--to', 'HEAD', '--out', out],
    { reject: false },
  );
  expect(result.exitCode).toBe(1);
  await expect(access(out)).rejects.toThrow();
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
pnpm exec vitest run scripts/release/release-notes.test.ts
```

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Port the fail-closed oxc-tsrx generator**

Implement:

- strict parser for `--from`, `--to`, `--out`
- latest reachable `v[0-9]*` tag as default start, first commit fallback
- changelogen CLI resolution through `createRequire`
- temporary output directory removed in `finally`
- extraction of changelogen’s release section
- detection of emitted commit links
- “Other changes” section for every omitted commit
- final assertion that each abbreviated commit SHA exists in the body
- atomic output write only after coverage succeeds

Repository URLs must derive from the `origin` remote, falling back to root `package.json.repository.url`; do not hardcode the owner or repository.

- [ ] **Step 4: Add the local notes command**

Add:

```json
"release:notes": "node scripts/release/release-notes.mjs"
```

- [ ] **Step 5: Verify GREEN**

```bash
pnpm exec vitest run scripts/release/release-notes.test.ts
pnpm release:notes -- --from v0.1.1 --to 96999ab3 --out /tmp/markless-v0.2.0-notes.md
```

Expected: tests pass; generator reports all commits covered and writes the output file.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/release/release-notes.mjs scripts/release/release-notes.test.ts
git commit -m "feat(release): generate complete changelogen notes"
```

---

### Task 3: Manual Release Cut Workflow

**Files:**
- Create: `.github/workflows/manual-release.yml`
- Create: `scripts/release/release-path.test.ts`

**Interfaces:**
- Consumes: `sync-version.mjs`, `release-notes.mjs`, root `package.json` version.
- Produces: workflow inputs `release_type`, `preid`, and `mode`; release commit/tag/Release.

- [ ] **Step 1: Write the failing parsed-YAML contract tests**

Use `yaml` only if already present transitively with a stable import; otherwise add `js-yaml` and `@types/js-yaml` as dev dependencies. Parse `.github/workflows/manual-release.yml` and assert:

```ts
test('manual release owns GitHub writes but cannot publish npm', () => {
  expect(workflow.permissions).toEqual({ contents: 'read' });
  expect(workflow.jobs.release.permissions).toEqual({ contents: 'write' });
  expect(executableSource).not.toMatch(/id-token|npm publish|pnpm publish/u);
});

test('release mode pushes an annotated v<version> tag and creates a Release from generated notes', () => {
  expect(commitStep.run).toMatch(/git tag -a "v\$VERSION" -m "v\$VERSION"/u);
  expect(pushStep.if).toBe("inputs.mode == 'release'");
  expect(releaseStep.uses).toMatch(/^softprops\/action-gh-release@[0-9a-f]{40}$/u);
  expect(releaseStep.with.body_path).toBe('${{ runner.temp }}/release-notes.md');
});

test('notes use the complete generator with a resolved endpoint', () => {
  expect(notesStep.run).toMatch(/node scripts\/release\/release-notes\.mjs/u);
  expect(notesStep.run).toMatch(/git rev-parse --verify "HEAD~1"/u);
  expect(notesStep.run).not.toMatch(/--to "?HEAD~1"?/u);
});
```

Also assert default-branch refusal, full-history checkout, bumpp root-only invocation, version sync/check, dry-run no push, and `compiled-run/markless` repository guard.

- [ ] **Step 2: Run contract tests and confirm RED**

```bash
pnpm exec vitest run scripts/release/release-path.test.ts
```

Expected: FAIL because `manual-release.yml` does not exist.

- [ ] **Step 3: Implement `manual-release.yml`**

Model it on `oxc-tsrx/.github/workflows/manual-release.yml`, adapted to Markless:

- `workflow_dispatch`: release type, preid, mode
- top-level `contents: read`, one release job with `contents: write`
- repository/default-branch/clean-checkout guards
- `fetch-depth: 0`
- pinned pnpm and Node setup actions following repository policy
- install frozen dependencies
- capture previous release tag before creating the new tag
- configure `github-actions[bot]`
- bumpp root manifest with `--yes --no-commit --no-tag --no-push`
- run sync and sync check
- regenerate lockfile using `pnpm install --lockfile-only`
- run focused release tests, `pnpm exec tsc --noEmit -p tsconfig.json`, and existing publish-readiness checks that do not require publishing
- commit all derived files and create annotated tag
- resolve `HEAD~1`, generate notes to `${RUNNER_TEMP}/release-notes.md`
- upload notes as a review artifact in both modes
- dry-run summary with no push
- release-mode commit/tag push
- SHA-pinned `softprops/action-gh-release`, with prerelease/latest flags derived from release type

- [ ] **Step 4: Verify GREEN**

```bash
pnpm exec vitest run scripts/release/release-path.test.ts scripts/release/versioning.test.ts scripts/release/release-notes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/manual-release.yml scripts/release/release-path.test.ts package.json pnpm-lock.yaml
git commit -m "feat(release): add manual GitHub release cut"
```

---

### Task 4: Require GitHub Release Before npm Publication

**Files:**
- Create: `scripts/release/assert-github-release.mjs`
- Create: `scripts/release/github-release-gate.test.ts`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/release/release-path.test.ts`

**Interfaces:**
- Produces: CLI `node scripts/release/assert-github-release.mjs <version> <expected-sha>`.
- Requires environment: `GITHUB_REPOSITORY`, `GH_TOKEN`; test injection may provide `MARKLESS_GH_BIN`.
- Success means tag `v<version>` exists, peels to `expected-sha`, and a non-draft GitHub Release exists for that tag.

- [ ] **Step 1: Write failing gate tests**

Use a fake `gh` executable in a temporary directory to return controlled JSON. Cover:

```ts
test('accepts a published Release whose annotated tag peels to the expected SHA', async () => {
  const result = await runGate({
    tagObjectSha: 'tag-object',
    peeledCommitSha: expectedSha,
    release: { tagName: 'v1.2.3', isDraft: false },
  });
  expect(result.exitCode).toBe(0);
});

test.each([
  ['missing release', { releaseExitCode: 1 }],
  ['draft release', { release: { tagName: 'v1.2.3', isDraft: true } }],
  ['wrong commit', { peeledCommitSha: 'different' }],
])('fails closed for %s', async (_name, scenario) => {
  const result = await runGate(scenario, { reject: false });
  expect(result.exitCode).toBe(1);
});
```

The fake must verify the production script asks GitHub for the tag ref, peels annotated tags, and views the Release.

- [ ] **Step 2: Run gate tests and confirm RED**

```bash
pnpm exec vitest run scripts/release/github-release-gate.test.ts
```

Expected: FAIL because `assert-github-release.mjs` does not exist.

- [ ] **Step 3: Implement the gate**

Validate concrete semver input and 40-character expected SHA. Query the current repository from `GITHUB_REPOSITORY`; do not hardcode it in the script. Use `gh api` to read `git/ref/tags/v<version>` and peel an annotated tag object to its commit. Use `gh release view v<version> --json tagName,isDraft` to require a non-draft release. Print one concise success line; print actionable failures and exit 1.

- [ ] **Step 4: Put the gate before every registry-touching step**

In `.github/workflows/release.yml`:

- fix repository guard to `compiled-run/markless`
- checkout with full tag availability
- immediately after version-lockstep assertion, run:

```yaml
- name: Require the matching GitHub Release
  env:
    GH_TOKEN: ${{ github.token }}
  run: node scripts/release/assert-github-release.mjs "$RELEASE_VERSION" "$GITHUB_SHA"
```

- update opening/final comments: GitHub cut is a prerequisite, not an owner-side remainder
- leave trusted publishing permissions, confirmation, build, pack, publish, and provenance behavior intact

Extend `release-path.test.ts` to assert the gate step occurs before setup/build/publish and that `release.yml` remains the OIDC workflow with no repository write permission.

- [ ] **Step 5: Verify GREEN**

```bash
pnpm exec vitest run scripts/release/github-release-gate.test.ts scripts/release/release-path.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml scripts/release/assert-github-release.mjs scripts/release/github-release-gate.test.ts scripts/release/release-path.test.ts
git commit -m "fix(release): require GitHub release before npm publish"
```

---

### Task 5: Release Guidance and Full Verification

**Files:**
- Modify: `.ruler/skills/markless-implementation/release.md`
- Generated by `pnpm rules`: `.claude/skills/markless-implementation/release.md`, `.codex/skills/markless-implementation/release.md`, `AGENTS.md`, `CLAUDE.md` only if the generator changes them

**Interfaces:**
- Documents the exact operator order: Manual Release dry-run/release, then npm Release dry-run/publish at the tagged SHA.

- [ ] **Step 1: Update the source release guidance**

Replace statements that tags and GitHub Releases stay owner-side with:

- Manual Release cuts versions via bumpp, syncs derived manifests, creates the annotated tag and GitHub Release from complete changelogen notes.
- `release.yml` remains load-bearing and solely publishes npm via OIDC.
- npm publish refuses versions without a matching GitHub tag/Release at the checked-out SHA.
- local `pnpm release` prepares manifests only and never publishes.

- [ ] **Step 2: Regenerate rule outputs**

```bash
pnpm rules
```

Inspect the diff and retain only generator-owned changes caused by the source guidance.

- [ ] **Step 3: Run focused release verification**

```bash
pnpm exec vitest run scripts/release/*.test.ts
pnpm release:check
```

Expected: all release tests pass and versions are lockstep.

- [ ] **Step 4: Run required repository verification**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
pnpm check
```

Expected: exit 0 for both. If a consuming release fixture is affected, run its documented package/build check before completion.

- [ ] **Step 5: Inspect final diff for security boundaries**

Confirm from the executable YAML:

- only Manual Release has `contents: write`
- Manual Release has no `id-token` or publish command
- only `release.yml` has `id-token: write`
- `release.yml` has no `contents: write`
- the GitHub prerequisite step precedes npm setup/publish
- `release.yml` filename is unchanged

- [ ] **Step 6: Commit**

```bash
git add .ruler/skills/markless-implementation/release.md .claude/skills/markless-implementation/release.md .codex/skills/markless-implementation/release.md AGENTS.md CLAUDE.md
git commit -m "docs(release): document cut then publish workflow"
```

---

### Task 6: Backfill GitHub Releases 0.2.0–0.2.2

**External effects:** Creates immutable public annotated tags and GitHub Releases. The owner approved this backfill in chat. Do not republish npm.

**Inputs:**
- `v0.2.0` → successful publish SHA `96999ab3f768b3486834bf4777dd002f49bcdb8a`
- `v0.2.1` → successful publish SHA `0b4a1b7733183bdb50bb0db075bdf7e57ad772c2`
- `v0.2.2` → successful publish SHA `cb78c18512bcb487516c0b0ab208063ba08ab878`

- [ ] **Step 1: Verify absence and target commits**

```bash
gh release view v0.2.0
gh release view v0.2.1
gh release view v0.2.2
git show -s --format='%H %s' 96999ab3 0b4a1b77 cb78c185
```

Expected: Releases absent; commits resolve to the intended published versions.

- [ ] **Step 2: Generate complete notes before mutating GitHub**

```bash
pnpm release:notes -- --from v0.1.1 --to 96999ab3 --out /tmp/markless-v0.2.0.md
pnpm release:notes -- --from 96999ab3 --to 0b4a1b77 --out /tmp/markless-v0.2.1.md
pnpm release:notes -- --from 0b4a1b77 --to cb78c185 --out /tmp/markless-v0.2.2.md
```

Expected: each command reports every commit covered.

- [ ] **Step 3: Create and push annotated tags one at a time**

```bash
git tag -a v0.2.0 96999ab3f768b3486834bf4777dd002f49bcdb8a -m "v0.2.0"
git push origin refs/tags/v0.2.0
git tag -a v0.2.1 0b4a1b7733183bdb50bb0db075bdf7e57ad772c2 -m "v0.2.1"
git push origin refs/tags/v0.2.1
git tag -a v0.2.2 cb78c18512bcb487516c0b0ab208063ba08ab878 -m "v0.2.2"
git push origin refs/tags/v0.2.2
```

Before each creation, re-check that the tag is still absent. Stop on any conflict.

- [ ] **Step 4: Create GitHub Releases from generated notes**

```bash
gh release create v0.2.0 --title v0.2.0 --notes-file /tmp/markless-v0.2.0.md
gh release create v0.2.1 --title v0.2.1 --notes-file /tmp/markless-v0.2.1.md
gh release create v0.2.2 --title v0.2.2 --notes-file /tmp/markless-v0.2.2.md --latest
```

- [ ] **Step 5: Verify public state**

For each version:

```bash
gh release view v0.2.2 --json tagName,name,isDraft,isPrerelease,url,targetCommitish
git rev-list -n 1 v0.2.2
npm view @markless/core@0.2.2 version
```

Repeat for `0.2.0` and `0.2.1`. Expected: non-draft, non-prerelease Release; peeled tag commit equals the approved SHA; npm version exists.


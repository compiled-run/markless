#!/bin/sh
# Attach a GitHub Actions trusted publisher to every release package.
#
# npm stores trusted publishing per package, not per organization, so this is
# one call per package. After it runs, .github/workflows/release.yml can publish
# with no credential at all and npm generates a provenance attestation for each
# package automatically.
#
#   pnpm release:trust           # attach
#   pnpm release:trust --check   # report current state, change nothing
#
# npm's 2FA window is a few minutes, long enough to do all of them in one go.
#
# The package list and the repo are both DERIVED, never restated here. A
# hand-kept copy of the release set is exactly how verify-publish-ready.mjs
# silently stopped covering two packages.

set -u

WORKFLOW="release.yml"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

cd "$(dirname "$0")/../.." || exit 1

# The workflow filename is load-bearing: every trusted-publisher entry names it
# literally, so a rename breaks publishing for every package at once. Refuse to
# register a name that does not exist.
if [ ! -f ".github/workflows/$WORKFLOW" ]; then
  echo "missing .github/workflows/$WORKFLOW" >&2
  echo "npm would be told to trust a workflow that does not exist." >&2
  exit 1
fi

# Derive the repo from the git remote rather than hardcoding it, so a fork or a
# rename cannot silently point npm at the wrong repository.
REPO=$(git remote get-url origin 2>/dev/null \
  | sed -e 's#^git@github.com:#/#' -e 's#^https://github.com/#/#' -e 's#\.git$##' -e 's#^/##')
if [ -z "$REPO" ]; then
  echo "could not derive the GitHub repo from 'git remote get-url origin'" >&2
  exit 1
fi

# The same derived set the release workflow publishes.
NAMES=$(node -e '
  import("./scripts/release/release-packages.mjs").then((m) => {
    process.stdout.write(m.releasePackages().map((p) => p.name).join("\n"));
  });
') || exit 1

if [ -z "$NAMES" ]; then
  echo "no release packages found" >&2
  exit 1
fi

if ! npm whoami >/dev/null 2>&1; then
  echo "not logged in to npm: run 'npm login' first" >&2
  exit 1
fi

# `npm trust` exists before 11.15.0 but sends a payload the registry rejects
# with a bare 400 ("value must be an array"), once per package, with nothing to
# suggest the CLI is at fault. Fail up front instead.
NPM_VERSION=$(npm --version)
if ! node -e '
  const [have, want] = [process.argv[1], "11.15.0"].map((v) => v.split(".").map(Number));
  const ok = have[0] > want[0]
    || (have[0] === want[0] && (have[1] > want[1] || (have[1] === want[1] && have[2] >= want[2])));
  process.exit(ok ? 0 : 1);
' "$NPM_VERSION"; then
  echo "npm $NPM_VERSION is too old for 'npm trust' (needs >= 11.15.0)." >&2
  echo "Run: npm install -g npm@latest" >&2
  exit 1
fi

echo "repo:     $REPO"
echo "workflow: $WORKFLOW"
echo

ok=0
already=0
skipped=0
failed=0

# A name that was JUST published is not visible on the registry's read path for
# a while, and a brand-new package name is slowest of all because the whole
# packument is new rather than one more version of an existing one. Retrying
# keeps this script usable immediately after a bootstrap publish, which is
# exactly when someone runs it. Without this, the very package you just
# published is the one reported "not published yet".
package_exists() {
  attempt=1
  while [ "$attempt" -le 6 ]; do
    if npm view "$1" version >/dev/null 2>&1; then
      return 0
    fi
    [ "$attempt" -eq 6 ] && return 1
    echo "  waiting for the registry to show $1 (attempt $attempt/6)"
    sleep 10
    attempt=$((attempt + 1))
  done
  return 1
}

for name in $NAMES; do
  # npm cannot attach a trusted publisher to a name that has never been
  # published. Those need one manual publish first.
  if ! package_exists "$name"; then
    echo "  not published yet, skipping   $name"
    skipped=$((skipped + 1))
    continue
  fi

  if [ "$CHECK" -eq 1 ]; then
    echo "--- $name"
    npm trust list "$name" 2>&1 | head -5 | sed 's/^/    /'
    continue
  fi

  # npm prompts for 2FA here and prints a URL to authenticate against, so it
  # needs the real terminal, which is why output is teed rather than captured:
  # swallowing it turns the prompt into a silent hang.
  echo ">>> $name"
  attempt_log=$(mktemp)
  status_file=$(mktemp)
  # npm's exit status has to survive the pipe. In POSIX sh a pipeline reports
  # only its LAST command, so `if npm ... | tee` would be testing tee, which
  # always succeeds — every failure would be reported as a success. Stash npm's
  # own status in a file inside the subshell and read it back.
  { npm trust github "$name" \
      --repo "$REPO" \
      --file "$WORKFLOW" \
      --allow-publish \
      --yes 2>&1; echo $? >"$status_file"; } | tee "$attempt_log"
  trust_status=$(cat "$status_file")
  rm -f "$status_file"

  if [ "$trust_status" -eq 0 ]; then
    echo "  trusted   $name"
    ok=$((ok + 1))
  elif grep -q 'trusted publisher config already exists' "$attempt_log"; then
    # E409. The package is already wired to a trusted publisher, which is the
    # desired end state, so re-running this script must not report it as a
    # failure. npm has no upsert here: changing an existing config means
    # deleting it first. Reporting this as FAILED sent a previous run down a
    # wrong diagnosis, because the summary blamed the 2FA setting instead.
    echo "  already configured   $name"
    already=$((already + 1))
  else
    echo "  FAILED    $name"
    failed=$((failed + 1))
  fi
  rm -f "$attempt_log"
  # npm rate limits bursts of writes.
  sleep 2
done

[ "$CHECK" -eq 1 ] && exit 0

echo
echo "trusted $ok, already configured $already, skipped $skipped, failed $failed"

if [ "$failed" -gt 0 ]; then
  echo
  echo "For a genuine failure the usual cause is a package set to 'require"
  echo "two-factor authentication and disallow tokens' on npmjs.com, which"
  echo "rejects trusted publishing. Note that an already-configured package is"
  echo "NOT counted here: npm returns 409 for those and they are reported"
  echo "separately, because re-running this script is meant to be safe."
  exit 1
fi

if [ "$skipped" -eq 0 ]; then
  echo
  echo "Every release package now trusts $REPO/$WORKFLOW."
  echo "Release with: gh workflow run $WORKFLOW -f version=<version> -f mode=dry-run"
fi

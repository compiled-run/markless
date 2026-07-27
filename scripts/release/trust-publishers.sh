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
skipped=0
failed=0

for name in $NAMES; do
  # npm cannot attach a trusted publisher to a name that has never been
  # published. Those need one manual publish first.
  if ! npm view "$name" version >/dev/null 2>&1; then
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
  # needs the real terminal. Capturing its output turns the prompt into a
  # silent hang.
  echo ">>> $name"
  if npm trust github "$name" \
    --repo "$REPO" \
    --file "$WORKFLOW" \
    --allow-publish \
    --yes
  then
    echo "  trusted   $name"
    ok=$((ok + 1))
  else
    echo "  FAILED    $name"
    failed=$((failed + 1))
  fi
  # npm rate limits bursts of writes.
  sleep 2
done

[ "$CHECK" -eq 1 ] && exit 0

echo
echo "trusted $ok, skipped $skipped, failed $failed"

if [ "$failed" -gt 0 ]; then
  echo
  echo "A package set to 'require two-factor authentication and disallow tokens'"
  echo "on npmjs.com rejects trusted publishing. That is the usual cause."
  exit 1
fi

if [ "$skipped" -eq 0 ]; then
  echo
  echo "Every release package now trusts $REPO/$WORKFLOW."
  echo "Release with: gh workflow run $WORKFLOW -f version=<version> -f mode=dry-run"
fi

#!/bin/sh
# Attach a GitHub Actions trusted publisher to every release package.
#
# npm stores trusted publishing per package, not per organization, so this is
# one call per package. After it runs, .github/workflows/release.yml can publish
# with no credential at all and npm generates a provenance attestation for each
# package automatically.
#
#   pnpm release:trust                          # attach for every release package
#   pnpm release:trust --only <name>            # just one, e.g. @markless/vitest-browser
#   pnpm release:trust --only <name> --otp 123456   # non-interactive, code from your app
#   pnpm release:trust --check                  # report current state, change nothing
#
# npm requires 2FA for every one of these calls. Passing --otp skips npm's
# browser round trip entirely and is the reliable path: the interactive flow
# needs stdout to be a real terminal, which is easy to lose through a pipe.
#
# npm's 2FA window is a few minutes, long enough to do all of them in one go.
#
# The package list and the repo are both DERIVED, never restated here. A
# hand-kept copy of the release set is exactly how verify-publish-ready.mjs
# silently stopped covering two packages.

set -u

WORKFLOW="release.yml"
CHECK=0
ONLY=""
OTP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    # Attaching one package should not mean sitting through a 409 and a rate-limit
    # sleep for every already-configured one. This is the path you want right after
    # bootstrapping a single new name.
    --only) shift; ONLY="${1:-}"; [ -z "$ONLY" ] && { echo "--only needs a package name" >&2; exit 1; } ;;
    # One code covers the whole run: npm's 2FA window outlives a handful of calls.
    --otp) shift; OTP="${1:-}"; [ -z "$OTP" ] && { echo "--otp needs a code" >&2; exit 1; } ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

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

if [ -n "$ONLY" ]; then
  # Validate against the derived set rather than trusting the argument, so a typo
  # cannot quietly register nothing and report success.
  if ! printf '%s\n' "$NAMES" | grep -qxF "$ONLY"; then
    echo "not a release package: $ONLY" >&2
    echo "known:" >&2
    printf '%s\n' "$NAMES" | sed 's/^/  /' >&2
    exit 1
  fi
  NAMES="$ONLY"
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

  # npm's 2FA flow prints a URL on STDOUT and waits for ENTER on STDIN, so both
  # must stay attached to the real terminal. Piping stdout through `tee` to
  # capture the 409 text made stdout a pipe, npm saw no TTY, and it gave up with
  # EOTP instead of prompting — the capture broke the very thing the script
  # exists to do.
  #
  # So only STDERR is redirected. Errors (including the 409) land in a file we
  # can classify, stdout and stdin stay on the terminal for the prompt, and the
  # captured stderr is echoed afterwards so nothing is hidden. No pipe means
  # npm's exit status needs no rescuing either.
  echo ">>> $name"
  attempt_log=$(mktemp)
  if [ -n "$OTP" ]; then
    npm trust github "$name" \
      --repo "$REPO" \
      --file "$WORKFLOW" \
      --allow-publish \
      --otp "$OTP" \
      --yes 2>"$attempt_log"
  else
    npm trust github "$name" \
      --repo "$REPO" \
      --file "$WORKFLOW" \
      --allow-publish \
      --yes 2>"$attempt_log"
  fi
  trust_status=$?
  [ -s "$attempt_log" ] && cat "$attempt_log" >&2

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

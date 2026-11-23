#!/bin/bash
# Forced command for a mini's key on the PC's phone sshd (authorized_keys: command="/opt/pc-phones/agent <mini> <port>,<port>").
# The caller sends "<runner commit> <command> <args>"; exit 75 means not now, and the runner's own phones take the work.
set -uo pipefail
. /opt/pc-phones/env.sh
locks=$HOME/locks
mkdir -p "$locks" "$HOME/code" "$HOME/dragon"
export PC_PHONES_AGENT=/opt/pc-phones/agent

# A checkout of a commit some origin branch holds, installed; at most two per repository, never one a chunk is using.
prepare() {
	local kind=$1 commit=$2 repo parent
	if [ "$kind" = code ]; then repo=$HOME/wt/markless parent=$HOME/code; else repo=$HOME/wt/dragon parent=$HOME/dragon; fi
	local dir=$parent/$commit
	exec 9>"$locks/prepare-$kind"
	flock -n 9 || return 0
	[ -e "$dir/.ready" ] && return 0
	git -C "$repo" fetch -q origin || return 1
	[ -n "$(git -C "$repo" branch -r --contains "$commit" 2>/dev/null)" ] || { echo "$commit is on no branch of origin" >"$dir.log"; return 1; }
	rm -rf "$dir"
	git -C "$repo" worktree prune
	git -C "$repo" worktree add -q --detach "$dir" "$commit" >"$dir.log" 2>&1 || return 1
	(cd "$dir" && pnpm install --frozen-lockfile) >>"$dir.log" 2>&1 || return 1
	touch "$dir/.ready"
	ls -1dt "$parent"/*/ | tail -n +3 | while read -r old; do
		old=${old%/}
		flock -n -x "$locks/use-$(basename "$old")" rm -rf "$old" "$old.log"
	done
	git -C "$repo" worktree prune
}

if [ "${1:-}" = prepare-dragon ]; then
	[[ ${2:-} =~ ^[0-9a-f]{40}$ ]] || exit 2
	prepare dragon "$2"
	exit
fi
if [ "${1:-}" = prepare-code ]; then
	prepare code "$2"
	exit
fi

caller=${1:?caller} ports=${2:?ports}
read -r -a words <<<"${SSH_ORIGINAL_COMMAND:-}"
commit=${words[0]:-} command=${words[1]:-}
[[ $commit =~ ^[0-9a-f]{40}$ ]] || { echo "not a commit: $commit" >&2; exit 2; }
case $command in
	boot) port=${words[3]:-} ;;
	answers | stop) port=${words[2]:-} ;;
	run) port=${words[4]:-} ;;
	put) port= ;;
	*) echo "unknown command: $command" >&2; exit 2 ;;
esac
if [ -n "$port" ] && [[ ",$ports," != *",$port,"* ]]; then echo "$caller has no port $port here" >&2; exit 2; fi
if [ -e /opt/markless-runner/stop ] && [ "$command" != stop ]; then echo "the PC is paused for games" >&2; exit 75; fi
if [ ! -e "$HOME/code/$commit/.ready" ]; then
	setsid "$0" prepare-code "$commit" </dev/null >/dev/null 2>&1 &
	echo "preparing a checkout of $commit: $(tail -1 "$HOME/code/$commit.log" 2>/dev/null)" >&2
	exit 75
fi
exec flock -s "$locks/use-$commit" node "$HOME/code/$commit/packages/mobile/src/runner/pc-agent.ts" "$caller" "${words[@]:1}"

#!/bin/bash
# On a mini, the forced command of the PC's link key (~/.pc-phones/hold.sh <port>). A new link ends the one before it, which may
# belong to a PC that vanished without closing it and so still holds the forwarded port.
pidfile=$HOME/.pc-phones/link-$1.pid
old=$(cat "$pidfile" 2>/dev/null)
if [ -n "$old" ] && [ "$old" != "$PPID" ] && [ "$(ps -o uid= -p "$old" | tr -d ' ')" = "$(id -u)" ]; then
	case $(ps -o comm= -p "$old") in *sshd*) kill "$old" 2>/dev/null ;; esac
fi
echo "$PPID" >"$pidfile"
while kill -0 "$PPID" 2>/dev/null; do sleep 30; done

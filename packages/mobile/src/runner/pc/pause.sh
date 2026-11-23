#!/bin/bash
# While the PC is paused (the agent refuses new work), wait for running chunks, then stop every emulator.
. /opt/pc-phones/env.sh
for lock in "$HOME"/locks/use-*; do [ -e "$lock" ] && flock -x "$lock" true; done
for serial in $(adb devices | awk '$1 ~ /^emulator-/ {print $1}'); do adb -s "$serial" emu kill; done
while [ -e /opt/markless-runner/stop ]; do sleep 30; done

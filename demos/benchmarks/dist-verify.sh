#!/bin/zsh
set -e
cd /Users/jacksm5pro/dev/open-source/markless-octane-bench/demos/benchmarks
for b in ssr-throughput streaming-ssr news computed-chain memo-wall dbmon todomvc chat-stream async-waterfall bundle-size codegen-size; do
	node bench.mjs $b > /tmp/bench-verify-$b.log 2>&1 && echo "$b PASS" || { echo "$b FAIL"; exit 1; }
done
echo ALL_BENCHMARKS_GREEN

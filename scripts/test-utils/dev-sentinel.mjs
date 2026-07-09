#!/usr/bin/env node
// Agent usage: MARKLESS_DEV_ORIGIN=http://localhost:3001 node scripts/test-utils/dev-sentinel.mjs
// Optional: pass the origin as argv[2], or add --once to poll only one time.

const ENDPOINT_PATH = '/__markless/violations';
const POLL_MS = 5000;
const QUIET_OWNER_STOP_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const once = args.includes('--once');
const origin = args.find((arg) => arg !== '--once') ?? process.env.MARKLESS_DEV_ORIGIN ?? 'http://localhost:3001';
let seenBytes = 0;
let serverAwaySince = 0;

while (true) {
	try {
		const response = await fetch(new URL(ENDPOINT_PATH, origin));
		if (!response.ok) throw new Error(String(response.status));
		serverAwaySince = 0;
		const body = await response.text();
		const next = body.slice(seenBytes);
		seenBytes = body.length;
		const events = next.split('\n').filter(Boolean).map((line) => JSON.parse(line));
		if (events.length > 0) {
			console.error(JSON.stringify(events, null, 2));
			process.exit(2);
		}
	} catch {
		if (!serverAwaySince) serverAwaySince = Date.now();
		else if (Date.now() - serverAwaySince > QUIET_OWNER_STOP_MS) process.exit(0);
	}

	if (once) process.exit(0);
	await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

#!/usr/bin/env node
// A runner out of memory stops answering and its job is lost without a log, so this stops the command first and says what held the memory.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descendants, processLabel } from './unit-budget.mjs';

const MB = 2 ** 20;
const FLOOR_MB = Number(process.env.MARKLESS_MEMORY_FLOOR_MB ?? 1024);

/** Resident megabytes by process label, largest first. */
export function largestByLabel(procs, labelOf, limit = 6) {
	const sums = new Map();
	for (const proc of procs) {
		const label = labelOf(proc);
		sums.set(label, (sums.get(label) ?? 0) + proc.rss);
	}
	return [...sums]
		.sort(([, a], [, b]) => b - a)
		.slice(0, limit)
		.map(([label, bytes]) => `${label} ${Math.round(bytes / MB)} MB`)
		.join(', ');
}

const labelOf = ({ pid }) => {
	try {
		return processLabel(
			readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean),
		);
	} catch {
		return 'exited';
	}
};

const availableMb = () =>
	Number(/MemAvailable:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0) / 1024;

async function main(command) {
	if (!command.length) {
		console.error('usage: node scripts/ci/memory-watch.mjs -- <command...>');
		return 2;
	}
	const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
	const closed = new Promise((done) =>
		child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0))),
	);
	if (process.platform !== 'linux') return closed;
	const pageSize = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }));
	const started = performance.now();
	let peak = { bytes: 0, atS: 0, held: '' };
	let lowestMb = Infinity;
	let exhausted;
	const timer = setInterval(() => {
		const procs = descendants(process.pid, pageSize);
		const bytes = procs.reduce((sum, proc) => sum + proc.rss, 0);
		const atS = Math.round((performance.now() - started) / 1000);
		const available = availableMb();
		lowestMb = Math.min(lowestMb, available);
		if (bytes > peak.bytes) peak = { bytes, atS, held: largestByLabel(procs, labelOf) };
		if (available >= FLOOR_MB || exhausted) return;
		exhausted = `memory-watch: ${Math.round(available)} MB left on the runner ${atS} s in, under the ${FLOOR_MB} MB floor; stopping the command. Held: ${largestByLabel(procs, labelOf)}`;
		console.error(exhausted);
		for (const proc of procs) {
			try {
				process.kill(proc.pid, 'SIGKILL');
			} catch {}
		}
	}, 1000);
	const code = await closed;
	clearInterval(timer);
	console.log(
		`memory-watch: peak ${Math.round(peak.bytes / MB)} MB in the command's processes ${peak.atS} s in (${peak.held}); lowest available on the runner ${Math.round(lowestMb)} MB`,
	);
	if (exhausted) console.error(exhausted);
	return exhausted ? 1 : code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const separator = process.argv.indexOf('--');
	main(separator === -1 ? [] : process.argv.slice(separator + 1)).then((code) =>
		process.exit(code),
	);
}

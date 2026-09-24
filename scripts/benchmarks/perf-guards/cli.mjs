#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ANCHORS_PATH } from './config.mjs';
import { evaluate, formatReport, isLean } from './evaluate.mjs';
import { measure } from './measure.mjs';

export const LAST_MEASUREMENT = join(tmpdir(), 'markless-perf-guards', 'last-measurement.json');
const GUARDS = ['runtime', 'construct', 'execution', 'lean', 'all'];
const USAGE = `usage:
  node scripts/benchmarks/perf-guards/cli.mjs check [--no-build] [--sites bench,docs] [--from <measurement.json>]
  node scripts/benchmarks/perf-guards/cli.mjs measure [--no-build] [--out <file>]
  node scripts/benchmarks/perf-guards/cli.mjs accept <${GUARDS.join('|')}> <subject|*> --reason "<why>" [--from-last] [--no-build]`;

export function readAnchors(path = ANCHORS_PATH) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeAnchors(anchors, path = ANCHORS_PATH) {
	writeFileSync(path, `${JSON.stringify(anchors, null, '\t')}\n`);
}

export function saveLastMeasurement(measurement) {
	mkdirSync(dirname(LAST_MEASUREMENT), { recursive: true });
	writeFileSync(LAST_MEASUREMENT, JSON.stringify(measurement));
}

/** Re-anchors one guard subject (or every subject with '*') to the measured value, logging the reason. */
export function accept(
	anchors,
	measurement,
	guard,
	subject,
	reason,
	date = new Date().toISOString().slice(0, 10),
) {
	if (!reason?.trim())
		throw new Error('accept needs --reason "<one line: why this cost is intended>"');
	if (!GUARDS.includes(guard))
		throw new Error(`unknown guard ${guard}; one of ${GUARDS.join(', ')}`);
	const next = structuredClone(anchors);
	next.history ??= [];
	const log = (g, s, from, to) => {
		if (JSON.stringify(from) === JSON.stringify(to)) return;
		next.history.push({
			date,
			guard: g,
			subject: s,
			from: from ?? null,
			to,
			reason: reason.trim(),
		});
	};
	const all = subject === '*' || guard === 'all';
	const pick = (s) => all || s === subject;
	let matched = 0;
	// A bulk re-anchor of per-module sizes is one history line, not one per module.
	const moved = [];
	const logModule = (id, from, to) => {
		if (!all) return log('runtime', id, from, to);
		if (JSON.stringify(from) !== JSON.stringify(to)) moved.push(id);
	};
	if (guard === 'construct' || guard === 'all') {
		for (const [construct, cost] of Object.entries(measurement.constructGlue ?? {})) {
			if (!pick(construct)) continue;
			next.constructGlue ??= {};
			log('construct', construct, next.constructGlue[construct], cost.bytesPerInstance);
			next.constructGlue[construct] = cost.bytesPerInstance;
			matched++;
		}
	}
	for (const [, siteResult] of Object.entries(measurement.sites)) {
		if ((guard === 'runtime' || guard === 'all') && siteResult.runtimeModules) {
			next.runtimeModules ??= {};
			const ids = new Set([
				...Object.keys(siteResult.runtimeModules),
				...Object.keys(next.runtimeModules),
			]);
			for (const id of [...ids].sort()) {
				if (!pick(id)) continue;
				const bytes = siteResult.runtimeModules[id];
				logModule(id, next.runtimeModules[id], bytes ?? null);
				if (bytes === undefined) delete next.runtimeModules[id];
				else next.runtimeModules[id] = bytes;
				matched++;
			}
			next.runtimeModules = Object.fromEntries(
				Object.keys(next.runtimeModules)
					.sort()
					.map((id) => [id, next.runtimeModules[id]]),
			);
		}
		for (const [name, cost] of Object.entries(siteResult.execution ?? {})) {
			if ((guard !== 'execution' && guard !== 'all') || !pick(name)) continue;
			next.execution ??= {};
			const value = {
				executedChars: cost.executedChars,
				functions: cost.functions,
				modules: cost.modules,
			};
			log('execution', name, next.execution[name], value);
			next.execution[name] = value;
			matched++;
		}
		for (const [route, actions] of Object.entries(siteResult.lean ?? {})) {
			if ((guard !== 'lean' && guard !== 'all') || !pick(route)) continue;
			next.lean ??= {};
			next.allowFullResume ??= [];
			const leanNow = Object.keys(actions)
				.filter((name) => isLean(actions[name]))
				.sort();
			for (const name of next.lean[route] ?? []) {
				if (actions[name] === undefined || isLean(actions[name])) continue;
				if (next.allowFullResume.some((a) => a.route === route && a.action === name))
					continue;
				next.allowFullResume.push({ route, action: name, reason: reason.trim() });
			}
			log('lean', route, next.lean[route], leanNow);
			next.lean[route] = leanNow;
			matched++;
		}
	}
	if (!matched) throw new Error(`no measured ${guard} subject matches "${subject}"`);
	if (moved.length)
		next.history.push({
			date,
			guard: 'runtime',
			subject: '*',
			from: null,
			to: `${moved.length} runtime modules re-anchored: ${moved.join(', ')}`,
			reason: reason.trim(),
		});
	return next;
}

function flag(args, name) {
	const i = args.indexOf(name);
	if (i < 0) return undefined;
	const value = args[i + 1];
	args.splice(i, 2);
	return value;
}

async function main(argv) {
	const args = [...argv];
	const command = args.shift();
	const build = !args.includes('--no-build');
	const fromLast = args.includes('--from-last');
	const from = flag(args, '--from');
	const out = flag(args, '--out');
	const reason = flag(args, '--reason');
	const sites = flag(args, '--sites')?.split(',');
	const positional = args.filter((a) => !a.startsWith('--'));
	const log = (message) => console.error(`[perf-guard] ${message}`);
	const load = async () => {
		if (from || fromLast) return JSON.parse(readFileSync(from ?? LAST_MEASUREMENT, 'utf8'));
		const measurement = await measure({ build, log, ...(sites ? { sites } : {}) });
		saveLastMeasurement(measurement);
		return measurement;
	};
	if (command === 'measure') {
		const measurement = await load();
		const text = JSON.stringify(measurement, null, '\t');
		if (out) writeFileSync(out, `${text}\n`);
		else console.log(text);
		return 0;
	}
	if (command === 'check') {
		const result = evaluate(await load(), readAnchors());
		console.log(formatReport(result));
		return result.failures.length ? 1 : 0;
	}
	if (command === 'accept') {
		const [guard, subject] = positional;
		if (!guard || !subject) throw new Error(USAGE);
		const next = accept(readAnchors(), await load(), guard, subject, reason);
		writeAnchors(next);
		console.log(`anchors updated in ${ANCHORS_PATH}`);
		return 0;
	}
	console.error(USAGE);
	return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(error) => {
			console.error(error.message ?? error);
			process.exit(1);
		},
	);
}

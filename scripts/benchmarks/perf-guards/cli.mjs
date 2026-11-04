#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
	formatChange,
	labelOf,
	openMergeBaseCheckout,
	readAnchorsWithChanges,
	recordChange,
} from '../anchor-ledger.mjs';
import { evaluate, formatReport, isLean, LOAD_PLATFORM, routeKey } from './evaluate.mjs';
import { measure } from './measure.mjs';

export const LAST_MEASUREMENT = join(tmpdir(), 'markless-perf-guards', 'last-measurement.json');
const GUARDS = ['runtime', 'construct', 'execution', 'lean', 'resume', 'load', 'all'];
const USAGE = `usage:
  node scripts/benchmarks/perf-guards/cli.mjs check [--no-build] [--sites bench,docs] [--from <measurement.json>]
  node scripts/benchmarks/perf-guards/cli.mjs measure [--no-build] [--out <file>]
  node scripts/benchmarks/perf-guards/cli.mjs accept <${GUARDS.join('|')}> <subject|*> --reason "<why>" [--from-last | --from <file>] [--base <file>] [--no-build]
    accept records this tree's measurement minus its merge-base's; without --base it measures the merge-base in a throwaway checkout`;

/** anchors.json with every pending change file in scripts/benchmarks/anchor-changes applied. */
export function readAnchors() {
	return readAnchorsWithChanges('perf-guards');
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
	if (guard === 'resume' || guard === 'all') {
		for (const [shape, cost] of Object.entries(measurement.resumeRows ?? {})) {
			if (!pick(shape)) continue;
			next.resumeRows ??= {};
			log('resume', shape, next.resumeRows[shape], cost.bytesPerRow);
			next.resumeRows[shape] = cost.bytesPerRow;
			matched++;
		}
		for (const [site, siteResult] of Object.entries(measurement.sites))
			for (const [route, result] of Object.entries(siteResult.routes)) {
				const key = routeKey(site, route);
				if (!result.resumeData || !pick(key)) continue;
				next.resumeData ??= {};
				const value = { raw: result.resumeData.raw, gzip: result.resumeData.gzip };
				log('resume', key, next.resumeData[key], value);
				next.resumeData[key] = value;
				matched++;
			}
	}
	if (guard === 'load' || guard === 'all')
		for (const [site, siteResult] of Object.entries(measurement.sites))
			for (const [route, result] of Object.entries(siteResult.routes)) {
				const key = routeKey(site, route);
				if (!result.load || !pick(key)) continue;
				next.loadWeight ??= {};
				const platform = measurement.platform ?? LOAD_PLATFORM;
				const anchors = (next.loadWeight[platform] ??= {});
				const value = {
					executedChars: result.load.executedChars,
					jsGzipBytes: result.load.jsGzipBytes,
				};
				log('load', `${key} (${platform})`, anchors[key], value);
				anchors[key] = value;
				matched++;
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
	if (!matched)
		throw Object.assign(new Error(`no measured ${guard} subject matches "${subject}"`), {
			code: 'NO_MEASURED_SUBJECT',
		});
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

/** Which of this branch's earlier entries an accept of `guard subject` replaces. */
export function covers(guard, subject, platform = LOAD_PLATFORM) {
	return (entry) => {
		const label = labelOf(entry);
		if (guard !== 'all' && label.guard !== guard) return false;
		if (entry.path[0] === 'loadWeight' && entry.path[1] !== platform) return false;
		if (subject === '*' || guard === 'all') return true;
		if (entry.path[0] === 'allowFullResume')
			return (entry.append ?? []).some((exemption) => exemption.route === subject);
		return label.subject === subject || label.subject.startsWith(`${subject} (`);
	};
}

/** Measures the merge-base with its own guard code, the way the anchors on main were measured. */
function measureMergeBase({ sites }) {
	const checkout = openMergeBaseCheckout({ log: (message) => console.error(message) });
	try {
		const out = join(checkout.root, 'merge-base-measurement.json');
		execFileSync(
			'node',
			[
				'scripts/benchmarks/perf-guards/cli.mjs',
				'measure',
				'--out',
				out,
				...(sites ? ['--sites', sites.join(',')] : []),
			],
			{
				cwd: checkout.root,
				stdio: ['ignore', 'ignore', 'inherit'],
				env: { ...process.env, TMPDIR: mkdtempSync(join(checkout.root, '.tmp-')) },
			},
		);
		return JSON.parse(readFileSync(out, 'utf8'));
	} finally {
		checkout.close();
	}
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
	const baseFile = flag(args, '--base');
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
		if (!reason?.trim())
			throw new Error('accept needs --reason "<one line: why this cost is intended>"');
		const measurement = await load();
		const base = baseFile
			? JSON.parse(readFileSync(baseFile, 'utf8'))
			: { ...measureMergeBase({ sites }), platform: LOAD_PLATFORM };
		const platform = measurement.platform ?? LOAD_PLATFORM;
		if (base.platform && base.platform !== platform)
			throw new Error(
				`the merge-base was measured on ${base.platform} and this tree on ${platform}; measure both on one platform`,
			);
		const { file, changes } = recordChange(
			'perf-guards',
			{
				head: (anchors) => accept(anchors, measurement, guard, subject, reason),
				base: (anchors) => {
					try {
						return accept(anchors, { ...base, platform }, guard, subject, reason);
					} catch (error) {
						if (error.code === 'NO_MEASURED_SUBJECT') return anchors;
						throw error;
					}
				},
				covers: covers(guard, subject, platform),
			},
			{ reason },
		);
		console.log(
			changes.length
				? `recorded in ${file}:\n${changes.map((entry) => `  ${formatChange(entry)}`).join('\n')}`
				: `${guard} ${subject}: this tree measures the same as its merge-base; nothing recorded`,
		);
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

#!/usr/bin/env node
// Holdout lane: builds each untouched holdout app as-is and with forced markless() options, serves it behind
// the runner's proxy (HTTP/2 + brotli, shaped listener for the constrained profile), and measures every
// route in Chromium and WebKit. See README.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProxy } from '../proxy.mjs';
import { appliedProfile, needsShapedListener, selectProfiles } from '../lib/profiles.mjs';
import { launch, playwrightVersion } from '../lib/session.mjs';
import { LANES, VARIANTS, repoRoot, selectLanes } from './lanes.mjs';
import { buildApp, freePort, serveApp } from './lib/app-server.mjs';
import { startHostPin } from './lib/host-pin.mjs';
import { measureRoute } from './lib/measure.mjs';
import { writeReport } from './report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (v) =>
	v
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

export const DEFAULTS = {
	lanes: Object.keys(LANES),
	variants: ['default', 'packed'],
	browsers: ['chromium', 'webkit'],
	profiles: ['normal', 'constrained'],
	loadVisits: 3,
	maxControls: 12,
	maxLinks: 4,
	quietMs: 500,
	settleTimeoutMs: 20000,
	actionTimeoutMs: 15000,
	responseWaitMs: 300,
	coverage: true,
	lock: '/private/tmp/mlbench-timing.lock',
	build: true,
};

export function parseArgs(argv) {
	const o = { ...DEFAULTS };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => argv[++i];
		switch (a) {
			case '--lanes':
				o.lanes = list(next());
				break;
			case '--variants':
				o.variants = list(next());
				break;
			case '--browsers':
				o.browsers = list(next());
				break;
			case '--profiles':
				o.profiles = list(next());
				break;
			case '--load-visits':
				o.loadVisits = Number(next());
				break;
			case '--max-controls':
				o.maxControls = Number(next());
				break;
			case '--max-links':
				o.maxLinks = Number(next());
				break;
			case '--out':
				o.out = next();
				break;
			case '--lock':
				o.lock = next();
				break;
			case '--no-lock':
				o.lock = null;
				break;
			case '--no-build':
				o.build = false;
				break;
			case '--no-coverage':
				o.coverage = false;
				break;
			case '--repo':
				o.repo = next();
				break;
			case '--label':
				o.label = next();
				break;
			default:
				throw new Error(`unknown argument ${a}`);
		}
	}
	for (const v of o.variants)
		if (!(v in VARIANTS))
			throw new Error(`unknown variant ${v} (known: ${Object.keys(VARIANTS).join(', ')})`);
	return o;
}

async function withLock(lock, owner, fn) {
	if (!lock) return fn();
	while (true) {
		try {
			fs.mkdirSync(lock);
			break;
		} catch {
			await sleep(1000);
		}
	}
	fs.writeFileSync(
		path.join(lock, 'owner'),
		`${owner} ${process.pid} ${new Date().toISOString()}\n`,
	);
	const release = () => fs.rmSync(lock, { recursive: true, force: true });
	const onSignal = () => {
		release();
		process.exit(130);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);
	try {
		return await fn();
	} finally {
		process.off('SIGINT', onSignal);
		process.off('SIGTERM', onSignal);
		release();
	}
}

/**
 * Measures `lanes` (objects as in lanes.mjs) with `serve(lane, variant) -> { origin, stop }`.
 * Appends one JSON record per measurement to <out>/records.jsonl.
 */
export async function measureLanes({ lanes, variants, serve, opts, out, log = console.error }) {
	const profiles = selectProfiles(opts.profiles);
	const recordsFile = path.join(out, 'records.jsonl');
	for (const lane of lanes) {
		for (const variant of variants) {
			// The lock also covers the build: under contention a wait-until-free loop never finds a gap.
			await withLock(opts.lock, `holdout ${lane.name}/${variant}`, async () => {
				const server = await serve(lane, variant);
				const shaped = profiles
					.filter(needsShapedListener)
					.map((p) => ({ name: p.name, port: 0, network: p.network }));
				const pin = await startHostPin(server.origin);
				const proxy = await startProxy({
					upstream: pin.origin,
					port: await freePort(),
					shaped,
				});
				try {
					for (const browserName of opts.browsers) {
						const browser = await launch(browserName);
						try {
							for (const profile of profiles) {
								const applied = appliedProfile(profile, browserName);
								const origin = needsShapedListener(profile)
									? proxy.shapedUrls[profile.name]
									: proxy.url;
								const cell = {
									browser: browserName,
									profile: profile.name,
									cpu: applied.cpu.slowdown,
								};
								for (const route of lane.routes) {
									log(
										`${lane.name} ${variant} ${browserName} ${profile.name} ${route}`,
									);
									const records = await measureRoute(browser, {
										lane,
										route,
										url: origin + route,
										cell,
										opts: { ...opts, log },
									});
									const lines = records.map((r) =>
										JSON.stringify({
											lane: lane.name,
											variant,
											browser: browserName,
											profile: profile.name,
											cpuSlowdown: cell.cpu,
											...r,
										}),
									);
									fs.appendFileSync(recordsFile, `${lines.join('\n')}\n`);
								}
							}
						} finally {
							await browser.close();
						}
					}
				} finally {
					await proxy.close();
					await pin.close();
					await server.stop();
				}
			});
		}
	}
}

const today = () => new Date().toISOString().slice(0, 10);
const git = (repo, ...args) => {
	try {
		return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
};

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const out = path.resolve(
		opts.out ??
			path.join(
				here,
				'../../results',
				`holdout-${today()}${opts.label ? `-${opts.label}` : ''}`,
			),
	);
	fs.mkdirSync(out, { recursive: true });
	fs.rmSync(path.join(out, 'records.jsonl'), { force: true });
	const repo = path.resolve(opts.repo ?? repoRoot);
	const lanes = selectLanes(opts.lanes, repo);
	const builds = {};
	const meta = {
		date: today(),
		repo,
		revision: git(repo, 'rev-parse', '--short=8', 'HEAD'),
		dirty: !!git(repo, 'status', '--porcelain', '--', 'packages'),
		playwright: playwrightVersion,
		node: process.version,
		browsers: opts.browsers,
		profiles: opts.profiles,
		variants: Object.fromEntries(opts.variants.map((v) => [v, VARIANTS[v]])),
		options: { ...opts, out: undefined },
		lanes: Object.fromEntries(
			lanes.map((l) => [
				l.name,
				{ root: path.relative(repo, l.root), rendering: l.rendering, routes: l.routes },
			]),
		),
		builds,
		notes: [],
	};
	const serve = async (lane, variant) => {
		if (opts.build) {
			console.error(`build ${lane.name} ${variant}`);
			builds[`${lane.name}/${variant}`] = await buildApp(lane, variant, VARIANTS[variant]);
		}
		return serveApp(lane, variant, VARIANTS[variant]);
	};
	await measureLanes({ lanes, variants: opts.variants, serve, opts, out });
	fs.writeFileSync(path.join(out, 'run.json'), `${JSON.stringify(meta, null, '\t')}\n`);
	writeReport(out, meta);
	console.log(fs.readFileSync(path.join(out, 'summary.md'), 'utf8'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	main().then(
		() => process.exit(0),
		(error) => {
			console.error(error);
			process.exit(1);
		},
	);
}

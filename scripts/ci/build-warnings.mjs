#!/usr/bin/env node
// Builds the docs site and the demo apps and fails on anything a build prints to stderr: bundler, Vite, Nitro and Node all warn there.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const GUARDED_BUILDS = [
	'website',
	'demos/live-feed',
	'demos/live-feed-ssr',
	'demos/music-player',
	'demos/music-player-ssr',
	'demos/same-module-branch',
	'demos/static-router',
];

/** Patterns for stderr lines a build may print; each entry needs a one-line reason the warned behaviour is intended. */
export const ALLOWED_WARNINGS = [];

// Rolldown's timing report: how long plugin callbacks took, not a defect in the build.
const TIMING_REPORT_START = /^\[PLUGIN_TIMINGS\]/;
const TIMING_REPORT_END = /InputOptions\.checks#bundlertimings/;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The warning lines in one build's stderr, timing reports and blank lines left out. */
export function buildWarnings(stderr) {
	const warnings = [];
	let inTimingReport = false;
	for (const raw of stderr.split('\n')) {
		const line = raw.replace(ANSI, '').trimEnd();
		if (inTimingReport) {
			if (TIMING_REPORT_END.test(line)) inTimingReport = false;
			continue;
		}
		if (TIMING_REPORT_START.test(line)) {
			inTimingReport = !TIMING_REPORT_END.test(line);
			continue;
		}
		if (!line.trim()) continue;
		if (ALLOWED_WARNINGS.some((allowed) => allowed.test(line))) continue;
		warnings.push(line);
	}
	return warnings;
}

function run(dir) {
	return new Promise((done, fail) => {
		const child = spawn('pnpm', ['--dir', dir, 'run', 'build'], {
			cwd: repoRoot,
			env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', fail);
		child.on('close', (code) => done({ code, stderr }));
	});
}

async function main() {
	const only = process.argv.slice(2);
	const builds = only.length ? GUARDED_BUILDS.filter((dir) => only.includes(dir)) : GUARDED_BUILDS;
	let failed = false;
	for (const dir of builds) {
		console.log(`build-warnings: building ${dir}`);
		const { code, stderr } = await run(dir);
		const warnings = buildWarnings(stderr);
		if (code !== 0) {
			failed = true;
			console.error(`build-warnings: ${dir} build exited with ${code}\n${stderr.slice(-4000)}`);
		} else if (warnings.length) {
			failed = true;
			console.error(`build-warnings: ${dir} printed ${warnings.length} warning lines:`);
			for (const line of warnings) console.error(`  ${line}`);
		} else {
			console.log(`build-warnings: ${dir} built with no warnings`);
		}
	}
	if (failed) {
		console.error(
			'build-warnings: fix each warning at its cause (docs/ci-process.md, "Build warnings").',
		);
		process.exit(1);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

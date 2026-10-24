#!/usr/bin/env node
// Builds the docs site and the demo apps and fails on anything a build prints to stderr (bundler, Vite, Nitro and Node all warn there) or on Node-only code in what it wrote for the browser.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientOutputDir, scanBrowserOutput } from './browser-output-scan.mjs';

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

/** Warnings a build may print, each with the one-line reason it stays. */
export const ALLOWED_WARNINGS = [
	{
		build: 'website',
		pattern: /^\(!\) Some chunks are larger than \d+ kB after minification/,
		reason:
			'Open owner decision: the <Code> compile worker is 3.4 MB, the highlighter pack 654 kB, and the full figure render data a browser-side render() loads is up to 2.0 MB; no page load or link navigation fetches the last.',
	},
];

// Rolldown's timing report: how long plugin callbacks took, not a defect in the build.
const TIMING_REPORT_START = /^\[PLUGIN_TIMINGS\]/;
const TIMING_REPORT_END = /InputOptions\.checks#bundlertimings/;
// Vite's reporter prints its plugin name, the warning, then advice lines starting with "- ".
const REPORTER_HEADER = /^\[plugin builtin:vite-reporter\]\s*$/;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The warnings in one build's stderr, one entry per warning, timing reports left out. */
export function buildWarnings(stderr, build = '') {
	const warnings = [];
	let inTimingReport = false;
	let inReporterAdvice = false;
	let header = '';
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
		if (inReporterAdvice && line.startsWith('- ')) continue;
		inReporterAdvice = false;
		if (!line.trim()) continue;
		if (REPORTER_HEADER.test(line)) {
			header = line;
			continue;
		}
		const warning = header ? `${header} ${line}` : line;
		inReporterAdvice = header !== '';
		header = '';
		const allowed = ALLOWED_WARNINGS.some(
			(entry) => entry.build === build && entry.pattern.test(line),
		);
		if (!allowed) warnings.push(warning);
	}
	if (header) warnings.push(header);
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
		const warnings = buildWarnings(stderr, dir);
		if (code !== 0) {
			failed = true;
			console.error(`build-warnings: ${dir} build exited with ${code}\n${stderr.slice(-4000)}`);
		} else if (warnings.length) {
			failed = true;
			console.error(`build-warnings: ${dir} printed ${warnings.length} warnings:`);
			for (const line of warnings) console.error(`  ${line}`);
		} else {
			console.log(`build-warnings: ${dir} built with no warnings`);
		}
		if (code !== 0) continue;
		const buildDir = resolve(repoRoot, dir);
		const nodeCode = scanBrowserOutput(clientOutputDir(buildDir), buildDir);
		if (nodeCode.length) {
			failed = true;
			console.error(`build-warnings: ${dir} ships Node-only code to the browser:`);
			for (const finding of nodeCode) console.error(`  ${finding}`);
		}
	}
	if (failed) {
		console.error(
			'build-warnings: fix each warning and each Node-only finding at its cause (docs/ci-process.md, "Build warnings").',
		);
		process.exit(1);
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

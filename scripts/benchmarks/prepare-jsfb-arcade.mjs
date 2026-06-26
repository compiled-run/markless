#!/usr/bin/env node
import { cp, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_DIR = join(ROOT_DIR, 'demos/js-framework-benchmark/frameworks/keyed/arcade');

function parseArgs(argv) {
	const args = {};
	for (let index = 2; index < argv.length; index++) {
		const value = argv[index];
		if (value === '--') continue;
		if (value === '--jsfb-root') args.jsfbRoot = argv[++index];
		else if (value === '--help' || value === '-h') args.help = true;
		else throw new Error(`Unknown argument: ${value}`);
	}
	return args;
}

function printUsage() {
	console.log(`Usage:
  node scripts/benchmarks/prepare-jsfb-arcade.mjs --jsfb-root <path>

Copies the repo-owned Arcade keyed benchmark fixture into a JS Framework
Benchmark checkout at frameworks/keyed/arcade.
`);
}

async function assertDirectory(path, label) {
	try {
		const info = await stat(path);
		if (!info.isDirectory()) throw new Error();
	} catch {
		throw new Error(`${label} does not exist or is not a directory: ${path}`);
	}
}

async function main() {
	const args = parseArgs(process.argv);
	if (args.help) {
		printUsage();
		return;
	}

	const jsfbRoot = resolve(
		args.jsfbRoot ?? process.env.JSFB_ROOT ?? join(ROOT_DIR, '../js-framework-benchmark'),
	);
	await assertDirectory(jsfbRoot, 'JS Framework Benchmark root');
	await assertDirectory(FIXTURE_DIR, 'Arcade benchmark fixture');

	const targetDir = join(jsfbRoot, 'frameworks/keyed/arcade');
	await rm(targetDir, { recursive: true, force: true });
	await cp(FIXTURE_DIR, targetDir, { recursive: true });

	console.log(`Copied Arcade JSFB fixture to ${targetDir}`);
	console.log(`Use ARCADE_REPO_ROOT=${ROOT_DIR} when building the benchmark app.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});

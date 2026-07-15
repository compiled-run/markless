#!/usr/bin/env node
// markless doctor — environment and build sanity for this app, with targeted
// guidance for humans and AI agents. Node-only: no browser required.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const results = [];
const check = (name, ok, detail, hint) => {
	results.push({ name, ok, detail, hint });
	console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
	if (!ok && hint) console.log(`      hint: ${hint}`);
};

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

const marklessDeps = Object.entries(allDeps).filter(([name]) => name.startsWith('@markless/'));
check(
	'markless dependencies present',
	marklessDeps.length > 0,
	marklessDeps.map(([name, version]) => `${name}@${version}`).join(', '),
	'this does not look like a markless app (no @markless/* dependencies)',
);

const versions = new Set(marklessDeps.map(([, version]) => version));
check(
	'markless dependency versions aligned',
	versions.size <= 1,
	[...versions].join(' vs '),
	'mismatched @markless/* versions cause protocol drift between compiler and runtime — align them',
);

check(
	'analyzer available for invariant checks',
	Boolean(allDeps['@markless/analyzer']),
	allDeps['@markless/analyzer'] ?? 'missing',
	'add @markless/analyzer as a devDependency to verify preload/network/resume invariants in tests',
);

const skipBuild = process.argv.includes('--no-build');
if (!skipBuild) {
	try {
		execFileSync('pnpm', ['exec', 'vp', 'build'], { cwd: root, stdio: 'pipe' });
		check('production build', true, 'vp build succeeded');
	} catch (error) {
		const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
			.trim()
			.split('\n')
			.slice(-12)
			.join('\n');
		check(
			'production build',
			false,
			'vp build failed',
			'markless build errors are fail-closed and name the offending construct — fix the authored shape, never suppress the gate',
		);
		if (output) console.log(output);
	}
}

console.log(`
Runtime debugging: dev builds expose window.__MARKLESS_DEBUG__ — a live channel recording
containers, lifecycles, and event routing. For a dead click, evaluate in the page:
  window.__MARKLESS_DEBUG__.explainInteraction(document.querySelector('<selector>'), 'click')
Versioned playbook: resolve this project's installed @markless/core package and read
agent/markless.md from that package root.
`);

process.exit(results.every((entry) => entry.ok) ? 0 : 1);

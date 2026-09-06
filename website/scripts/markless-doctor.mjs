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

// Compare what is INSTALLED, not what is declared. Two `^` ranges can resolve to
// different versions, and four `file:` tarballs are four different strings for one
// version; only the installed manifest answers "is this app on one Markless".
const installedVersion = (name) => {
	try {
		return JSON.parse(
			readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8'),
		).version;
	} catch {
		return undefined;
	}
};
const resolvedVersions = marklessDeps.map(([name, declared]) => [
	name,
	installedVersion(name) ?? declared,
]);
const versions = new Set(resolvedVersions.map(([, version]) => version));
check(
	'markless dependency versions aligned',
	versions.size <= 1,
	resolvedVersions.map(([name, version]) => `${name}@${version}`).join(', '),
	'mismatched @markless/* versions cause protocol drift between compiler and runtime — align them',
);

check(
	'analyzer available for invariant checks',
	Boolean(allDeps['@markless/analyzer']),
	allDeps['@markless/analyzer'] ?? 'missing',
	'add @markless/analyzer as a devDependency to verify preload/network/resume invariants in tests',
);

// tsconfig.json allows // and /* */ comments plus trailing commas; JSON.parse does not.
// Strip both while respecting string literals, so a commented config still reads.
const parseTsconfig = (source) => {
	let json = '';
	let insideString = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (insideString) {
			json += character;
			if (character === '\\') {
				index += 1;
				json += source[index] ?? '';
			} else if (character === '"') {
				insideString = false;
			}
			continue;
		}
		if (character === '"') {
			insideString = true;
			json += character;
			continue;
		}
		if (character === '/' && source[index + 1] === '/') {
			while (index < source.length && source[index] !== '\n') index += 1;
			json += '\n';
			continue;
		}
		if (character === '/' && source[index + 1] === '*') {
			index += 2;
			while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
				index += 1;
			}
			index += 1;
			continue;
		}
		// Outside a string, a comma directly before a closing brace or bracket is a
		// trailing comma, which JSON rejects.
		if (character === '}' || character === ']') json = json.replace(/,\s*$/, '');
		json += character;
	}
	return JSON.parse(json);
};

// The TypeScript plugin reaches the Markless compiler ONLY through the top-level
// `tsrx` declaration in this app's tsconfig.json. Without it the editor answers
// nothing — no completions, no hover, no go-to-definition — and says nothing about why.
const tsconfigPath = resolve(root, 'tsconfig.json');
let declaredCompiler;
let editorWiringDetail;
try {
	declaredCompiler = parseTsconfig(readFileSync(tsconfigPath, 'utf8'))?.tsrx?.compiler;
	editorWiringDetail =
		typeof declaredCompiler === 'string' && declaredCompiler
			? declaredCompiler
			: 'tsconfig.json does not declare tsrx.compiler';
} catch (error) {
	editorWiringDetail = `could not read tsconfig.json — ${error.message}`;
}
check(
	'editor wiring declares the markless compiler',
	typeof declaredCompiler === 'string' && declaredCompiler.length > 0,
	editorWiringDetail,
	'add this as a top-level key of tsconfig.json, beside compilerOptions: "tsrx": { "compiler": "@markless/typescript-plugin/volar" }',
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

#!/usr/bin/env node
// Reads the JavaScript a build wrote for the browser and reports Node-only code in it, independently of the bundler's own guard.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from 'yuku/analyzer';

const builtins = new Set(builtinModules);
const NODE_GLOBALS = new Set(['process', 'Buffer', 'global', '__dirname', '__filename', 'require']);
// Rolldown's stand-in for a `require()` it could not bundle throws this in a browser.
const REQUIRE_STAND_IN = /Calling \\?`require\\?` for /;
const SCRIPT_FILE = /\.m?js$/;
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SCRIPT_TYPE = /\btype\s*=\s*["']?([^"'\s>]+)/i;
// The script types a browser runs; any other type is data.
const EXECUTED_TYPE = /^(?:module|(?:text|application)\/(?:javascript|ecmascript))$/i;

export function isNodeBuiltin(specifier) {
	return (
		specifier.startsWith('node:') ||
		specifier.startsWith('bun:') ||
		builtins.has(specifier) ||
		builtins.has(specifier.split('/')[0])
	);
}

/** Where a build put its browser files: Nitro's public directory, or `dist` without its server half. */
export function clientOutputDir(buildDir) {
	const nitroPublic = join(buildDir, '.output/public');
	return existsSync(nitroPublic) ? nitroPublic : join(buildDir, 'dist');
}

// A `dist` build keeps its server half in dist/server, which never reaches the browser.
function* browserFiles(dir, top = dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!(dir === top && entry.name === 'server')) yield* browserFiles(path, top);
		} else if (SCRIPT_FILE.test(entry.name) || entry.name.endsWith('.html')) yield path;
	}
}

function scriptsIn(file) {
	const text = readFileSync(file, 'utf8');
	if (!file.endsWith('.html')) return [text];
	return [...text.matchAll(INLINE_SCRIPT)]
		.filter(([, attributes]) => {
			const type = SCRIPT_TYPE.exec(attributes)?.[1];
			return type === undefined || EXECUTED_TYPE.test(type);
		})
		.map(([, , code]) => code)
		.filter((code) => code.trim());
}

function lineOf(code, offset) {
	let line = 1;
	for (let index = code.indexOf('\n'); index !== -1 && index < offset; index = code.indexOf('\n', index + 1))
		line++;
	return line;
}

function isTypeofOperand(module, node) {
	const parent = module.parentOf(node);
	return parent?.type === 'UnaryExpression' && parent.operator === 'typeof';
}

// The use sits in a branch that runs only after `typeof <name>` was tested.
function isGuarded(module, reference) {
	const node = reference.node;
	const typeofTests = module.unresolvedReferences.filter(
		(other) => other.name === reference.name && isTypeofOperand(module, other.node),
	);
	const within = (outer, inner) => outer && outer.start <= inner.start && inner.end <= outer.end;
	const testsTypeof = (test) => typeofTests.some((other) => within(test, other.node));
	for (const ancestor of module.ancestors(node)) {
		if (
			(ancestor.type === 'ConditionalExpression' || ancestor.type === 'IfStatement') &&
			!within(ancestor.test, node) &&
			testsTypeof(ancestor.test)
		)
			return true;
		if (ancestor.type === 'LogicalExpression' && within(ancestor.right, node) && testsTypeof(ancestor.left))
			return true;
	}
	return false;
}

/** Node-only code in one browser file: built-in imports, Node globals, and Rolldown's `require` stand-in. */
export function scanBrowserFile(code) {
	const findings = [];
	if (REQUIRE_STAND_IN.test(code))
		findings.push('keeps a require() the bundler could not resolve, which throws in a browser');
	const module = analyze(code, { lang: 'js', sourceType: 'module' });
	if (module.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
		findings.push(`does not parse as a JavaScript module: ${module.diagnostics[0].message}`);
		return findings;
	}
	const specifiers = [
		...module.imports.map((record) => record.specifier),
		...module.exports.map((record) => record.specifier).filter(Boolean),
	];
	for (const specifier of new Set(specifiers))
		if (isNodeBuiltin(specifier)) findings.push(`imports "${specifier}", a Node built-in module`);
	for (const reference of module.unresolvedReferences) {
		if (!NODE_GLOBALS.has(reference.name)) continue;
		if (isTypeofOperand(module, reference.node) || isGuarded(module, reference)) continue;
		findings.push(
			`uses \`${reference.name}\` on line ${lineOf(code, reference.node.start)}, a global only Node has`,
		);
	}
	return findings;
}

/** Every finding under a build's browser output directory, each prefixed with its file. */
export function scanBrowserOutput(dir, root = dir) {
	if (!existsSync(dir)) return [`${dir}: the build wrote no browser output here`];
	const findings = [];
	for (const file of browserFiles(dir)) {
		for (const code of scriptsIn(file))
			for (const finding of scanBrowserFile(code)) findings.push(`${relative(root, file)}: ${finding}`);
	}
	return findings;
}

function main() {
	const dirs = process.argv.slice(2);
	if (dirs.length === 0) {
		console.error('usage: node scripts/ci/browser-output-scan.mjs <build dir>...');
		process.exit(2);
	}
	let failed = false;
	for (const dir of dirs) {
		const output = clientOutputDir(resolve(dir));
		const findings = scanBrowserOutput(output, resolve(dir));
		if (findings.length === 0) {
			console.log(`browser-output-scan: ${dir} ships no Node-only code`);
			continue;
		}
		failed = true;
		console.error(`browser-output-scan: ${dir} ships Node-only code to the browser:`);
		for (const finding of findings) console.error(`  ${finding}`);
	}
	if (failed) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

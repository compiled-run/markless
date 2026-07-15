#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '../..');
const distRoot = resolve(packageRoot, 'dist');
const buildRoot = resolve(distRoot, 'vsix-build');

rmSync(buildRoot, { recursive: true, force: true });
rmSync(resolve(distRoot, 'markless-tsrx.vsix'), { force: true });
run('pnpm', ['--dir', packageRoot, 'run', 'build:runtime']);
run('pnpm', ['--dir', resolve(workspaceRoot, 'packages/typescript-plugin'), 'build:vsix']);
run('pnpm', ['--dir', resolve(workspaceRoot, 'packages/router'), 'build:vsix']);
rmSync(resolve(distRoot, 'node_modules'), { recursive: true, force: true });

assemblePackage('@markless/typescript-plugin', 'typescript-plugin', 'index.cjs', '.', [
	'markless-jsx.d.ts',
]);
assemblePackage('@markless/router', 'router', 'index.cjs', './typescript-plugin');
assertSelfContained(resolve(distRoot, 'extension.cjs'), ['vscode']);
rmSync(buildRoot, { recursive: true, force: true });

function assemblePackage(name, directory, entry, exportPath = '.', extraDistFiles = []) {
	const target = resolve(distRoot, 'node_modules', ...name.split('/'));
	const sourceEntry = resolve(buildRoot, directory, entry);
	assertSelfContained(sourceEntry);
	mkdirSync(resolve(target, 'dist'), { recursive: true });
	cpSync(sourceEntry, resolve(target, `dist/${entry}`));
	for (const extra of extraDistFiles) {
		cpSync(
			resolve(workspaceRoot, `packages/${directory}/dist/${extra}`),
			resolve(target, `dist/${extra}`),
		);
	}
	const sourceManifest = JSON.parse(
		readFileSync(resolve(workspaceRoot, `packages/${directory}/package.json`), 'utf8'),
	);
	writeFileSync(
		resolve(target, 'package.json'),
		`${JSON.stringify({ name, version: sourceManifest.version, main: `./dist/${entry}`, exports: { [exportPath]: { require: `./dist/${entry}`, default: `./dist/${entry}` } } }, null, 2)}\n`,
	);
}

function assertSelfContained(entry, hostModules = []) {
	const source = readFileSync(entry, 'utf8');
	const requires = [...source.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(
		(match) => match[1],
	);
	const allowed = new Set([
		'typescript',
		...hostModules,
		...builtinModules,
		...builtinModules.map((name) => `node:${name}`),
	]);
	const unresolved = requires.filter((specifier) => !allowed.has(specifier));
	if (unresolved.length > 0) {
		throw new Error(`${entry} has unresolved runtime requires: ${[...new Set(unresolved)].join(', ')}`);
	}
}

function run(command, args) {
	const result = spawnSync(command, args, { cwd: workspaceRoot, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

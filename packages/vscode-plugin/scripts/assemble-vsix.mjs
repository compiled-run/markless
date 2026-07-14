#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '../..');
const distRoot = resolve(packageRoot, 'dist');

run('pnpm', ['--dir', resolve(workspaceRoot, 'packages/typescript-plugin'), 'build:cjs']);
run('pnpm', ['--dir', resolve(workspaceRoot, 'packages/router'), 'build:cjs']);
rmSync(resolve(distRoot, 'node_modules'), { recursive: true, force: true });

assemblePackage('@markless/typescript-plugin', 'typescript-plugin', 'index.cjs');
assemblePackage('@markless/router', 'router', 'typescript-plugin.cjs', './typescript-plugin');

function assemblePackage(name, directory, entry, exportPath = '.') {
	const target = resolve(distRoot, 'node_modules', ...name.split('/'));
	mkdirSync(resolve(target, 'dist'), { recursive: true });
	cpSync(
		resolve(workspaceRoot, `packages/${directory}/dist/${entry}`),
		resolve(target, `dist/${entry}`),
	);
	const sourceManifest = JSON.parse(
		readFileSync(resolve(workspaceRoot, `packages/${directory}/package.json`), 'utf8'),
	);
	writeFileSync(
		resolve(target, 'package.json'),
		`${JSON.stringify({ name, version: sourceManifest.version, main: `./dist/${entry}`, exports: { [exportPath]: { require: `./dist/${entry}`, default: `./dist/${entry}` } } }, null, 2)}\n`,
	);
}

function run(command, args) {
	const result = spawnSync(command, args, { cwd: workspaceRoot, stdio: 'inherit' });
	if (result.status !== 0) process.exit(result.status ?? 1);
}

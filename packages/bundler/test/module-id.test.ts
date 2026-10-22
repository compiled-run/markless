import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterAll, expect, test, vi } from 'vitest';
import { moduleIdFor, sourceForModuleId } from '../src/module-id.ts';

const linkResolutions = vi.hoisted(() => ({ count: 0 }));
vi.mock('node:fs', async (load) => {
	const fs = await load<typeof import('node:fs')>();
	const realpathSync = Object.assign(
		(...args: Parameters<typeof fs.realpathSync>) => {
			linkResolutions.count++;
			return fs.realpathSync(...args);
		},
		{ native: fs.realpathSync.native },
	);
	return { ...fs, default: { ...fs, realpathSync }, realpathSync };
});

// The id every compiled artifact spells a module by. Root-relative so a build
// carries no machine path; a dependency reachable as `root/node_modules/<pkg>`
// collapses to that spelling so the pnpm store layout does not leak either.

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'markless-module-id-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const root = join(scratch, 'site');
const store = join(root, 'node_modules/.pnpm');
const linkedPackage = join(store, '@acme+ui@1.0.0/node_modules/@acme/ui');
const transitivePackage = join(store, 'deep@2.0.0/node_modules/deep');
const workspacePackage = join(scratch, 'packages/kit');

function file(path: string) {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, '', 'utf8');
	return path;
}

file(join(root, 'src/pages/index.tsrx'));
file(join(linkedPackage, 'src/box.tsrx'));
file(join(transitivePackage, 'index.tsrx'));
file(join(workspacePackage, 'src/kit.tsrx'));
mkdirSync(join(root, 'node_modules/@acme'), { recursive: true });
mkdirSync(join(root, 'node_modules/@ws'), { recursive: true });
symlinkSync(linkedPackage, join(root, 'node_modules/@acme/ui'));
symlinkSync(workspacePackage, join(root, 'node_modules/@ws/kit'));

test('a file under the root is spelled relative to it', () => {
	expect(moduleIdFor(join(root, 'src/pages/index.tsrx'), root)).toBe('src/pages/index.tsrx');
});

test('a dependency linked from root/node_modules is spelled through that link', () => {
	expect(moduleIdFor(join(linkedPackage, 'src/box.tsrx'), root)).toBe(
		'node_modules/@acme/ui/src/box.tsrx',
	);
	expect(moduleIdFor(join(workspacePackage, 'src/kit.tsrx'), root)).toBe(
		'node_modules/@ws/kit/src/kit.tsrx',
	);
});

test('a dependency with no top-level link keeps its root-relative spelling', () => {
	expect(moduleIdFor(join(transitivePackage, 'index.tsrx'), root)).toBe(
		'node_modules/.pnpm/deep@2.0.0/node_modules/deep/index.tsrx',
	);
});

test('without a root, or for an id that is not a file path, the filename is the id', () => {
	const absolute = join(root, 'src/pages/index.tsrx');
	expect(moduleIdFor(absolute, undefined)).toBe(absolute);
	expect(moduleIdFor('virtual:markless-router/routes', root)).toBe(
		'virtual:markless-router/routes',
	);
});

test('a module id reads back to the file the bundler resolved', () => {
	expect(sourceForModuleId('src/pages/index.tsrx', root)).toBe(
		join(root, 'src/pages/index.tsrx'),
	);
	expect(sourceForModuleId('node_modules/@acme/ui/src/box.tsrx', root)).toBe(
		join(linkedPackage, 'src/box.tsrx'),
	);
	const absolute = join(root, 'src/pages/index.tsrx');
	expect(sourceForModuleId(absolute, root)).toBe(absolute);
	expect(sourceForModuleId(absolute, undefined)).toBe(absolute);
});

test('spelling a dependency file again does not resolve its links again', () => {
	// The interaction-closures asset spells a module once per handler that reaches it: millions of calls on a docs site.
	const dependency = join(linkedPackage, 'src/box.tsrx');
	expect(moduleIdFor(dependency, root)).toBe('node_modules/@acme/ui/src/box.tsrx');
	linkResolutions.count = 0;
	for (let call = 0; call < 1_000; call++) moduleIdFor(dependency, root);
	expect(linkResolutions.count).toBe(0);
	expect(moduleIdFor(dependency, root)).toBe('node_modules/@acme/ui/src/box.tsrx');
});

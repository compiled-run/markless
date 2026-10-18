import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import { dirname, join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';

// A component that fails to compile is read by every module that imports it.
// Those reads used to fail with MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED, an
// internal-sounding error that buried the real one; they now report the real one.

const packagesRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];

afterAll(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function buildErrors(component: string): Promise<ReadonlyArray<string>> {
	const root = await mkdtemp(join(tmpdir(), 'markless-router-error-cascade-'));
	roots.push(root);
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	const files: Record<string, string> = {
		'document.tsrx': [
			"import type { Children } from '@markless/core';",
			"import { Html } from '@markless/router';",
			'export default function Document({ children }: { readonly children?: Children }) @{',
			'\t<Html><head><meta charset="utf-8" /></head><body>{children}</body></Html>',
			'}',
		].join('\n'),
		'components/Broken.tsrx': component,
		'pages/index.tsrx': [
			"import { Broken } from '../components/Broken.tsrx';",
			'export default function Home() @{',
			'\t<main><Broken /></main>',
			'}',
		].join('\n'),
		'pages/other.tsrx': [
			"import { Broken } from '../components/Broken.tsrx';",
			'export default function Other() @{',
			'\t<section><Broken /></section>',
			'}',
		].join('\n'),
	};
	for (const [file, source] of Object.entries(files)) {
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), source);
	}
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	try {
		await builder.buildApp();
	} catch (error) {
		const errors = (error as { errors?: ReadonlyArray<unknown> }).errors ?? [error];
		return errors.map((entry) =>
			stripVTControlCharacters(String((entry as { message?: unknown }).message ?? entry)),
		);
	}
	return [];
}

const codes = (message: string) => [...new Set(message.match(/MARKLESS_[A-Z_]+/g) ?? [])];

const brokenComponents = {
	MARKLESS_SYNC_POLICY_SECOND_CANCEL: [
		"import { state } from '@markless/core';",
		'export function Broken() @{',
		'\tconst s = state({ i: 0 });',
		'\t<ul onKeyDown={(event) => { if (event.key === "a") event.preventDefault(); setTimeout(() => event.stopPropagation(), 0); }}><li>{s.i}</li></ul>',
		'}',
	].join('\n'),
	MARKLESS_REPEAT_ROWS_FROZEN: [
		"import { state } from '@markless/core';",
		'export function Broken() @{',
		"\tconst s = state({ picked: 'mon' });",
		"\tlet days = ['mon', 'tue'];",
		"\tif (s.picked === 'sun') days = ['sun'];",
		'\t<ol>@for (const day of days; key day) { <li data-picked={s.picked}>{day}</li> }</ol>',
		'}',
	].join('\n'),
};

for (const [primary, component] of Object.entries(brokenComponents)) {
	test(`a component failing with ${primary} reports only that error to its importers`, async () => {
		const errors = await buildErrors(component);

		expect(errors.length).toBeGreaterThan(0);
		for (const message of errors) {
			expect(codes(message)).toEqual(['MARKLESS_COMPILE_BLOCKED', primary]);
			expect(message).toContain('components/Broken.tsrx');
		}
	}, 120_000);
}

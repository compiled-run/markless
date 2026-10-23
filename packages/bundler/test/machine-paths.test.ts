import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import { machinePathLeaks, withoutMachinePaths } from '../src/build/machine-paths.ts';
import { rootRelativeId } from '../src/module-id.ts';

const root = '/checkout/app';

test('rootRelativeId respells every id shape a build writes into output', () => {
	expect(rootRelativeId('/checkout/app/src/a.tsrx?markless-symbols', root)).toBe(
		'src/a.tsrx?markless-symbols',
	);
	expect(
		rootRelativeId(
			`virtual:markless:symbol:${encodeURIComponent('/checkout/app/src/a.tsrx')}:symbol%3A0`,
			root,
		),
	).toBe(`virtual:markless:symbol:${encodeURIComponent('src/a.tsrx')}:symbol%3A0`);
	expect(rootRelativeId('\0virtual:markless:resolver:/checkout/app/src/a.tsrx', root)).toBe(
		'\0virtual:markless:resolver:src/a.tsrx',
	);
	expect(
		rootRelativeId(`imported:${encodeURIComponent('/checkout/app/b.tsrx')}:symbol:1`, root),
	).toBe(`imported:${encodeURIComponent('b.tsrx')}:symbol:1`);
	expect(rootRelativeId('web/dev-log', root)).toBe('web/dev-log');
	expect(rootRelativeId('virtual:markless:dev-log', root)).toBe('virtual:markless:dev-log');
});

test('withoutMachinePaths drops a root spelled bare, as a query value or inside a chunk name', () => {
	const id = (at: string) =>
		`/node_modules/@markless/router/src/vite/entries/client-entry.ts?markless-router-root=${encodeURIComponent(at)}&lang.ts`;
	const chunkName = (at: string) =>
		`client-entry.ts_markless-router-root_${encodeURIComponent(at).replaceAll('%', '_')}_lang.ts_lang`;
	expect(withoutMachinePaths(id('/one/app'), '/one/app')).toBe(
		withoutMachinePaths(id('/two/app'), '/two/app'),
	);
	expect(withoutMachinePaths(chunkName('/one/app'), '/one/app')).toBe(
		withoutMachinePaths(chunkName('/two/app'), '/two/app'),
	);
});

test('machinePathLeaks names every emitted file that spells a checkout path, raw or encoded', () => {
	const leaks = machinePathLeaks(
		{
			'build/clean.js': { type: 'chunk', code: 'export const id = "src/a.tsrx";' },
			'build/raw.js': { type: 'chunk', code: 'x("/checkout/app/src/a.tsrx")' },
			'build/encoded.js': {
				type: 'chunk',
				code: `x("${encodeURIComponent('/checkout/app/src/a.tsrx')}")`,
			},
			'build/demand.json': { type: 'asset', source: '{"/checkout/app/src/a.tsrx":1}' },
			'build/bytes.bin': {
				type: 'asset',
				source: new TextEncoder().encode('/checkout/app/x'),
			},
		},
		[root],
	);
	expect(leaks).toEqual([
		'build/bytes.bin',
		'build/demand.json',
		'build/encoded.js',
		'build/raw.js',
	]);
});

test('machinePathLeaks catches a checkout path minted into an identifier', () => {
	const minted = `_virtual_markless_symbol_${encodeURIComponent('/checkout/app/src/a.tsrx').replace(/[^\w$]/g, '_')}_exports`;
	const leaks = machinePathLeaks(
		{
			'build/clean.js': {
				type: 'chunk',
				code: 'var _virtual_markless_symbol_src_2Fa_exports = {};',
			},
			'build/minted.js': { type: 'chunk', code: `var ${minted} = {};` },
			'build/raw-minted.js': {
				type: 'chunk',
				code: 'function init__checkout_app_src_a() {}',
			},
		},
		[root],
	);
	expect(leaks).toEqual(['build/minted.js', 'build/raw-minted.js']);
});

test('a file linked in from outside the checkout is spelled by its package, not a climb out of the root', async () => {
	const base = await realpath(await mkdtemp(join(tmpdir(), 'markless-module-id-')));
	try {
		await mkdir(join(base, 'app'));
		await mkdir(join(base, 'linked/src'), { recursive: true });
		await writeFile(join(base, 'linked/package.json'), '{"name":"@acme/widgets"}');
		await writeFile(join(base, 'linked/src/dial.tsrx'), '');
		const id = rootRelativeId(join(base, 'linked/src/dial.tsrx'), join(base, 'app'));
		expect(id).toBe('node_modules/@acme/widgets/src/dial.tsrx');
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

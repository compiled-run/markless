import { expect, test } from 'vitest';
import { machinePathLeaks } from '../src/build/machine-paths.ts';
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

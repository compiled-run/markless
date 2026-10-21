import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { SUPPORTED_NODE_RANGE, unsupportedNode } from '../src/node-version.ts';

const require = createRequire(import.meta.url);

test('accepts exactly the Node.js versions the starter build tools accept', () => {
	for (const version of ['22.18.0', '22.19.3', '24.11.0', '24.15.2', '26.0.0', 'v27.1.0']) {
		expect(unsupportedNode({ node: version }), version).toBeNull();
	}
	for (const version of ['18.20.4', '20.19.0', '21.7.3', '22.17.9', '23.11.0', '24.10.9', '25.9.0']) {
		expect(unsupportedNode({ node: version }), version).toContain(`this is v${version}`);
	}
});

test('names the versions to install and where', () => {
	expect(unsupportedNode({ node: '18.17.0' })).toBe(
		'Markless needs Node.js 22.18+, 24.11+ or 26+, and this is v18.17.0. Install the latest LTS from https://nodejs.org, then run this again.',
	);
});

test('lets Bun through whatever Node.js version it reports', () => {
	expect(unsupportedNode({ node: '24.3.0', bun: '1.3.14' })).toBeNull();
});

test('matches vite-plus engines and the package engines', () => {
	const vitePlus = JSON.parse(readFileSync(require.resolve('vite-plus/package.json'), 'utf8'));
	expect(vitePlus.engines.node).toBe(SUPPORTED_NODE_RANGE);
	const cli = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	expect(cli.engines.node).toBe(SUPPORTED_NODE_RANGE);
});

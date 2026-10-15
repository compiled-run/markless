import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
import { SUPPORTED_NODE_RANGE, unsupportedNode } from '../src/node-version.ts';

const require = createRequire(import.meta.url);

test('accepts exactly the Node.js versions the starter build tools accept', () => {
	for (const version of ['20.19.0', '20.20.1', '22.18.0', '22.19.3', '24.11.0', '25.0.0', 'v26.1.0']) {
		expect(unsupportedNode(version), version).toBeNull();
	}
	for (const version of ['18.20.4', '20.18.9', '21.7.3', '22.17.9', '23.11.0', '24.10.9']) {
		expect(unsupportedNode(version), version).toContain(`this is v${version}`);
	}
});

test('names the versions to install and where', () => {
	expect(unsupportedNode('18.17.0')).toBe(
		'Markless needs Node.js 20.19+, 22.18+ or 24.11+, and this is v18.17.0. Install the latest LTS from https://nodejs.org, then run this again.',
	);
});

test('matches vite-plus engines and the package engines', () => {
	const vitePlus = JSON.parse(readFileSync(require.resolve('vite-plus/package.json'), 'utf8'));
	expect(vitePlus.engines.node).toBe(SUPPORTED_NODE_RANGE);
	const cli = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	expect(cli.engines.node).toBe(SUPPORTED_NODE_RANGE);
});

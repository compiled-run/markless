import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMPONENT, FAILURE, HANDLER, TEST } from './todo.ts';

const page = readFileSync(new URL('../../../pages/tooling/testing.mdx', import.meta.url), 'utf8');
const toy = readFileSync(new URL('./runner-figure.tsrx', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../../../../packages/vitest-browser/package.json', import.meta.url), 'utf8')) as { name: string; exports: Record<string, unknown> };

describe('testing runner figure', () => {
	it('draws the same component and test the page shows', () => {
		expect(page).toContain(COMPONENT.slice(1).join('\n'));
		expect(page).toContain(TEST.slice(1).join('\n'));
		expect(COMPONENT[6]).toContain(HANDLER.ok);
	});

	it('installs the browser provider at the exact version the starter\'s vite-plus expects', () => {
		const template = JSON.parse(readFileSync(new URL('../../../../packages/cli/templates/formats/node/package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
		const vitePlus = template.dependencies['vite-plus']!;
		const installed = JSON.parse(readFileSync(new URL('../../../../node_modules/vite-plus/package.json', import.meta.url), 'utf8')) as { version: string; peerDependencies: Record<string, string> };
		expect(installed.version).toBe(vitePlus);
		const provider = installed.peerDependencies['@vitest/browser-playwright']!;
		expect(page).toContain('@vitest/browser-playwright@' + provider);
		expect(page).toContain('`vite-plus` ' + vitePlus + ' runs Vitest ' + provider);
	});

	it('imports render from the real package and prints the failure Vitest prints', () => {
		expect(pkg.name).toBe('@markless/vitest-browser');
		expect(TEST[1]).toContain(pkg.name);
		expect(FAILURE.split('\n')).toEqual(['Error: expect(element).toHaveTextContent()', 'Expected element to have text content:', '  Buy milk: done', 'Received:', '  Buy milk: to do']);
		expect(TEST.join('\n')).not.toContain('querySelector');
	});

	it('answers press and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ['onClick={() => run()}', 'onClick={() => flip()}', "event.key === 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});

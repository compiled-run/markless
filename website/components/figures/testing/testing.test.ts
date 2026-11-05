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

	it('imports render from the real package and prints the failure Vitest prints', () => {
		expect(pkg.name).toBe('@markless/vitest-browser');
		expect(TEST[1]).toContain(pkg.name);
		expect(FAILURE).toBe("AssertionError: expected 'Buy milk: to do' to be 'Buy milk: done' // Object.is equality");
	});

	it('answers press and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ['onClick={() => run()}', 'onClick={() => flip()}', "event.key === 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});

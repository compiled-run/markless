import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { routeMountTarget, ROUTE_SCRIPT_TYPE } from '../src/route-dom.ts';

describe('route update renderer', () => {
	it('replaces the served route at its existing position inside the document shell', () => {
		const replaceWith = vi.fn();
		const querySelector = vi.fn(() => ({ parentElement: { replaceWith } }));
		const document = { querySelector, body: { replaceChildren: vi.fn() } };
		const destination = {} as Node;
		routeMountTarget(document as unknown as Document).replaceChildren(destination);
		expect(querySelector).toHaveBeenCalledWith(`script[type="${ROUTE_SCRIPT_TYPE}"]`);
		expect(replaceWith).toHaveBeenCalledWith(destination);
		expect(document.body.replaceChildren).not.toHaveBeenCalled();
	});

	it('uses the current client root for subsequent navigation', () => {
		const current = { replaceWith: vi.fn() };
		const document = { querySelector: vi.fn() };
		routeMountTarget(
			document as unknown as Document,
			current as unknown as Element,
		).replaceChildren('next');
		expect(current.replaceWith).toHaveBeenCalledWith('next');
		expect(document.querySelector).not.toHaveBeenCalled();
	});
	it('mounts navigated routes only from linked render data', async () => {
		const source = await readFile(
			resolve(import.meta.dirname, '../src/route-renderer.ts'),
			'utf8',
		);

		expect(source).toContain('renderData: artifact.renderData');
		expect(source).toContain('MARKLESS_ROUTER_RENDER_DATA_MISSING');
		expect(source).not.toMatch(/(?:\.|\?\.)renderCsr(?:\?\.)?\s*\(/);
		expect(source).not.toMatch(/\.innerHTML\s*=/);
	});
});

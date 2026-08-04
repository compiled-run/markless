import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

describe('route update renderer', () => {
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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeBuild, ENV, flip, HINTS, nextPreset, REFUSED } from './model.ts';
import { drawing } from './build-output.ts';

const buildArt = drawing();

const page = readFileSync(new URL('../../../pages/router/deploying.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./build-output-anatomy.tsrx', import.meta.url), 'utf8');

describe('one source, a build output per host', () => {
	it('names the real presets and cycles through them', () => {
		expect(ENV).toEqual({ node: 'node-server', vercel: 'vercel', cloudflare: 'cloudflare-module' });
		expect(nextPreset('node', 1)).toBe('vercel');
		expect(nextPreset('node', -1)).toBe('cloudflare');
		expect(describeBuild('vercel')).toContain('Your source files did not change');
		expect(REFUSED).toContain('You never edit the output');
		expect(flip('odd')).toBe('even');
	});

	it('draws each host its real output paths, and the source never changes', () => {
		for (const path of ['.output/', 'server/', 'index.mjs', 'public/', 'build/', '.vercel/output/', 'functions/', '__server.func/', 'static/', 'config.json', 'wrangler.json', '_headers']) {
			expect(piece).toContain(`>${path}</text>`);
		}
		const start = piece.indexOf('class="card source-card"');
		const source = piece.slice(start, piece.indexOf('class="card terminal"'));
		expect(source).not.toMatch(/preset ===|data-preset/);
		expect(Object.values(HINTS).every((hint) => hint.split(' ').length <= 5)).toBe(true);
	});

	it('plays: keys, hover hints, a drag that is refused, and no counters', () => {
		expect(piece.match(/class="key key-/g)).toHaveLength(3);
		expect(piece).toContain("event.key === 'ArrowRight'");
		expect(piece).toContain('onPointerenter={() => show(');
		expect(piece).toContain('setPointerCapture');
		expect(piece).toContain('@keyframes shake-a');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).not.toMatch(/cord|wire|parcel|@for|@if|count/i);
	});

	it('inks every part fully and draws the same figure every time', () => {
		expect(buildArt.source.card.ink.length).toBeGreaterThan(300);
		expect(buildArt.terminal.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(buildArt));
	});

	it('is on the Deploying page under its own heading', () => {
		expect(page).toContain("import BuildOutput from '../../components/figures/build-output/build-output-anatomy.tsrx';");
		expect(page.indexOf('## The same code builds for any host')).toBeLessThan(page.indexOf('<BuildOutput />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by build-output.test.ts from build-output.ts. Refresh with the figure test's -u flag.
import type { drawing } from './build-output.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(buildArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./build-output.art.ts');
	});
});

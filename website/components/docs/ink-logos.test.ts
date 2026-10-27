import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { flatNav, flatUiNav } from '../../nav.ts';
import { ICONS } from './ink-icons.ts';
import { drawing, inkSprite, logoArt, rings } from './ink-logos.ts';
import { INK_MARKS } from './ink-marks.ts';

const art = drawing();
const logo = readFileSync(new URL('./ink-logo.tsrx', import.meta.url), 'utf8');
const agents = readFileSync(new URL('./agent-logos.tsrx', import.meta.url), 'utf8');

describe('ink logos', () => {
	it('draws the coding agents Markless Migrate sets up, the frameworks it moves apps from, the checks it runs and its own mark, each with tone, hatching and ink', () => {
		expect(Object.keys(art.logos)).toEqual(['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode', 'nextjs', 'vue', 'htmx', 'alpine', 'remix', 'angular', 'react', 'docusaurus', 'vite', 'shadcn', 'eye', 'magnifier', 'speaker', 'stopwatch', 'migrate', ...Object.keys(ICONS)]);
		for (const drawn of Object.values(art.logos)) for (const layer of [drawn.tone, drawn.hatch, drawn.ink]) expect(layer.length).toBeGreaterThan(40);
	});

	it('keeps the drawings hidden from screen readers and the agent names as text', () => {
		expect(logo).toContain('aria-hidden="true"');
		for (const name of ['Claude Code', 'Codex', 'Cursor', 'Gemini CLI', 'GitHub Copilot', 'OpenCode']) expect(agents).toContain(`name: '${name}'`);
	});

	it('traces arcs and holes from the source path data', () => {
		expect(rings('M22 24H2V0h20zM17 4.8H7v14.4h10z')).toHaveLength(2);
		const [circle] = rings('M0 1a1 1 0 0 1 2 0a1 1 0 0 1-2 0Z');
		const ys = circle!.map((p) => p[1]);
		expect(Math.min(...ys)).toBeCloseTo(0, 1);
		expect(Math.max(...ys)).toBeCloseTo(2, 1);
	});
});

describe('page marks', () => {
	const pages = [...flatNav, ...flatUiNav];

	it('gives every docs page its own mark', () => {
		const icons = pages.map((page) => page.icon);
		for (const icon of icons) expect(icon && icon in art.logos).toBe(true);
		expect(new Set(icons).size).toBe(icons.length);
	});

	it('draws a mark only when a page shows it', () => {
		const shown = new Set(pages.map((page) => page.icon));
		expect(Object.keys(ICONS).filter((mark) => !shown.has(mark as keyof typeof ICONS))).toEqual([]);
	});
});

// QUARANTINED until 2026-11-10, owner Jack Shelton: the art is written on arm64, where Math.sin differs from x64 in the last bit.
const quarantined = process.arch !== 'arm64' && Date.now() < Date.parse('2026-11-10');

describe('frozen art', () => {
	it('freezes the drawings into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by ink-logos.test.ts from ink-logos.ts. Run \`vp test -u\` to refresh.
import type { LogoArt } from './ink-logos.ts';

export const art: LogoArt = ${JSON.stringify(logoArt(art), null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./ink-logos.art.ts');
	});

	it.skipIf(quarantined)('freezes the page marks into one sprite the sidebar and page titles link into (run with -u after editing)', async () => {
		const marks = [...new Set([...flatNav, ...flatUiNav].map((page) => page.icon!))];
		await expect(inkSprite(marks, art)).toMatchFileSnapshot(`../../public/${INK_MARKS}`);
	});
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, rings } from './ink-logos.ts';

const art = drawing();
const logo = readFileSync(new URL('./ink-logo.tsrx', import.meta.url), 'utf8');
const agents = readFileSync(new URL('./agent-logos.tsrx', import.meta.url), 'utf8');

describe('ink logos', () => {
	it('draws the coding agents Markless Migrate sets up, the frameworks it moves apps from, the checks it runs and its own mark, each with tone, hatching and ink', () => {
		expect(Object.keys(art.logos)).toEqual(['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode', 'nextjs', 'vue', 'htmx', 'alpine', 'remix', 'angular', 'react', 'docusaurus', 'vite', 'shadcn', 'eye', 'magnifier', 'speaker', 'stopwatch', 'migrate']);
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

describe('frozen art', () => {
	it('freezes the drawings into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by ink-logos.test.ts from ink-logos.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './ink-logos.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./ink-logos.art.ts');
	});
});

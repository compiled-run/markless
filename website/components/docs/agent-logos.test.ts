import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, rings } from './agent-logos-ink.ts';

const art = drawing();
const piece = readFileSync(new URL('./agent-logos.tsrx', import.meta.url), 'utf8');

describe('agent logos', () => {
	it('draws every agent markless-migrate can set up, each with tone, hatching and ink', () => {
		expect(Object.keys(art.logos)).toEqual(['claude', 'codex', 'cursor', 'gemini', 'copilot', 'opencode']);
		for (const logo of Object.values(art.logos)) for (const layer of [logo.tone, logo.hatch, logo.ink]) expect(layer.length).toBeGreaterThan(40);
	});

	it('keeps the names as text and the drawings hidden from screen readers', () => {
		expect(piece).toContain('aria-hidden="true"');
		for (const name of ['Claude Code', 'Codex', 'Cursor', 'Gemini CLI', 'GitHub Copilot', 'OpenCode']) expect(piece).toContain(`name: '${name}'`);
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
		const module = `// Written by agent-logos.test.ts from agent-logos-ink.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './agent-logos-ink.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./agent-logos.art.ts');
	});
});

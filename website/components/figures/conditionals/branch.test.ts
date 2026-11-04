import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, BRANCH_TOUR, describeBranch, flip, free, START } from './branch-model.ts';
import { drawing } from './branch.ts';

const branchArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/conditionals.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./branch-anatomy.tsrx', import.meta.url), 'utf8');

describe('the cart box and the free-shipping line', () => {
	it('builds the line at three bags and drops it below', () => {
		expect(START).toBe(2);
		expect(add(4)).toBe(1);
		expect(free(3)).toBe(true);
		expect(free(2)).toBe(false);
		expect(describeBranch(1, true)).toBe('The cart now holds 1 bag. The free-shipping line is gone from the page, not hidden.');
		expect(BRANCH_TOUR[0]).toBe('add');
		expect(flip('odd')).toBe('even');
	});

	it('puts the line inside an @if, so it leaves the page instead of hiding', () => {
		expect(piece).toContain('@if (shipping) {');
		expect(piece).not.toMatch(/display:\s*none|visibility:\s*hidden|\shidden=/);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/cart|shipping|beat/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain('WIRED BEFORE THE PAGE RAN');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(branchArt.cart.ink.length).toBeGreaterThan(300);
		for (const wire of [branchArt.wires.thin, branchArt.wires.cartOut, branchArt.wires.perkOut]) expect(wire.length).toBeGreaterThan(20);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(branchArt));
	});

	it('is on the Conditionals page under its own heading', () => {
		expect(page).toContain("import BranchAnatomy from '../../components/figures/conditionals/branch-anatomy.tsrx';");
		expect(page.indexOf('## Watch the line come and go')).toBeLessThan(page.indexOf('<BranchAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by branch.test.ts from branch.ts. Run the figure tests with -u to refresh.
import type { drawing } from './branch.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(branchArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./branch.art.ts');
	});
});

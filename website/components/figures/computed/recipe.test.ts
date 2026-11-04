import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, describeRecipe, flip, RECIPE_TOUR, shippingOf, START, subtotalOf, totalOf } from './recipe-model.ts';
import { drawing } from './recipe.ts';

const recipeArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/computed.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./recipe-anatomy.tsrx', import.meta.url), 'utf8');

describe('the recipe card', () => {
	it('works the total out from the cart, step by step', () => {
		expect(START).toBe(2);
		expect(add(4)).toBe(1);
		expect([subtotalOf(2), shippingOf(2), totalOf(2)]).toEqual([28, 5, 33]);
		expect([subtotalOf(3), shippingOf(3), totalOf(3)]).toEqual([42, 0, 42]);
		expect(describeRecipe(3, true)).toBe('Added a bag. The recipe card worked itself out again, line by line: 3 bags × $14 is $42, shipping is $0, so the total is $42. No one wrote the total.');
		expect(RECIPE_TOUR[0]).toBe('add');
		expect(flip('odd')).toBe('even');
	});

	it('re-inks the card top to bottom and then the page total; the press never writes the total', () => {
		for (const step of ['step-0', 'step-1', 'step-2', 'step-3', 'step-4']) expect(piece.match(new RegExp(`live ${step}`, 'g'))).toHaveLength(1);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/cart|total|beat/);
		const press = piece.slice(piece.indexOf('onClick='), piece.indexOf('onKeyDown='));
		expect(press).not.toMatch(/total/);
		expect(piece).not.toMatch(/class="cord"|art\.wires/);
	});

	it('has one margin note, no motion under reduced motion, and a tour that stops on touch', () => {
		expect(piece.match(/class="hand/g)).toHaveLength(1);
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('aria-live="polite"');
	});

	it('inks every part fully and draws the same scene every time', () => {
		expect(recipeArt.card.ink.length).toBeGreaterThan(300);
		expect(recipeArt.card.spots).toHaveLength(3);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(recipeArt));
	});

	it('is on the Computed page under its own heading', () => {
		expect(page).toContain("import RecipeAnatomy from '../../components/figures/computed/recipe-anatomy.tsrx';");
		expect(page.indexOf('## Follow the recipe')).toBeLessThan(page.indexOf('<RecipeAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by recipe.test.ts from recipe.ts. Run the figure tests with -u to refresh.
import type { drawing } from './recipe.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(recipeArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./recipe.art.ts');
	});
});

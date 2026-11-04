import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, describeRecipe, flip, RECIPE_TOUR, START, totalOf } from './recipe-model.ts';
import { drawing } from './recipe.ts';

const recipeArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/computed.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./recipe-anatomy.tsrx', import.meta.url), 'utf8');

describe('the cart box and the total recipe', () => {
	it('works the total out from the cart, and says so', () => {
		expect(START).toBe(2);
		expect(add(2)).toBe(3);
		expect(add(9)).toBe(1);
		expect(totalOf(3)).toBe(42);
		expect(describeRecipe(3, true)).toBe('Added a bag. The cart line now shows 3, and the recipe worked the total out again: $42. No one set the total.');
		expect(RECIPE_TOUR[0]).toBe('add');
		expect(flip('odd')).toBe('even');
	});

	it('wires the cart line and the total, and nothing else; the press never touches the total', () => {
		expect(piece.match(/class="pulse to-cart-line"/g)).toHaveLength(1);
		expect(piece.match(/class="pulse to-total-line"/g)).toHaveLength(1);
		const start = piece.indexOf('class="once"');
		const once = piece.slice(start, piece.indexOf('</g>', start));
		expect(once).toContain('{SHOP}');
		expect(once).not.toMatch(/cart|total|beat/);
		const press = piece.slice(piece.indexOf('onClick='), piece.indexOf('onKeyDown='));
		expect(press).not.toMatch(/total/);
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
		expect(recipeArt.cart.ink.length).toBeGreaterThan(300);
		expect(recipeArt.recipe.ink.length).toBeGreaterThan(300);
		for (const wire of [recipeArt.wires.thin, recipeArt.wires.cartOut, recipeArt.wires.link, recipeArt.wires.totalOut]) expect(wire.length).toBeGreaterThan(20);
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

import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ForDestructured from './for-destructured/page.tsrx';

// A destructured @for loop name renders a row per item and follows later writes.
afterEach(() => cleanup());

const shown = (root: ParentNode) => ({
	votes: [...root.querySelectorAll('[data-vote]')].map(
		(li) => `${li.getAttribute('data-vote')}=${li.textContent}`,
	),
	people: [...root.querySelectorAll('[data-person]')].map(
		(li) => `${li.getAttribute('data-person')}/${li.getAttribute('title')}=${li.textContent}`,
	),
});
const press = (root: ParentNode, button: string) =>
	root.querySelector<HTMLElement>(`[data-${button}]`)!.click();

async function destructuredRows(root: ParentNode) {
	expect(shown(root)).toEqual({
		votes: ['pizza=pizza:2', 'tacos=tacos:1'],
		people: ['ada/Ada=1. Ada (math)', 'bo/Bo=2. Bo (art)'],
	});
	press(root, 'vote-pizza');
	await expect.poll(() => shown(root).votes).toEqual(['pizza=pizza:3', 'tacos=tacos:1']);
	press(root, 'add-sushi');
	await expect
		.poll(() => shown(root).votes)
		.toEqual(['pizza=pizza:3', 'tacos=tacos:1', 'sushi=sushi:1']);
	press(root, 'rename');
	await expect
		.poll(() => shown(root).people)
		.toEqual(['ada/Ada=1. Ada (math)', 'bo/Bea=2. Bea (art)']);
	press(root, 'add-person');
	await expect
		.poll(() => shown(root).people)
		.toEqual(['ada/Ada=1. Ada (math)', 'bo/Bea=2. Bea (art)', 'cy/Cy=3. Cy (law)']);
	press(root, 'reverse');
	await expect
		.poll(() => shown(root).people)
		.toEqual(['cy/Cy=1. Cy (law)', 'bo/Bea=2. Bea (art)', 'ada/Ada=3. Ada (math)']);
}

test('CSR: destructured @for loop names render rows', async () => {
	await destructuredRows((await render(ForDestructured)).container);
});

test('SSR: destructured @for loop names render rows', async () => {
	await destructuredRows((await renderSSR(ForDestructured)).container);
});

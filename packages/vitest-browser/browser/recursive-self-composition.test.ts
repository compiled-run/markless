import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/tree-page.tsrx';

// A PLAIN component that composes itself: no shared(), no widget. The chunk
// graph has a cycle, and how far it unrolls is decided at render time by a prop.
//
// Each level is one more component edge, so it renders under its own `c<n>:`
// instance path: its own payload nodes, its own state(), and its own symbol
// route back to that level. The emitted-module side is pinned in
// packages/compiler/test/recursive-self-composition.test.ts.
afterEach(() => cleanup());

const depths = ['2', '1', '0'];

function nodes(container: ParentNode) {
	return {
		levels: [...container.querySelectorAll('[data-tree-node]')],
		bumps: [...container.querySelectorAll<HTMLButtonElement>('[data-tree-bump]')],
	};
}

// One instance per unrolled level, nested inside the previous one.
function expectNestedLevels(container: ParentNode) {
	const { levels } = nodes(container);
	expect(levels.map((level) => level.getAttribute('data-depth'))).toEqual(depths);
	expect(levels[0]?.contains(levels[1] ?? null)).toBe(true);
	expect(levels[1]?.contains(levels[2] ?? null)).toBe(true);
	// The innermost level stops the recursion: it holds no further node.
	expect(levels[2]?.querySelector('[data-tree-node]')).toBe(null);
}

// Every level owns its own state(): a click on one counter leaves the rest alone.
async function expectStatePerLevel(container: ParentNode) {
	expect(nodes(container).bumps.map((bump) => bump.textContent)).toEqual(['0', '0', '0']);

	nodes(container).bumps[1]?.click();
	await expect
		.poll(() => nodes(container).bumps.map((bump) => bump.textContent))
		.toEqual(['0', '1', '0']);

	nodes(container).bumps[2]?.click();
	nodes(container).bumps[2]?.click();
	await expect
		.poll(() => nodes(container).bumps.map((bump) => bump.textContent))
		.toEqual(['0', '1', '2']);

	nodes(container).bumps[0]?.click();
	await expect
		.poll(() => nodes(container).bumps.map((bump) => bump.textContent))
		.toEqual(['1', '1', '2']);
}

test('CSR: a self-composing component unrolls to the depth its prop names', async () => {
	const screen = await render(Page);
	expectNestedLevels(screen.container as HTMLElement);
});

test('CSR: each unrolled level owns its own state', async () => {
	const screen = await render(Page);
	await expectStatePerLevel(screen.container as HTMLElement);
});

test('SSR resume: the unrolled tree renders on the server and resumes per level', async () => {
	const screen = await renderSSR(Page);
	expectNestedLevels(screen.container);
	await expectStatePerLevel(screen.container);
});

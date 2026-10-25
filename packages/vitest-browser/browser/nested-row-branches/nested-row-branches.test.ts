import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import NestedBranchPage from './nested-branch-page.tsrx';
import NestedComponentArmPage from './nested-component-arm-page.tsrx';
import NestedRepeatBranchPage from './nested-repeat-branch-page.tsrx';

// A nested @for whose rows hold an @if builds, flips, moves and removes rows written after load.
afterEach(() => cleanup());

const modes = ['SSR', 'CSR'] as const;
type Mode = (typeof modes)[number];
const mounts = {
	NestedBranchPage: (mode: Mode) => (mode === 'SSR' ? renderSSR(NestedBranchPage) : render(NestedBranchPage)),
	NestedComponentArmPage: (mode: Mode) => (mode === 'SSR' ? renderSSR(NestedComponentArmPage) : render(NestedComponentArmPage)),
	NestedRepeatBranchPage: (mode: Mode) => (mode === 'SSR' ? renderSSR(NestedRepeatBranchPage) : render(NestedRepeatBranchPage)),
};

function press(container: ParentNode, op: string) {
	const button = container.querySelector<HTMLButtonElement>(`[data-op="${op}"]`);
	if (!button) throw new Error(`Expected a ${op} button on the page.`);
	button.click();
}

const cell = (row: Element) =>
	row.querySelector('b')?.textContent ?? (row.querySelector('i') ? 'off' : row.textContent || '-');

const lists = (container: ParentNode, id: string) =>
	[...container.querySelectorAll(`#${id} ol`)]
		.map((list) => [...list.querySelectorAll('li')].map(cell).join(','))
		.join(';');

const nestedPages = [
	['an @if', mounts.NestedBranchPage],
	['an @if holding a component', mounts.NestedComponentArmPage],
] as const;

for (const mode of modes) {
	test(`${mode}: a nested @for whose rows hold an @if renders rows written after load`, async () => {
		const { container } = await mounts.NestedRepeatBranchPage(mode);
		container.querySelector<HTMLButtonElement>('#add')!.click();
		await expect.poll(() => container.querySelector('section')?.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<ol><li><b>x</b></li></ol>');
	});

	for (const [shape, page] of nestedPages)
		test(`${mode}: a nested @for whose rows hold ${shape} serves, mints, flips, moves and removes its rows`, async () => {
			const { container } = await page(mode);
			const both = async (expected: string) => {
				await expect.poll(() => lists(container, 'late')).toBe(expected);
				expect(lists(container, 'early')).toBe(expected);
			};
			expect(lists(container, 'early')).toBe('A1,off;B3');
			expect(lists(container, 'late')).toBe('');
			press(container, 'load');
			await both('A1,off;B3');
			const kept = [...container.querySelectorAll('#early li, #late li')];
			press(container, 'prepend-item');
			await both('N4,A1,off;B3');
			for (const section of ['early', 'late']) {
				const [, a1, a2, b3] = container.querySelectorAll(`#${section} li`);
				expect([a1, a2, b3]).toEqual(kept.filter((row) => row.closest(`#${section}`)));
			}
			press(container, 'flip');
			await both('off,A1,off;B3');
			press(container, 'flip');
			await both('N4,A1,off;B3');
			press(container, 'relabel');
			await both('N4x,A1x,off;B3');
			const ols = [...container.querySelectorAll('#late ol')];
			press(container, 'reverse-lists');
			await both('B3;N4x,A1x,off');
			expect([...container.querySelectorAll('#late ol')]).toEqual([...ols].reverse());
			press(container, 'reverse-items');
			await both('B3;N4x,A1x,off');
			press(container, 'remove-list');
			await both('N4x,A1x,off');
			press(container, 'reverse-items');
			await both('off,A1x,N4x');
			press(container, 'remove-item');
			await both('A1x,N4x');
			press(container, 'add-list');
			await both('A1x,N4x;C5');
		});

}

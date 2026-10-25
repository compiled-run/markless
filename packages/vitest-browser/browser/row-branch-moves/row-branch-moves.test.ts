import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import RowBranchPage from './row-branch-page.tsrx';
import RowHandlerBranchPage from './row-handler-branch-page.tsrx';

// Keyed rows holding an @if move and keep their elements when their siblings shift, so CSS transitions survive.
afterEach(() => cleanup());

const modes = ['SSR', 'CSR'] as const;
type Mode = (typeof modes)[number];
const mounts = {
	RowBranchPage: (mode: Mode) => (mode === 'SSR' ? renderSSR(RowBranchPage) : render(RowBranchPage)),
	RowHandlerBranchPage: (mode: Mode) => (mode === 'SSR' ? renderSSR(RowHandlerBranchPage) : render(RowHandlerBranchPage)),
};

function press(container: ParentNode, op: string) {
	const button = container.querySelector<HTMLButtonElement>(`[data-op="${op}"]`);
	if (!button) throw new Error(`Expected a ${op} button on the page.`);
	button.click();
}

const cell = (row: Element) =>
	row.querySelector('b')?.textContent ?? (row.querySelector('i') ? 'off' : row.textContent || '-');

const rows = (container: ParentNode, id: string) =>
	[...container.querySelectorAll(`#${id} li`)].map((row) => `${row.getAttribute('data-at')}:${cell(row)}`).join(',');

for (const mode of modes) {
	test(`${mode}: an @if in a keyed row with a handler renders rows written after load`, async () => {
		const { container } = await mounts.RowHandlerBranchPage(mode);
		const section = container.querySelector('section')!;
		container.querySelector<HTMLButtonElement>('#show')!.click();
		await expect.poll(() => section.querySelectorAll('li').length).toBeGreaterThan(0);
		expect(section.querySelectorAll('li > b').length).toBe(section.querySelectorAll('li').length);
	});

	test(`${mode}: keyed rows holding an @if move, keep their elements and follow new item objects`, async () => {
		const { container } = await mounts.RowBranchPage(mode);
		const all = ['early', 'late', 'early-handled', 'late-handled'];
		const each = async (expected: string) => {
			for (const id of all) await expect.poll(() => rows(container, id), id).toBe(expected);
		};
		press(container, 'load');
		await each('0:A1,1:off');
		const kept = all.map((id) => [...container.querySelectorAll(`#${id} li`)]);
		const bold = all.map((id) => container.querySelector(`#${id} b`));
		press(container, 'prepend-item');
		await each('0:N3,1:A1,2:off');
		all.forEach((id, at) => {
			const [, a1, a2] = container.querySelectorAll(`#${id} li`);
			expect([a1, a2], id).toEqual(kept[at]);
			expect(a1!.querySelector('b'), id).toBe(bold[at]);
		});
		press(container, 'reverse-items');
		await each('0:off,1:A1,2:N3');
		all.forEach((id, at) => expect(container.querySelectorAll(`#${id} li`)[1]!.querySelector('b'), id).toBe(bold[at]));
		press(container, 'flip');
		await each('0:A2,1:A1,2:N3');
		press(container, 'relabel');
		await each('0:A2x,1:A1x,2:N3x');
		press(container, 'remove-item');
		await each('0:A1x,1:N3x');
		container.querySelector<HTMLElement>('#late-handled li b')!.click();
		container.querySelector<HTMLElement>('#early-handled li:last-child')!.click();
		await expect.poll(() => container.querySelector('#hits')?.textContent).toBe('A1x;N3x;');
	});
}

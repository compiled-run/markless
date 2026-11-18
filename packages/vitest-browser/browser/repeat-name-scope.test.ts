import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import BranchArm from './repeat-name-scope/branch-arm.tsrx';
import Page from './repeat-name-scope/page.tsrx';
import RowChild from './repeat-name-scope/row-child.tsrx';
import SameComponent from './repeat-name-scope/same-component.tsrx';
import TwoLoops from './repeat-name-scope/two-loops.tsrx';

afterEach(() => cleanup());

// Every fixture reuses one name, `panel`, for bindings in different lexical scopes of one module.
const texts = (container: ParentNode, selector: string) =>
	[...container.querySelectorAll(selector)].map((node) => node.textContent?.trim());

async function bodyConstBesideSiblingLoop(container: HTMLElement) {
	const detail = container.querySelector('[data-detail]')!;
	expect(detail.textContent).toBe('Beta');
	expect(detail.getAttribute('title')).toBe('b');
	expect(texts(container, '[data-panel]')).toEqual(['Alpha', 'Beta']);
	container.querySelector<HTMLButtonElement>('[data-toggle="a"]')!.click();
	await expect.poll(() => container.querySelector('[data-open]')?.textContent).toBe('a');
}

async function twoLoopsSameName(container: HTMLElement) {
	expect(texts(container, '[data-tab]')).toEqual(['Ex', 'Why']);
	expect(texts(container, '[data-card]')).toEqual(['Pea']);
	expect(container.querySelector('[data-card]')!.getAttribute('title')).toBe('green');
	container.querySelector<HTMLButtonElement>('[data-tab="y"]')!.click();
	await expect.poll(() => container.querySelector('[data-picked]')?.textContent).toBe('y');
}

async function loopShadowsBodyConst(container: HTMLElement) {
	const heading = container.querySelector('[data-heading]')!;
	const rows = () =>
		[...container.querySelectorAll('[data-entry]')].map(
			(li) => `${li.getAttribute('title')}:${li.querySelector('[data-mixed]')?.textContent}`,
		);
	expect(heading.textContent).toBe('LEAD!');
	expect(heading.getAttribute('title')).toBe('LEAD?');
	expect(rows()).toEqual(['one#1:one!', 'two#2:two!']);
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
	await expect.poll(rows).toEqual(['one#1:one!', 'two#2:two!', 'new#3:new!']);
	expect(heading.textContent).toBe('LEAD!');
}

async function armConstBesideSiblingLoop(container: HTMLElement) {
	expect(texts(container, '[data-row]')).toEqual(['one', 'two']);
	expect(container.querySelector('[data-arm]')!.textContent).toBe('two');
	expect(container.querySelector('[data-arm]')!.getAttribute('title')).toBe('r2');
	container.querySelector<HTMLButtonElement>('[data-flip]')!.click();
	await expect.poll(() => container.querySelector('[data-arm]')?.textContent).toBe('hidden');
	container.querySelector<HTMLButtonElement>('[data-flip]')!.click();
	await expect.poll(() => container.querySelector('[data-arm]')?.textContent).toBe('two');
}

async function childConstInsideParentRow(container: HTMLElement) {
	expect(texts(container, '[data-badge]')).toEqual(['warm', 'cool']);
	expect(
		[...container.querySelectorAll('[data-badge]')].map((node) =>
			node.getAttribute('data-badge'),
		),
	).toEqual(['k1', 'k2']);
	container.querySelector<HTMLButtonElement>('[data-hit]')!.click();
	await expect.poll(() => container.querySelector('[data-hit]')?.textContent).toBe('1');
}

test('CSR: a body const beside a sibling component @for item', async () => {
	await bodyConstBesideSiblingLoop((await render(Page)).container as HTMLElement);
});
test('SSR resume: a body const beside a sibling component @for item', async () => {
	await bodyConstBesideSiblingLoop((await renderSSR(Page)).container as HTMLElement);
});

test('CSR: two components whose @for items share a name', async () => {
	await twoLoopsSameName((await render(TwoLoops)).container as HTMLElement);
});
test('SSR resume: two components whose @for items share a name', async () => {
	await twoLoopsSameName((await renderSSR(TwoLoops)).container as HTMLElement);
});

test('CSR: a @for item shadowing a body const of the same component', async () => {
	await loopShadowsBodyConst((await render(SameComponent)).container as HTMLElement);
});
test('SSR resume: a @for item shadowing a body const of the same component', async () => {
	await loopShadowsBodyConst((await renderSSR(SameComponent)).container as HTMLElement);
});

test('CSR: a branch-arm const beside a sibling component @for item', async () => {
	await armConstBesideSiblingLoop((await render(BranchArm)).container as HTMLElement);
});
test('SSR resume: a branch-arm const beside a sibling component @for item', async () => {
	await armConstBesideSiblingLoop((await renderSSR(BranchArm)).container as HTMLElement);
});

test('CSR: a child body const inside a parent @for row', async () => {
	await childConstInsideParentRow((await render(RowChild)).container as HTMLElement);
});
test('SSR resume: a child body const inside a parent @for row', async () => {
	await childConstInsideParentRow((await renderSSR(RowChild)).container as HTMLElement);
});

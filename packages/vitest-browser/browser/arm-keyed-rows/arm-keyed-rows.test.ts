import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ComponentArmPage from './component-arm-page.tsrx';
import DecidedLayerPage from './decided-layer-page.tsrx';
import FlipComponentPage from './flip-component-page.tsrx';
import IdleArmPage from './idle-arm-page.tsrx';
import IdleLayerPage from './idle-layer-page.tsrx';
import InlineArmPage from './inline-arm-page.tsrx';
import RowArmPage from './row-arm-page.tsrx';

// A keyed @for inside an @if arm reconciles the rows the arm already shows instead of appending fresh ones.
afterEach(() => cleanup());

const modes = ['SSR', 'CSR'] as const;

const texts = (container: ParentNode, id: string) =>
	[...container.querySelectorAll(`#${id} li`)].map((row) => row.textContent).join(',');

function press(container: ParentNode, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} on the page.`);
	button.click();
}

async function flip(container: ParentNode, id: string, shown = 'A,B,C') {
	press(container, '[data-toggle]');
	await expect.poll(() => container.querySelector(`#${id} li`)).toBeNull();
	press(container, '[data-toggle]');
	await expect.poll(() => texts(container, id)).toBe(shown);
}

async function expectReconciles(container: ParentNode, id: string) {
	expect(texts(container, id)).toBe('A,B,C');
	const served = container.querySelector(`#${id} li`);
	press(container, `#${id} [data-op="write"]`);
	await expect.poll(() => texts(container, id)).toBe('A1,B1,C1');
	expect(container.querySelector(`#${id} li`)).toBe(served);
	press(container, `#${id} [data-op="reverse"]`);
	await expect.poll(() => texts(container, id)).toBe('C1,B1,A1');
	press(container, `#${id} [data-op="remove"]`);
	await expect.poll(() => texts(container, id)).toBe('B1,A1');
	press(container, `#${id} [data-op="add"]`);
	await expect.poll(() => texts(container, id)).toBe('B1,A1,N21');
}

for (const mode of modes) {
	test(`${mode}: nested keyed @for in a component in an @if arm keeps its rows on the first write`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(IdleArmPage) : render(IdleArmPage));
		const cells = (id: string) =>
			[...container.querySelectorAll(`#${id} td`)].map((cell) => cell.textContent).join(',');
		await expect.poll(() => cells('direct')).toBe('1,2,11,12,21,22');
		await expect.poll(() => cells('in-arm')).toBe('1,2,11,12,21,22');
		expect(container.querySelectorAll('#in-arm tr').length).toBe(3);
	});

	test(`${mode}: an idle write in a closed layer's arm keeps the calendar's served week rows`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(IdleLayerPage)
			: render(IdleLayerPage));
		const cells = (id: string) =>
			[...container.querySelectorAll(`#${id} td`)].map((cell) => cell.textContent).join(',');
		await expect.poll(() => cells('inline')).toBe('1,2,11,12,21,22');
		await expect.poll(() => cells('in-layer')).toBe('1,2,11,12,21,22');
		expect(container.querySelectorAll('#in-layer tr').length).toBe(3);
	});

	test(`${mode}: keyed @for in a component in an arm a constant prop decides reconciles its rows`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(DecidedLayerPage)
			: render(DecidedLayerPage));
		await expectReconciles(container, 'drawer');
	});

	test(`${mode}: a component outside any arm reconciles its keyed rows`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(ComponentArmPage)
			: render(ComponentArmPage));
		await expectReconciles(container, 'outside');
	});

	test(`${mode}: keyed @for directly in an @if arm reconciles its rows`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(InlineArmPage)
			: render(InlineArmPage));
		await expectReconciles(container, 'inside');
	});

	test(`${mode}: keyed @for directly in an @if arm reconciles after the arm flips`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(InlineArmPage)
			: render(InlineArmPage));
		await flip(container, 'inside');
		await expectReconciles(container, 'inside');
	});

	test(`${mode}: keyed @for in a component in an @if arm reconciles its rows`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(ComponentArmPage)
			: render(ComponentArmPage));
		await expectReconciles(container, 'inside');
		expect(texts(container, 'outside')).toBe('A,B,C');
	});

	test(`${mode}: keyed @for over a prop in a component in an @if arm reconciles, before and after a flip`, async () => {
		const { container } = await (mode === 'SSR'
			? renderSSR(FlipComponentPage)
			: render(FlipComponentPage));
		await expectReconciles(container, 'inside');
		await flip(container, 'inside', 'B1,A1,N21');
		press(container, '#inside [data-op="reverse"]');
		await expect.poll(() => texts(container, 'inside')).toBe('N21,A1,B1');
	});

	test(`${mode}: keyed @for in a component in an @if arm in a @for row reconciles its rows`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(RowArmPage) : render(RowArmPage));
		await expectReconciles(container, 'second');
		expect(texts(container, 'first')).toBe('A,B,C');
		await expectReconciles(container, 'first');
	});
}

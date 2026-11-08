import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Deep from './instance-local-state/deep.tsrx';
import Imported from './instance-local-state/imported.tsrx';
import Nested from './instance-local-state/nested.tsrx';
import Repeated from './instance-local-state/repeated.tsrx';
import RepeatedNested from './instance-local-state/repeated-nested.tsrx';
import Siblings from './instance-local-state/siblings.tsrx';

afterEach(() => cleanup());

// Each instance's handler writes its own state() cell and its text reads that same cell.
async function eachInstanceOwnsItsState(container: HTMLElement, names: readonly string[]) {
	const text = (name: string, to: string) =>
		container.querySelector(`[data-pick="${name}-${to}"]`)?.textContent;
	for (const name of names) {
		for (const to of ['dark', 'light']) expect(text(name, to)).toBe(`${name} ${to} -> `);
	}
	for (const name of names) {
		for (const to of ['dark', 'light']) {
			container.querySelector<HTMLButtonElement>(`[data-pick="${name}-${to}"]`)!.click();
			await expect.poll(() => text(name, to)).toBe(`${name} ${to} -> ${to}`);
		}
	}
	for (const name of names) {
		for (const to of ['dark', 'light']) expect(text(name, to)).toBe(`${name} ${to} -> ${to}`);
	}
}

test('CSR: sibling instances each own their state', async () => {
	await eachInstanceOwnsItsState((await render(Siblings)).container as HTMLElement, ['one']);
});
test('SSR resume: sibling instances each own their state', async () => {
	await eachInstanceOwnsItsState((await renderSSR(Siblings)).container as HTMLElement, ['one']);
});
test('CSR: instances inside instances each own their state', async () => {
	await eachInstanceOwnsItsState((await render(Nested)).container as HTMLElement, ['one', 'two']);
});
test('SSR resume: instances inside instances each own their state', async () => {
	await eachInstanceOwnsItsState((await renderSSR(Nested)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('CSR: imported instances with a computed label each own their state', async () => {
	await eachInstanceOwnsItsState((await render(Imported)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('SSR resume: imported instances with a computed label each own their state', async () => {
	await eachInstanceOwnsItsState((await renderSSR(Imported)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('CSR: instances three components deep each own their state', async () => {
	await eachInstanceOwnsItsState((await render(Deep)).container as HTMLElement, ['one', 'two']);
});
test('SSR resume: instances three components deep each own their state', async () => {
	await eachInstanceOwnsItsState((await renderSSR(Deep)).container as HTMLElement, [
		'one',
		'two',
	]);
});

// Row children show only their own state, since a row-derived prop read in a child template expression is refused at compile time.
async function eachRowInstanceOwnsItsState(container: HTMLElement) {
	const button = (name: string, to: string) =>
		container.querySelector<HTMLButtonElement>(`[data-group="${name}"][data-pick="${to}"]`)!;
	const texts = () =>
		['one', 'two'].flatMap((name) =>
			['dark', 'light'].map((to) => button(name, to).textContent),
		);
	expect(texts()).toEqual(['', '', '', '']);
	const clicked: string[] = [];
	for (const name of ['one', 'two'])
		for (const to of ['dark', 'light']) {
			button(name, to).click();
			clicked.push(to);
			const expected = [...clicked, ...Array(4 - clicked.length).fill('')];
			await expect.poll(texts).toEqual(expected);
		}
}

test('CSR: instances in a @for row each own their state', async () => {
	await eachRowInstanceOwnsItsState((await render(Repeated)).container as HTMLElement);
});
test('SSR resume: instances in a @for row each own their state', async () => {
	await eachRowInstanceOwnsItsState((await renderSSR(Repeated)).container as HTMLElement);
});
test('CSR: instances inside a component in a @for row each own their state', async () => {
	await eachRowInstanceOwnsItsState((await render(RepeatedNested)).container as HTMLElement);
});
test('SSR resume: instances inside a component in a @for row each own their state', async () => {
	await eachRowInstanceOwnsItsState((await renderSSR(RepeatedNested)).container as HTMLElement);
});

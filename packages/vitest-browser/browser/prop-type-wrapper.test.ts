import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AsCast from './prop-type-wrapper/as-cast.tsrx';
import Bang from './prop-type-wrapper/bang.tsrx';
import BangUnderIf from './prop-type-wrapper/bang-under-if.tsrx';
import SameFile from './prop-type-wrapper/same-file.tsrx';
import Satisfies from './prop-type-wrapper/satisfies.tsrx';
import { requested } from './prop-type-wrapper/users.ts';

// `x!`, `x as T` and `x satisfies T` exist only for the type checker, so a prop written with one follows state like bare `x`.

afterEach(() => {
	cleanup();
	requested.length = 0;
});

async function follows(container: HTMLElement) {
	const read = (selector: string) => container.querySelector(selector)?.textContent;
	await expect.poll(() => read('[data-name]')).toBe('user 1');
	expect(read('[data-plain]')).toBe('1');
	container.querySelector<HTMLElement>('[data-pick]')!.click();
	await expect.poll(() => read('[data-plain]'), { message: 'plain {id} text after the switch' }).toBe('2');
	await expect.poll(() => requested.includes(2), { message: 'getUser(2) sent after the switch' }).toBe(true);
	await expect.poll(() => read('[data-name]')).toBe('user 2');
}

test('CSR: a prop written as `selected!` to a child in the same file follows its state', async () => {
	await follows((await render(SameFile)).container as HTMLElement);
});

test('SSR: a prop written as `selected!` to a child in the same file follows its state', async () => {
	await follows((await renderSSR(SameFile)).container as HTMLElement);
});

test('CSR: a prop written as `selected! under @if` follows its state', async () => {
	await follows((await render(BangUnderIf)).container as HTMLElement);
});

test('SSR: a prop written as `selected! under @if` follows its state', async () => {
	await follows((await renderSSR(BangUnderIf)).container as HTMLElement);
});

test('CSR: a prop written as `selected!` follows its state', async () => {
	await follows((await render(Bang)).container as HTMLElement);
});

test('SSR: a prop written as `selected!` follows its state', async () => {
	await follows((await renderSSR(Bang)).container as HTMLElement);
});

test('CSR: a prop written as `(selected as number)` follows its state', async () => {
	await follows((await render(AsCast)).container as HTMLElement);
});

test('SSR: a prop written as `(selected as number)` follows its state', async () => {
	await follows((await renderSSR(AsCast)).container as HTMLElement);
});

test('CSR: a prop written as `selected satisfies number` follows its state', async () => {
	await follows((await render(Satisfies)).container as HTMLElement);
});

test('SSR: a prop written as `selected satisfies number` follows its state', async () => {
	await follows((await renderSSR(Satisfies)).container as HTMLElement);
});

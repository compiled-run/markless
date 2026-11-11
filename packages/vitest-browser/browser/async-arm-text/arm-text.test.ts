import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import IfPropRead from './if-prop-read.tsrx';
import IfValueOnly from './if-value-only.tsrx';
import IfValueRefresh from './if-value-refresh.tsrx';
import PlainPropRead from './plain-prop-read.tsrx';
import PlainValueOnly from './plain-value-only.tsrx';

// A child's @try text that reads only its async value must show that value, inside an @if arm or not.
afterEach(cleanup);
const openArm = () => (document.querySelector('[data-open]') as HTMLElement | null)?.click();
const title = () => document.querySelector('[data-title]')?.textContent?.trim();

test('client render: an @if arm, text reads only the async value', async () => {
	await render(IfValueOnly);
	openArm();
	await expect.poll(title).toBe('todo 4');
});

test('client render: an @if arm, text also reads a prop', async () => {
	await render(IfPropRead);
	openArm();
	await expect.poll(title).toBe('todo 4 (#4)');
});

test('client render: no @if, text reads only the async value', async () => {
	await render(PlainValueOnly);
	await expect.poll(title).toBe('todo 4');
});

test('client render: no @if, text also reads a prop', async () => {
	await render(PlainPropRead);
	await expect.poll(title).toBe('todo 4 (#4)');
});

test('server render: an @if arm, text reads only the async value', async () => {
	await renderSSR(IfValueOnly);
	openArm();
	await expect.poll(title).toBe('todo 4');
});

test('server render: an @if arm, text also reads a prop', async () => {
	await renderSSR(IfPropRead);
	openArm();
	await expect.poll(title).toBe('todo 4 (#4)');
});

test('server render: no @if, text reads only the async value', async () => {
	await renderSSR(PlainValueOnly);
	await expect.poll(title).toBe('todo 4');
});

test('server render: no @if, text also reads a prop', async () => {
	await renderSSR(PlainPropRead);
	await expect.poll(title).toBe('todo 4 (#4)');
});

test("client render: an @if arm's value-only text follows a new value", async () => {
	await render(IfValueRefresh);
	openArm();
	await expect.poll(title).toBe('todo 4');
	(document.querySelector('[data-next]') as HTMLElement).click();
	await expect.poll(title).toBe('todo 5');
});

test("server render: an @if arm's value-only text follows a new value", async () => {
	await renderSSR(IfValueRefresh);
	openArm();
	await expect.poll(title).toBe('todo 4');
	(document.querySelector('[data-next]') as HTMLElement).click();
	await expect.poll(title).toBe('todo 5');
});

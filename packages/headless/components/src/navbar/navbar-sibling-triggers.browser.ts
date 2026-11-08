import { render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import SiblingTriggers from './scenarios/sibling-triggers.tsrx';

afterEach(() => {
	delete document.body.dataset.pressed;
});

const pressed = () => document.body.dataset.pressed ?? '';
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

async function eachTriggerRunsOnlyItsOwnHandler(container: HTMLElement) {
	const trigger = (id: string) => container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
	trigger('dark-trigger').click();
	await expect.poll(pressed).toBe('dark;');
	trigger('light-trigger').click();
	await expect.poll(pressed).toBe('dark;light;');
	trigger('find-trigger').click();
	await expect.poll(pressed).toBe('dark;light;find;');
	const [relayed, unrelayed] = container.querySelectorAll<HTMLButtonElement>('[data-testid="relay-trigger"]');
	unrelayed!.click();
	relayed!.click();
	await expect.poll(pressed).toBe('dark;light;find;relay;');
	await settle();
	expect(pressed()).toBe('dark;light;find;relay;');
}

test('CSR: triggers rendered by sibling components run only their own handler', async () => {
	await eachTriggerRunsOnlyItsOwnHandler((await render(SiblingTriggers)).container as HTMLElement);
});

test('SSR: triggers rendered by sibling components run only their own handler', async () => {
	await eachTriggerRunsOnlyItsOwnHandler((await renderSSR(SiblingTriggers)).container as HTMLElement);
});

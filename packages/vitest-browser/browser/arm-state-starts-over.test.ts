import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ComposedPage from './arm-state-starts-over/composed-page.tsrx';
import ElseArm from './arm-state-starts-over/else-arm.tsrx';
import Fight from './arm-state-starts-over/fight.tsrx';
import IfArm from './arm-state-starts-over/if-arm.tsrx';
import SwitchArm from './arm-state-starts-over/switch-arm.tsrx';
import TryArm from './arm-state-starts-over/try-arm.tsrx';

// Spec 01 "Conditional identity": state declared inside an arm starts over each time the arm opens.
afterEach(() => cleanup());

const press = (root: ParentNode, selector: string) => {
	const target = root.querySelector(selector);
	if (!(target instanceof HTMLElement)) throw new Error(`missing ${selector}`);
	target.click();
};
const count = (root: ParentNode) => root.querySelector('[data-count]')?.textContent?.trim();

const cases = [
	{ name: '@if', CSR: () => render(IfArm), SSR: () => renderSSR(IfArm), start: '0', afterTwo: '2' },
	{ name: '@else', CSR: () => render(ElseArm), SSR: () => renderSSR(ElseArm), start: '1000', afterTwo: '700' },
	{
		name: '@switch case',
		CSR: () => render(SwitchArm),
		SSR: () => renderSSR(SwitchArm),
		start: '3',
		afterTwo: '7',
	},
	{ name: '@if in a @try', CSR: () => render(TryArm), SSR: () => renderSSR(TryArm), start: '10', afterTwo: '8' },
] as const;

for (const mode of ['CSR', 'SSR'] as const)
	for (const { name, start, afterTwo, ...mount } of cases)
		test(`${mode}: state declared in an ${name} starts over when it reopens`, async () => {
			const { container } = await mount[mode]();
			press(container, '[data-toggle]');
			await expect.poll(() => count(container)).toBe(start);
			press(container, '[data-count]');
			press(container, '[data-count]');
			await expect.poll(() => count(container)).toBe(afterTwo);
			press(container, '[data-toggle]');
			await expect.poll(() => count(container)).toBeUndefined();
			press(container, '[data-toggle]');
			await expect.poll(() => count(container)).toBe(start);
		});

for (const mode of ['CSR', 'SSR'] as const)
	test(`${mode}: an arm's state starts over while a handler in it reads state from above`, async () => {
		const { container } = await (mode === 'CSR' ? render(Fight) : renderSSR(Fight));
		press(container, '[data-train]');
		press(container, '[data-toggle]');
		await expect.poll(() => count(container)).toBe('900');
		press(container, '[data-hit]');
		await expect.poll(() => count(container)).toBe('700');
		press(container, '[data-toggle]');
		await expect.poll(() => count(container)).toBeUndefined();
		press(container, '[data-toggle]');
		await expect.poll(() => count(container)).toBe('900');
	});

const startsOver = async (root: ParentNode, start: string, afterTwo: string) => {
	press(root, '[data-toggle]');
	await expect.poll(() => count(root)).toBe(start);
	press(root, '[data-count]');
	press(root, '[data-count]');
	await expect.poll(() => count(root)).toBe(afterTwo);
	press(root, '[data-toggle]');
	await expect.poll(() => count(root)).toBeUndefined();
	press(root, '[data-toggle]');
	await expect.poll(() => count(root)).toBe(start);
};
const within = (root: ParentNode, name: string) => {
	const scope = root.querySelector(`[data-case="${name}"]`);
	if (!scope) throw new Error(`missing case ${name}`);
	return scope;
};

for (const mode of ['CSR', 'SSR'] as const)
	test(`${mode}: arm state starts over in components a page composes from other modules`, async () => {
		const { container } = await (mode === 'CSR' ? render(ComposedPage) : renderSSR(ComposedPage));
		await startsOver(within(container, 'if'), '0', '2');
		await startsOver(within(container, 'else'), '1000', '700');
		await startsOver(within(container, 'switch'), '3', '7');
		await expect.poll(() => within(container, 'try').querySelector('h4')?.textContent).toBe('Stamps');
		await startsOver(within(container, 'try'), '10', '8');
		const fight = within(container, 'fight');
		press(fight, '[data-train]');
		press(fight, '[data-toggle]');
		await expect.poll(() => count(fight)).toBe('900');
		press(fight, '[data-hit]');
		await expect.poll(() => count(fight)).toBe('700');
		press(fight, '[data-toggle]');
		press(fight, '[data-toggle]');
		await expect.poll(() => count(fight)).toBe('900');
	});

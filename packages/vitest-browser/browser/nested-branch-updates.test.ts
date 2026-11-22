import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ComposedNestedPage from './arm-state-starts-over/composed-nested-page.tsrx';
import NestedArmState from './arm-state-starts-over/nested-arm-state.tsrx';
import NestedIf from './arm-state-starts-over/nested-if.tsrx';
import NestedSwitch from './arm-state-starts-over/nested-switch.tsrx';

// A branch inside an open arm keeps updating while the outer arm stays open.
afterEach(() => cleanup());

const press = (root: ParentNode, selector: string) => {
	const target = root.querySelector(selector);
	if (!(target instanceof HTMLElement)) throw new Error(`missing ${selector}`);
	target.click();
};
const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent?.trim();
const within = (root: ParentNode, name: string) => {
	const scope = root.querySelector(`[data-case="${name}"]`);
	if (!scope) throw new Error(`missing case ${name}`);
	return scope;
};

async function nestedIfFlips(root: ParentNode) {
	press(root, '[data-outer]');
	await expect.poll(() => [text(root, '[data-text]'), text(root, '[data-shown]')]).toEqual(['one', 'no']);
	press(root, '[data-inner]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('yes');
	press(root, '[data-label]');
	await expect.poll(() => text(root, '[data-text]')).toBe('two');
	press(root, '[data-inner]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('no');
}

async function nestedSwitchChanges(root: ParentNode) {
	press(root, '[data-outer]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('calm');
	press(root, '[data-inner]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('LOUD');
	press(root, '[data-inner]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('calm');
}

async function nestedStateStartsOver(root: ParentNode) {
	press(root, '[data-outer]');
	await expect.poll(() => [text(root, '[data-a]'), text(root, '[data-off]')]).toEqual(['0', 'off']);
	press(root, '[data-a]');
	await expect.poll(() => text(root, '[data-a]')).toBe('1');
	press(root, '[data-inner]');
	await expect.poll(() => text(root, '[data-b]')).toBe('0');
	press(root, '[data-b]');
	await expect.poll(() => text(root, '[data-b]')).toBe('1');
	press(root, '[data-inner]');
	press(root, '[data-inner]');
	await expect.poll(() => [text(root, '[data-a]'), text(root, '[data-b]')]).toEqual(['1', '0']);
	press(root, '[data-outer]');
	press(root, '[data-outer]');
	await expect.poll(() => [text(root, '[data-a]'), text(root, '[data-b]')]).toEqual(['0', '0']);
}

const roots = {
	CSR: {
		nestedIf: () => render(NestedIf),
		nestedSwitch: () => render(NestedSwitch),
		nestedArmState: () => render(NestedArmState),
		composed: () => render(ComposedNestedPage),
	},
	SSR: {
		nestedIf: () => renderSSR(NestedIf),
		nestedSwitch: () => renderSSR(NestedSwitch),
		nestedArmState: () => renderSSR(NestedArmState),
		composed: () => renderSSR(ComposedNestedPage),
	},
};

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: an @if inside an open @if flips and its sibling text updates`, async () => {
		await nestedIfFlips((await roots[mode].nestedIf()).container);
	});

	test(`${mode}: a @switch inside an open @if changes case`, async () => {
		await nestedSwitchChanges((await roots[mode].nestedSwitch()).container);
	});

	test(`${mode}: an @if inside an @if, each with its own state, updates and starts over`, async () => {
		await nestedStateStartsOver((await roots[mode].nestedArmState()).container);
	});

	test(`${mode}: nested branches in components a page composes from other modules keep updating`, async () => {
		const { container } = await roots[mode].composed();
		await nestedIfFlips(within(container, 'nested-if'));
		await nestedSwitchChanges(within(container, 'nested-switch'));
		await nestedStateStartsOver(within(container, 'nested-arm-state'));
	});
}

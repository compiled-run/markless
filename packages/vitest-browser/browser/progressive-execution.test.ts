import { afterEach, expect, test } from 'vitest';
import {
	MODULE_GROUPS,
	deriveAllowedModules,
	forbiddenExecutedModules,
	type PayloadRecordInventory,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSR } from '../src/index.ts';
import EventOnly from './fixtures/progressive-event-only.tsrx';
import FullTier from './fixtures/progressive-full-tier.tsrx';
import PlainVsBehavior from './fixtures/progressive-plain-vs-behavior.tsrx';
import RowMixed from './fixtures/progressive-row-mixed.tsrx';

declare global {
	var __marklessExecutedModules: Set<string> | undefined;
}

afterEach(() => cleanup());

test('progressive execution: load executes zero runtime modules for full and event-only tiers', async () => {
	const full = await renderSSR(FullTier);
	await expect.poll(() => full.container.querySelector('[data-async-container]')).not.toBeNull();
	expect.soft(executedModules()).toEqual([]);

	await cleanup();
	const eventOnly = await renderSSR(EventOnly);
	await expect.poll(() => eventOnly.container.querySelector('[data-async-container]')).not.toBeNull();
	expect.soft(executedModules()).toEqual([]);
});

test('progressive execution: counter dispatch executes only the event dispatch core path', async () => {
	const screen = await renderSSR(EventOnly);
	const container = screen.container;
	const button = requireElement<HTMLButtonElement>(container, 'button[data-counter-only]');
	const view = readViewPayload(container);
	const action = actionForElement(container, button, 'click');
	resetExecutedModules();

	button.click();
	await expect.poll(() => button.textContent).toBe('Count 1');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed).toEqual(expect.arrayContaining([...MODULE_GROUPS['dispatch-core']]));
});

test('progressive execution: row dispatch does not execute unrelated async, branch, or behavior modules', async () => {
	const screen = await renderSSR(RowMixed);
	const container = screen.container;
	const view = readViewPayload(container);
	const rowButton = requireElement<HTMLButtonElement>(container, 'button[data-mixed-row]');
	const rowAction = actionForKeyedRepeat(view, 'click');
	resetExecutedModules();

	rowButton.click();
	await expect.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-mixed-choice]').textContent)
		.toBe('north');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, rowAction);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed.some((id) => MODULE_GROUPS['keyed-repeat'].has(id))).toBe(true);
	expect(executed.some((id) => MODULE_GROUPS['async-boundary'].has(id))).toBe(false);
	expect(executed.some((id) => MODULE_GROUPS.branch.has(id))).toBe(false);
	expect(executed.some((id) => MODULE_GROUPS.behavior.has(id))).toBe(false);
});

test('progressive execution: clicking a plain button never executes behavior modules', async () => {
	const screen = await renderSSR(PlainVsBehavior);
	const container = screen.container;
	const plain = requireElement<HTMLButtonElement>(container, 'button[data-plain-action]');
	const view = readViewPayload(container);
	const action = actionForElement(container, plain, 'click');
	resetExecutedModules();

	plain.click();
	await expect.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-plain-label]').textContent)
		.toBe('plain');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed.some((id) => MODULE_GROUPS.behavior.has(id))).toBe(false);
});

test('progressive execution: event-only preventDefault is applied exactly once per dispatch', async () => {
	const screen = await renderSSR(EventOnly);
	const form = requireElement<HTMLFormElement>(screen.container, 'form[data-event-form]');
	resetExecutedModules();

	const calls = dispatchSubmit(form);
	await expect.poll(() => requireElement<HTMLButtonElement>(screen.container, 'button[data-submit-count]').textContent)
		.toContain('1');
	expect(calls()).toBe(1);
});

function readViewPayload(container: HTMLElement): PayloadRecordInventory {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/view"]');
	if (!script) throw new Error('Expected markless/view payload script.');
	return JSON.parse(script.textContent ?? 'null') as PayloadRecordInventory;
}

function actionForElement(
	container: HTMLElement,
	element: HTMLElement,
	eventName: string,
): { hostNodeId: string; eventName: string; syncPolicy?: unknown } {
	const view = readViewPayload(container);
	const elements = [container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))];
	const index = elements.indexOf(element);
	const hostNodeId = view.locators?.find((locator) => locator.index === index)?.hostNodeId;
	const record = view.events?.find(
		(event) => event.hostNodeId === hostNodeId && event.eventName === eventName,
	);
	if (!hostNodeId || !record) {
		throw new Error(`Expected payload event record for ${eventName} at DOM index ${index}.`);
	}
	return { hostNodeId, eventName, syncPolicy: record.syncPolicy };
}

function actionForKeyedRepeat(
	view: PayloadRecordInventory,
	eventName: string,
): { hostNodeId: string; eventName: string; recordKind: 'keyed-repeat-row' } {
	const repeat = view.keyedRepeats?.find((record) =>
		record.rowEvents.some((event) => event.eventName === eventName),
	);
	if (!repeat) throw new Error(`Expected keyed repeat row event for ${eventName}.`);
	return { hostNodeId: repeat.parentHostNodeId, eventName, recordKind: 'keyed-repeat-row' };
}

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the server-rendered DOM.`);
	return element;
}

function executedModules(): string[] {
	return [...(globalThis.__marklessExecutedModules ?? new Set())].sort();
}

function resetExecutedModules(): void {
	globalThis.__marklessExecutedModules = new Set();
}

function dispatchSubmit(form: HTMLFormElement): () => number {
	let preventDefaultCalls = 0;
	const event = new Event('submit', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'preventDefault', {
		value() {
			preventDefaultCalls++;
		},
	});
	form.dispatchEvent(event);
	return () => preventDefaultCalls;
}

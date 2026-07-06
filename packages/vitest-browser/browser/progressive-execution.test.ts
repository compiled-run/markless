import { afterEach, expect, test } from 'vitest';
import {
	MODULE_GROUPS,
	deriveAllowedModules,
	forbiddenExecutedModules,
	type PayloadRecordInventory,
} from '../../bundler/test-support/execution-expectations.ts';
import {
	cleanup,
	renderSSRPhased,
	type SsrPhasedRenderResult,
	type SsrRenderResult,
} from '../src/index.ts';
import EventOnly from './fixtures/progressive-event-only.tsrx';
import FullTier from './fixtures/progressive-full-tier.tsrx';
import PlainVsBehavior from './fixtures/progressive-plain-vs-behavior.tsrx';
import RowMixed from './fixtures/progressive-row-mixed.tsrx';

declare global {
	var __marklessExecutedModules: Set<string> | undefined;
}

afterEach(() => cleanup());

test('progressive execution: load executes zero runtime modules for full and event-only tiers', async () => {
	const fullRender = await renderSSRPhased(FullTier);
	resetExecutedModules();
	const full = fullRender.mount();
	await expect.poll(() => full.container.querySelector('[data-async-container]')).not.toBeNull();
	expect.soft(executedModules()).toEqual([]);

	await cleanup();
	const eventOnlyRender = await renderSSRPhased(EventOnly);
	resetExecutedModules();
	const eventOnly = eventOnlyRender.mount();
	await expect.poll(() => eventOnly.container.querySelector('[data-async-container]')).not.toBeNull();
	expect.soft(executedModules()).toEqual([]);
});

test('progressive execution: counter dispatch executes only the event dispatch core path', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(EventOnly));
	const container = screen.container;
	const button = requireElement<HTMLButtonElement>(container, 'button[data-counter-only]');
	const view = readViewPayload(container);
	const action = actionForElement(container, button, 'click');

	button.click();
	await expect.poll(() => button.textContent).toBe('Count 1');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed).toEqual(expect.arrayContaining([...MODULE_GROUPS['dispatch-core']]));
});

test('progressive execution: row dispatch does not execute unrelated async, branch, or behavior modules', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(RowMixed));
	const container = screen.container;
	const view = readViewPayload(container);
	const rowButton = requireElement<HTMLButtonElement>(container, '.mixed-row button');
	const rowAction = actionForKeyedRepeat(container, rowButton, 'click');

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
	const screen = await renderProgressiveSSR(renderSSRPhased(PlainVsBehavior));
	const container = screen.container;
	const plain = requireElement<HTMLButtonElement>(container, 'button[data-plain-action]');
	const view = readViewPayload(container);
	const action = actionForElement(container, plain, 'click');

	plain.click();
	await expect.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-plain-label]').textContent)
		.toBe('plain');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed.some((id) => MODULE_GROUPS.behavior.has(id))).toBe(false);
});

test('progressive execution: event-only preventDefault is applied exactly once per dispatch', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(EventOnly));
	const form = requireElement<HTMLFormElement>(screen.container, 'form[data-event-form]');

	const calls = dispatchSubmit(form);
	await expect.poll(() => requireElement<HTMLButtonElement>(screen.container, 'button[data-submit-count]').textContent)
		.toContain('1');
	expect(calls()).toBe(1);
});

async function renderProgressiveSSR(
	rendered: Promise<SsrPhasedRenderResult>,
): Promise<SsrRenderResult> {
	const phased = await rendered;
	resetExecutedModules();
	const screen = phased.mount();
	await expect.poll(() => screen.container.querySelector('[data-async-container]')).not.toBeNull();
	resetExecutedModules();
	return screen;
}

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
	const match = findHostNodeIdForTarget(container, view, element, (hostNodeId) => {
		const record = view.events?.find((event) => event.hostNodeId === hostNodeId && event.eventName === eventName);
		return record ? { syncPolicy: record.syncPolicy } : undefined;
	});
	if (match) return { hostNodeId: match.hostNodeId, eventName, syncPolicy: match.value.syncPolicy };
	throw new Error(`Expected payload event record for ${eventName} on clicked element or ancestor.`);
}

function actionForKeyedRepeat(
	container: HTMLElement,
	element: HTMLElement,
	eventName: string,
): { hostNodeId: string; eventName: string; recordKind: 'keyed-repeat-row' } {
	const view = readViewPayload(container);
	const match = findHostNodeIdForTarget(container, view, element, (hostNodeId) =>
		view.keyedRepeats?.find(
			(record) =>
				record.parentHostNodeId === hostNodeId &&
				record.rowEvents.some((event) => event.eventName === eventName),
		),
	);
	if (match) return { hostNodeId: match.hostNodeId, eventName, recordKind: 'keyed-repeat-row' };
	throw new Error(`Expected keyed repeat row event for ${eventName} on clicked element or ancestor.`);
}

function findHostNodeIdForTarget<T>(
	root: HTMLElement, view: PayloadRecordInventory, element: HTMLElement, matches: (hostNodeId: string) => T | undefined,
): { hostNodeId: string; value: T } | undefined {
	const elements: HTMLElement[] = [];
	const visit = (node: Node): void => {
		if (node.nodeType === Node.ELEMENT_NODE) elements.push(node as HTMLElement);
		for (const child of Array.from(node.childNodes)) visit(child);
	};
	visit(root);
	const byHostId = new Map<string, HTMLElement>();
	// Mirrors packages/web/src/event-only-resume.ts materializeDomLocators/collectElements.
	for (const locator of view.locators ?? []) {
		const element = elements[locator.index];
		if (!element) continue;
		const tagName = (locator as { readonly tagName?: string }).tagName;
		if (tagName && tagName !== '*' && element.tagName.toLowerCase() !== tagName.toLowerCase()) continue;
		byHostId.set(locator.hostNodeId, element);
	}
	for (let current: HTMLElement | null = element; current; current = current.parentElement) {
		for (const [hostNodeId, candidate] of byHostId) {
			const value = candidate === current ? matches(hostNodeId) : undefined;
			if (value) return { hostNodeId, value };
		}
	}
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

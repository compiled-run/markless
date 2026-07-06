import { expect } from 'vitest';
import type {
	PayloadRecordInventory,
	RuntimeDispatchAction,
} from '../../../bundler/test-support/execution-expectations.ts';
import type { SsrPhasedRenderResult, SsrRenderResult } from '../../src/index.ts';

declare global {
	var __marklessExecutedModules: Set<string> | undefined;
}

export async function renderProgressiveSSR(
	rendered: Promise<SsrPhasedRenderResult>,
): Promise<SsrRenderResult> {
	const phased = await rendered;
	resetExecutedModules();
	const screen = phased.mount();
	await expect.poll(() => screen.container.querySelector('[data-async-container]')).not.toBeNull();
	resetExecutedModules();
	return screen;
}

export function readViewPayload(container: HTMLElement): PayloadRecordInventory {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/view"]');
	if (!script) throw new Error('Expected markless/view payload script.');
	return JSON.parse(script.textContent ?? 'null') as PayloadRecordInventory;
}

export function actionForElement(
	container: HTMLElement,
	element: HTMLElement,
	eventName: string,
): RuntimeDispatchAction {
	const view = readViewPayload(container);
	const match = findHostNodeIdForTarget(container, view, element, (hostNodeId) => {
		const record = view.events?.find((event) => event.hostNodeId === hostNodeId && event.eventName === eventName);
		return record ? { syncPolicy: record.syncPolicy } : undefined;
	});
	if (match) return { hostNodeId: match.hostNodeId, eventName, syncPolicy: match.value.syncPolicy };
	throw new Error(`Expected payload event record for ${eventName} on clicked element or ancestor.`);
}

export function actionForKeyedRepeat(
	container: HTMLElement,
	element: HTMLElement,
	eventName: string,
): RuntimeDispatchAction {
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
	root: HTMLElement,
	view: PayloadRecordInventory,
	element: HTMLElement,
	matches: (hostNodeId: string) => T | undefined,
): { hostNodeId: string; value: T } | undefined {
	const elements: HTMLElement[] = [];
	const visit = (node: Node): void => {
		if (node.nodeType === Node.ELEMENT_NODE) elements.push(node as HTMLElement);
		for (const child of Array.from(node.childNodes)) visit(child);
	};
	// dom-order locator indices are based at the markless container (index 0), not the harness wrapper.
	visit(root.querySelector('[data-async-container]') ?? root);
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

export function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the server-rendered DOM.`);
	return element;
}

export function executedModules(): string[] {
	return [...(globalThis.__marklessExecutedModules ?? new Set())].sort();
}

export function resetExecutedModules(): void {
	globalThis.__marklessExecutedModules = new Set();
}

export function dispatchSubmit(form: HTMLFormElement): () => number {
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

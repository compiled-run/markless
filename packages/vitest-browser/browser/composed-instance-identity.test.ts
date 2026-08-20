import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import SameNamePage from './fixtures/instance-same-name-page.tsrx';
import SiblingsPage from './fixtures/instance-siblings-page.tsrx';

afterEach(() => cleanup());

type StatePayload = {
	readonly cells: ReadonlyArray<{ readonly graphNodeId: string }>;
	readonly computed: ReadonlyArray<{ readonly graphNodeId: string }>;
};

function statePayloadIds(container: HTMLElement): string[] {
	const script = container.querySelector<HTMLScriptElement>('script[type="markless/state"]');
	if (!script) throw new Error('Expected markless/state payload script.');
	const payload = JSON.parse(script.textContent ?? 'null') as StatePayload;
	return [...payload.cells, ...payload.computed].map((node) => node.graphNodeId);
}

test('composed instances: two static siblings keep separate state', async () => {
	const screen = await render(SiblingsPage);
	const container = screen.container as HTMLElement;
	const a = container.querySelector<HTMLButtonElement>('[data-row="a"] button');
	const b = container.querySelector<HTMLButtonElement>('[data-row="b"] button');
	if (!a || !b) throw new Error('Expected both composed counter buttons.');

	a.click();
	await expect.poll(() => a.textContent).toBe('1');
	expect(b.textContent).toBe('0');
});

test('composed instances: two different components may declare the same state name', async () => {
	const screen = await render(SameNamePage);
	const container = screen.container as HTMLElement;
	const a = container.querySelector<HTMLButtonElement>('[data-row="a"] button');
	const b = container.querySelector<HTMLElement>('[data-alt-counter]');
	if (!a || !b) throw new Error('Expected both composed components.');

	a.click();
	await expect.poll(() => a.textContent).toBe('1');
	expect(b.textContent).toBe('0');
	b.click();
	await expect.poll(() => b.textContent).toBe('2');
	expect(a.textContent).toBe('1');
});

test('composed instances: SSR resume keeps instance-qualified ids byte-identical', async () => {
	const screen = await renderSSR(SiblingsPage);
	const container = screen.container;
	const a = container.querySelector<HTMLButtonElement>('[data-row="a"] button');
	const b = container.querySelector<HTMLButtonElement>('[data-row="b"] button');
	if (!a || !b) throw new Error('Expected both server-rendered counter buttons.');

	const stepIds = statePayloadIds(container).filter((id) => id.endsWith('state:steps'));
	expect(new Set(stepIds).size).toBe(2);

	a.click();
	await expect.poll(() => a.textContent).toBe('1');
	expect(b.textContent).toBe('0');
});

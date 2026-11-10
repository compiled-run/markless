import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ProbeDepth1 from './depth1.tsrx';
import ProbeDepth2 from './depth2.tsrx';
import ProbeDepth3 from './depth3.tsrx';
import ProbeDepth2Field from './depth2-field.tsrx';
import { resetSaveApi, saveCalls } from './save-api.ts';

beforeEach(resetSaveApi);
afterEach(() => cleanup());

const LOADS = { timeout: 5_000 };

async function addSecondList(container: HTMLElement): Promise<HTMLElement> {
	container.querySelector<HTMLButtonElement>('[data-add-list]')!.click();
	await expect.poll(() => container.querySelectorAll('[data-todos]').length, LOADS).toBe(2);
	return container.querySelectorAll<HTMLElement>('[data-todos]')[1]!;
}

async function saveIn(list: HTMLElement, title: string) {
	const input = list.querySelector('[data-title]') as HTMLInputElement;
	input.value = title;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	list.querySelector<HTMLButtonElement>('[data-add]')!.click();

	await expect.poll(() => list.querySelectorAll('[data-saving-row]').length, LOADS).toBe(1);
	const id = list.querySelector('[data-saving-row]')!.getAttribute('data-id')!;
	await expect.poll(() => list.querySelector(`[data-id="${id}"] [data-confirmed]`)?.textContent, LOADS).toBe(title);
	expect(saveCalls(id)).toEqual([{ id, title }]);
}

async function firstList(container: HTMLElement): Promise<HTMLElement> {
	await expect.poll(() => container.querySelectorAll('[data-todos]').length, LOADS).toBe(1);
	return container.querySelector<HTMLElement>('[data-todos]')!;
}

const depths = [
	{ name: 'depth 1', Probe: ProbeDepth1 },
	{ name: 'depth 2', Probe: ProbeDepth2 },
	{ name: 'depth 3', Probe: ProbeDepth3 },
	{ name: 'depth 2, nested-field read', Probe: ProbeDepth2Field },
];

for (const { name, Probe } of depths) {
	test(`CSR ${name}: a draft row inside a browser-minted owner row saves its own prop`, async () => {
		const container = (await render(Probe)).container as HTMLElement;
		const list = await addSecondList(container);
		await saveIn(list, `Minted ${name}`);
		expect(container.querySelectorAll('[data-todos]')[0]!.querySelector('[data-saving-row]')).toBeNull();
	});
}

// renderSSR resolves its component by static import name, so each fixture gets its own call.
test('SSR depth 1: a draft row inside a served owner row saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth1)).container as HTMLElement;
	await saveIn(await firstList(container), 'Served 1');
});

test('SSR depth 2: a draft row inside a served owner row saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth2)).container as HTMLElement;
	await saveIn(await firstList(container), 'Served 2');
});

test('SSR depth 3: a draft row inside a served owner row saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth3)).container as HTMLElement;
	await saveIn(await firstList(container), 'Served 3');
});

test('SSR depth 2, nested-field read: a draft row inside a served owner row saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth2Field)).container as HTMLElement;
	await saveIn(await firstList(container), 'Served field');
});

test('SSR depth 1: a draft row inside an owner row minted after resume saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth1)).container as HTMLElement;
	await saveIn(await addSecondList(container), 'Resumed 1');
});

test('SSR depth 2: a draft row inside an owner row minted after resume saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth2)).container as HTMLElement;
	await saveIn(await addSecondList(container), 'Resumed 2');
});

test('SSR depth 3: a draft row inside an owner row minted after resume saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth3)).container as HTMLElement;
	await saveIn(await addSecondList(container), 'Resumed 3');
});

test('SSR depth 2, nested-field read: a draft row inside an owner row minted after resume saves its own prop', async () => {
	const container = (await renderSSR(ProbeDepth2Field)).container as HTMLElement;
	await saveIn(await addSecondList(container), 'Resumed field');
});

import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { PROTOCOL_SHARED_INSTANCES_PROPERTY } from '../../serializer/src/protocol-shared-instances.ts';
import type { ProtocolSharedInstances } from '../../serializer/src/protocol-shared-instances.ts';
import { ChoicePanel } from './shared-instances/choice.tsrx';
import { ChoiceReader } from './shared-instances/choice-reader.tsrx';
import { OwnChoicePanel } from './shared-instances/own-choice.tsrx';

// Containers on one document that resolve one shared() definition read and write one instance (spec 03).

afterEach(() => cleanup());

const shown = (root: ParentNode) => root.querySelector('[data-shown]')?.textContent;
const mode = (root: ParentNode) => root.querySelector('[data-mode]')?.getAttribute('data-mode');
const press = (root: ParentNode, selector: string) =>
	root.querySelector<HTMLButtonElement>(selector)!.click();
const instances = () =>
	(document as unknown as Record<string, ProtocolSharedInstances | undefined>)[
		PROTOCOL_SHARED_INSTANCES_PROPERTY
	];

test('SSR resume: two containers that share a key show each other’s writes', async () => {
	const first = (await renderSSR(ChoicePanel)).container;
	const second = (await renderSSR(ChoicePanel)).container;
	expect([shown(first), shown(second)]).toEqual(['cli', 'cli']);

	press(first, '[data-manual]');
	await expect.poll(() => shown(second)).toBe('manual');
	expect(mode(second)).toBe('chosen');
	expect(shown(first)).toBe('manual');

	press(second, '[data-auto]');
	await expect.poll(() => shown(first)).toBe('auto');
	expect(shown(second)).toBe('auto');
});

test('SSR resume: a container that only reads the key shows the other container’s write', async () => {
	const writer = (await renderSSR(ChoicePanel)).container;
	const reader = (await renderSSR(ChoiceReader)).container;
	expect(shown(reader)).toBe('cli');

	press(writer, '[data-manual]');
	await expect.poll(() => shown(reader)).toBe('manual');
});

test('CSR: two mounts that share a key show each other’s writes', async () => {
	const first = (await render(ChoicePanel)).container as HTMLElement;
	const second = (await render(ChoicePanel)).container as HTMLElement;

	press(first, '[data-manual]');
	await expect.poll(() => shown(second)).toBe('manual');
	expect(mode(second)).toBe('chosen');

	press(second, '[data-auto]');
	await expect.poll(() => shown(first)).toBe('auto');
});

test('a container mounted after a write starts from the live value', async () => {
	const first = (await renderSSR(ChoicePanel)).container;
	press(first, '[data-manual]');
	await expect.poll(() => shown(first)).toBe('manual');

	const later = (await render(ChoicePanel)).container as HTMLElement;
	await expect.poll(() => shown(later)).toBe('manual');
	expect(mode(later)).toBe('chosen');
});

test('container scope: each container keeps its own instance', async () => {
	const first = (await renderSSR(OwnChoicePanel)).container;
	const second = (await renderSSR(OwnChoicePanel)).container;

	press(first, '[data-manual]');
	await expect.poll(() => shown(first)).toBe('manual');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(shown(second)).toBe('cli');
	expect(instances()).toBeUndefined();
});

test('a container whose shape differs from the live instance keeps its own and says so once', async () => {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const first = (await renderSSR(ChoicePanel)).container;
		const state = JSON.parse(
			first.querySelector('script[type="markless/state"]')!.textContent ?? 'null',
		) as { readonly sharedDefinitions: ReadonlyArray<{ readonly id: string }> };
		const id = state.sharedDefinitions[0]!.id;
		const live = { [`${id}/state:c`]: { value: 'from another version', extra: 1 } };
		(document as unknown as Record<string, ProtocolSharedInstances>)[
			PROTOCOL_SHARED_INSTANCES_PROPERTY
		] = {
			version: 1,
			instances: { [id]: { shape: 'another version', cells: live, listeners: [] } },
		};

		press(first, '[data-manual]');
		await expect.poll(() => shown(first)).toBe('manual');
		press(first, '[data-auto]');
		await expect.poll(() => shown(first)).toBe('auto');

		const reports = errors.mock.calls.filter((call) =>
			String(call[0]).includes('MARKLESS_SHARED_SHAPE_MISMATCH'),
		);
		expect(reports).toHaveLength(1);
		expect(String(reports[0]![0])).toContain(id);
		expect(instances()!.instances[id]!.cells).toEqual(live);
	} finally {
		errors.mockRestore();
	}
});

test('cleanup leaves the next test a document with no live instances, as a reload would', async () => {
	const first = (await renderSSR(ChoicePanel)).container;
	press(first, '[data-manual]');
	await expect.poll(() => shown(first)).toBe('manual');
	expect(instances()).toBeDefined();
	await cleanup();
	expect(instances()).toBeUndefined();
	const fresh = (await renderSSR(ChoicePanel)).container;
	expect(shown(fresh)).toBe('cli');
});

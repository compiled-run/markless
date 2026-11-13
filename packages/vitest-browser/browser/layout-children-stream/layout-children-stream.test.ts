import {
	ASYNC_BOUNDARY_ARM,
	PROTOCOL_STATE_PATCH_SCRIPT_TYPE,
	PROTOCOL_STREAMED_ARM_SCRIPT_TYPE,
} from '../../../serializer/src/index.ts';
import { decodePayloadScriptsFromDocument } from '@markless/web/payload';
import { afterEach, expect, test } from 'vitest';
import { decodeProtocolPayloadLists } from '../../../serializer/src/protocol-record-templates.ts';
import { deserializeGraphValue } from '../../../serializer/src/value-decode.ts';
import { cleanup, renderServerHTML, renderStream } from '../../src/index.ts';
import BrokenInShell from './broken-in-shell.tsrx';
import DeepInShell from './deep-in-shell.tsrx';
import { browserLoads } from './load.ts';
import OneInShell from './one-in-shell.tsrx';
import RowsInChild from './rows-in-child.tsrx';
import ThreeInShell from './three-in-shell.tsrx';

// A component's async value answered on the server streams to the browser wherever the component sits:
// inside a layout's children, two components down, or in a component row of a child. The browser never loads it again.

afterEach(async () => {
	await cleanup();
	browserLoads.length = 0;
});

type Snapshot = { readonly status: string; readonly value?: unknown };
type StateDelta = {
	readonly cells?: ReadonlyArray<{ readonly graphNodeId: string; readonly value?: unknown }>;
	readonly computed?: ReadonlyArray<{ readonly graphNodeId: string; readonly snapshot?: Snapshot }>;
};

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

// The boundaries the shell served @pending, each named with the graph node of the value it waits on.
function pendingBoundaries(shell: string) {
	const { view } = decodePayloadScriptsFromDocument(parse(shell));
	return view.asyncBoundaries
		.filter((boundary) => boundary.initiallyServedArm === ASYNC_BOUNDARY_ARM.pending)
		.map((boundary) => ({ id: boundary.id, runner: boundary.runnerGraphNodeId! }));
}

// What each append streamed: the boundary it settles, the arm it took, and the state it carries.
function streamedArms(appends: ReadonlyArray<string>) {
	return appends.flatMap((chunk) => {
		const document = parse(chunk);
		const patches = [...document.querySelectorAll(`script[type="${PROTOCOL_STATE_PATCH_SCRIPT_TYPE}"]`)].map(
			(script) =>
				decodeProtocolPayloadLists('markless/state', JSON.parse(script.textContent ?? '{}')) as StateDelta,
		);
		return [...document.querySelectorAll(`script[type="${PROTOCOL_STREAMED_ARM_SCRIPT_TYPE}"]`)].map((script, index) => ({
			boundaryId: script.getAttribute('data-boundary'),
			arm: (JSON.parse(script.textContent ?? '[]') as [number])[0],
			patch: patches[index]!,
		}));
	});
}

// A stream append is parsed after the shell, so its inline scripts run as it lands.
function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

const texts = (root: ParentNode, selector: string) =>
	[...root.querySelectorAll(selector)].map((element) => element.textContent?.trim());

const shapes = [
	{ name: 'one card in a layout', page: OneInShell, stream: () => renderStream(OneInShell), answers: ['revenue ready'] },
	{
		name: 'three sibling cards in a layout',
		page: ThreeInShell,
		stream: () => renderStream(ThreeInShell),
		answers: ['cards ready', 'chart ready', 'latest ready'],
	},
	{ name: 'a card two components down in a layout', page: DeepInShell, stream: () => renderStream(DeepInShell), answers: ['deep ready'] },
	{
		name: 'a component row of a child component',
		page: RowsInChild,
		stream: () => renderStream(RowsInChild),
		answers: ['north ready', 'south ready'],
	},
];

for (const shape of shapes) {
	test(`${shape.name}: the server streams each answer and the browser shows it without loading it again`, async () => {
		const { shell, appends } = await shape.stream();
		const pending = pendingBoundaries(shell);
		expect(pending).toHaveLength(shape.answers.length);

		const streamed = streamedArms(appends);
		expect(streamed.map((arm) => arm.boundaryId).sort()).toEqual(pending.map((boundary) => boundary.id).sort());
		for (const boundary of pending) {
			const arm = streamed.find((candidate) => candidate.boundaryId === boundary.id)!;
			expect(arm.arm).toBe(ASYNC_BOUNDARY_ARM.try);
			const snapshot = arm.patch.computed?.find((entry) => entry.graphNodeId === boundary.runner)?.snapshot;
			expect(snapshot?.status).toBe('fulfilled');
		}
		const served = streamed.flatMap((arm) =>
			(arm.patch.computed ?? []).flatMap((entry) =>
				entry.snapshot?.status === 'fulfilled' ? [deserializeGraphValue(entry.snapshot.value as never)] : [],
			),
		);
		expect([...served].sort()).toEqual([...shape.answers].sort());

		const { container } = renderServerHTML(shell);
		expect(texts(container, '[data-card]')).toEqual([]);
		for (const chunk of appends) appendStreamed(container, chunk);
		await expect.poll(() => texts(container, '[data-card]').sort(), { timeout: 2_000 }).toEqual([...shape.answers].sort());
		// Longer than any load takes, so a browser load would have run and answered by now.
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(texts(container, '[data-card]').sort()).toEqual([...shape.answers].sort());
		expect(texts(container, '[data-card-pending]')).toEqual([]);
		expect(browserLoads).toEqual([]);
	});
}

test('a failed load in a layout child streams its @catch with the error, and the browser does not load it again', async () => {
	const { shell, appends } = await renderStream(BrokenInShell);
	const [boundary] = pendingBoundaries(shell);
	const [arm] = streamedArms(appends);
	expect(arm?.boundaryId).toBe(boundary!.id);
	expect(arm?.arm).toBe(ASYNC_BOUNDARY_ARM.catch);
	expect(arm?.patch.computed?.find((entry) => entry.graphNodeId === boundary!.runner)?.snapshot?.status).toBe('rejected');
	// The @catch's error cell rides the patch, so text reading the error still spells it after resume.
	const shownErrors = (arm?.patch.cells ?? []).flatMap((cell) => {
		const value = deserializeGraphValue(cell.value as never) as { readonly message?: unknown } | null;
		return value && typeof value === 'object' && 'message' in value ? [value.message] : [];
	});
	expect(shownErrors).toEqual(['broken invoices is down']);

	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(() => texts(container, '[data-card-failed]'), { timeout: 2_000 }).toEqual(['broken invoices is down (try 1)']);
	await new Promise((resolve) => setTimeout(resolve, 500));
	expect(texts(container, '[data-card-failed]')).toEqual(['broken invoices is down (try 1)']);
	expect(browserLoads).toEqual([]);
});

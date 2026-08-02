import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import {
	ASYNC_BOUNDARY_ARM,
	decodePayloadScripts,
	RuntimePayloadError,
	renderPayloadScripts,
} from '../src/index.ts';
import {
	decodePayloadScripts as decodeClientPayloadScripts,
	RuntimePayloadError as ClientRuntimePayloadError,
} from '../src/protocol-client-storage.ts';
import { decodePayloadScripts as decodeStorageFreePayloadScripts } from '../src/protocol-client.ts';
import { createProtocolStatePayload } from '../src/protocol-state.ts';
import { deserializeGraphValueForClient } from '../src/value-decode-client.ts';
import { deserializeGraphValue } from '../src/value-decode.ts';
import { serializeGraphValue } from '../src/value.ts';

test('serializer split modules expose value, protocol-state, and payload-script boundaries', () => {
	expect(typeof serializeGraphValue).toBe('function');
	expect(typeof deserializeGraphValue).toBe('function');
	expect(typeof deserializeGraphValueForClient).toBe('function');
	expect(typeof createProtocolStatePayload).toBe('function');
	expect(typeof renderPayloadScripts).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof RuntimePayloadError).toBe('function');
});

test.each([RuntimePayloadError, ClientRuntimePayloadError])(
	'%s preserves the structured runtime diagnostic shape',
	(ErrorType) => {
		const error = new ErrorType({
			code: 'MARKLESS_PAYLOAD_INVALID',
			severity: 'error',
			phase: 'payload',
			title: 'Invalid resumability payload',
			message: 'Expected markless/state payload script.',
			why: 'The payload script is required.',
			payloadType: 'markless/state',
			payloadScript: 'script[type="markless/state"]',
			suggestions: [{ message: 'Emit the state payload.' }],
			docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		});

		expect(error).toBeInstanceOf(ErrorType);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('RuntimePayloadError');
		expect(error.message).toBe('Expected markless/state payload script.');
		expect(error).toMatchObject({
			code: 'MARKLESS_PAYLOAD_INVALID',
			severity: 'error',
			phase: 'payload',
			payloadType: 'markless/state',
			payloadScript: 'script[type="markless/state"]',
		});
		expect(Object.hasOwn(error, 'expectedVersion')).toBe(true);
		expect(Object.hasOwn(error, 'actualVersion')).toBe(true);
	},
);

test('client value decoder keeps rare value records behind an async boundary', async () => {
	const common = serializeGraphValue({
		created: new Date('2026-07-05T00:00:00.000Z'),
		items: new Map([['ready', true]]),
	});
	expect(common.ok).toBe(true);
	if (!common.ok) return;
	expect(await deserializeGraphValueForClient(common.payload)).toEqual({
		created: new Date('2026-07-05T00:00:00.000Z'),
		items: new Map([['ready', true]]),
	});

	const rare = serializeGraphValue({
		pattern: /ready/gi,
		link: new URL('https://example.test/path'),
		bytes: new Uint8Array([1, 2, 3]),
	});
	expect(rare.ok).toBe(true);
	if (!rare.ok) return;
	const decoded = (await deserializeGraphValueForClient(rare.payload)) as {
		readonly pattern: RegExp;
		readonly link: URL;
		readonly bytes: Uint8Array;
	};
	expect(decoded.pattern.source).toBe('ready');
	expect(decoded.pattern.flags).toBe('gi');
	expect(decoded.link.href).toBe('https://example.test/path');
	expect([...decoded.bytes]).toEqual([1, 2, 3]);
});

test('the browser decoder accepts storage protocol version 2', () => {
	const rendered = renderPayloadScripts({
		state: {
			version: 2,
			cells: [
				{
					graphNodeId: 'storage:src/App.tsrx#theme-mode',
					name: 'theme',
					valueKind: 'scalar',
					value: { version: 1, root: 'light', records: [] },
				},
			],
			computed: [],
			storage: [
				{
					graphNodeId: 'storage:src/App.tsrx#theme-mode',
					key: 'theme-mode',
				},
			],
		},
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
	});

	expect(decodeClientPayloadScripts(rendered).state.version).toBe(2);
	// A derived markless:<identifier> key (with a colon) decodes fine.
	expect(
		decodeClientPayloadScripts({
			...rendered,
			stateScript: rendered.stateScript.replace('"theme-mode"', '"markless:theme"'),
		}).state.version,
	).toBe(2);
	// A structurally invalid key (whitespace) is still rejected.
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			stateScript: rendered.stateScript.replace('"theme-mode"', '"theme mode"'),
		}),
	).toThrow(/invalid storage record/);
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			stateScript: rendered.stateScript.replace(/,"storage":\[[^\]]+\]/, ''),
		}),
	).toThrow(/storage: expected array/);
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			stateScript: rendered.stateScript.replace('"version":2', '"version":3'),
		}),
	).toThrow(/Unsupported markless\/state protocol version 3/);
});

test('the storage-free browser decoder has no storage validation edge and rejects version 2', async () => {
	const source = await readFile(new URL('../src/protocol-client.ts', import.meta.url), 'utf8');
	expect(source).not.toMatch(/storage-key|storage-record-client|isValidStorageKey/);
	expect(() =>
		decodeStorageFreePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":2,"cells":[],"computed":[],"storage":[]}</script>',
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow(/Unsupported markless\/state protocol version 2/);
});

test('the browser decoder validates async boundary decision fields', () => {
	const rendered = renderPayloadScripts({
		state: { version: 1, cells: [], computed: [] },
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					runnerGraphNodeId: 'computed:details',
					initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
					asyncReads: [],
				},
			],
		} as never,
	});

	expect(decodeClientPayloadScripts(rendered).view.asyncBoundaries[0]).toMatchObject({
		runnerGraphNodeId: 'computed:details',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
	});
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			viewScript: rendered.viewScript.replace(
				'"runnerGraphNodeId":"computed:details"',
				'"runnerGraphNodeId":7',
			),
		}),
	).toThrow(/runnerGraphNodeId/);
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			viewScript: rendered.viewScript.replace(
				`"initiallyServedArm":${String(ASYNC_BOUNDARY_ARM.pending)}`,
				'"initiallyServedArm":9',
			),
		}),
	).toThrow(/initiallyServedArm/);
});

test('the browser decoder keeps the async boundary arm object out of its eager dependency path', async () => {
	const source = await readFile(new URL('../src/protocol-client.ts', import.meta.url), 'utf8');

	expect(source).not.toMatch(/\bASYNC_BOUNDARY_ARM\b/);
});

import { expect, test } from 'vitest';
import { decodePayloadScripts, RuntimePayloadError, renderPayloadScripts } from '../src/index.ts';
import {
	decodePayloadScripts as decodeClientPayloadScripts,
	RuntimePayloadError as ClientRuntimePayloadError,
} from '../src/protocol-client.ts';
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
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			stateScript: rendered.stateScript.replace('"theme-mode"', '"Theme_mode"'),
		}),
	).toThrow(/invalid storage record/);
	expect(() =>
		decodeClientPayloadScripts({
			...rendered,
			stateScript: rendered.stateScript.replace('"version":2', '"version":3'),
		}),
	).toThrow(/Unsupported markless\/state protocol version 3/);
});

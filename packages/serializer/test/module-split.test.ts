import { expect, test } from 'vitest';
import { decodePayloadScripts, RuntimePayloadError, renderPayloadScripts } from '../src/index.ts';
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

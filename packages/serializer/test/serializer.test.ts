import { expect, test } from 'vitest';
import { deserializeGraphValue, serializeGraphValue } from '../src/index.ts';

test('serializeGraphValue preserves identity cycles and built-ins', () => {
	const user: { id: number; manager?: unknown } = { id: 1 };
	user.manager = user;
	const value = {
		author: user,
		assignee: user,
		created: new Date('2026-06-14T12:00:00.000Z'),
		pattern: /menu/gi,
		url: new URL('https://example.com/app?x=1'),
		count: 3n,
		tags: new Set(['a', 'b']),
		meta: new Map<unknown, unknown>([[user, { active: true }]]),
	};

	const result = serializeGraphValue(value);

	expect(result.ok).toBe(true);
	if (!result.ok) return;

	const decoded = deserializeGraphValue(result.payload) as typeof value;

	expect(decoded.author).toBe(decoded.assignee);
	expect((decoded.author as typeof user).manager).toBe(decoded.author);
	expect(decoded.created).toEqual(new Date('2026-06-14T12:00:00.000Z'));
	expect(decoded.pattern).toEqual(/menu/gi);
	expect(decoded.url.toString()).toBe('https://example.com/app?x=1');
	expect(decoded.count).toBe(3n);
	expect([...decoded.tags]).toEqual(['a', 'b']);
	expect(decoded.meta.get(decoded.author)).toEqual({ active: true });
});

test('serializeGraphValue round-trips ArrayBuffer and typed array built-ins', () => {
	const buffer = new ArrayBuffer(4);
	new Uint8Array(buffer).set([1, 2, 3, 4]);
	const value = {
		buffer,
		bytes: new Uint8Array([5, 6, 7]),
		signed: new Int16Array([-1, 256]),
	};

	const result = serializeGraphValue(value);

	expect(result.ok).toBe(true);
	if (!result.ok) return;

	const decoded = deserializeGraphValue(result.payload) as typeof value;

	expect(decoded.buffer).toBeInstanceOf(ArrayBuffer);
	expect([...new Uint8Array(decoded.buffer)]).toEqual([1, 2, 3, 4]);
	expect(decoded.bytes).toBeInstanceOf(Uint8Array);
	expect([...decoded.bytes]).toEqual([5, 6, 7]);
	expect(decoded.signed).toBeInstanceOf(Int16Array);
	expect([...decoded.signed]).toEqual([-1, 256]);
});

test('serializeGraphValue preserves typed array backing buffer identity and offsets', () => {
	const buffer = new ArrayBuffer(8);
	new Uint8Array(buffer).set([0, 1, 2, 3, 4, 5, 6, 7]);
	const value = {
		buffer,
		bytes: new Uint8Array(buffer),
		words: new Uint16Array(buffer, 2, 2),
	};

	const result = serializeGraphValue(value);

	expect(result.ok).toBe(true);
	if (!result.ok) return;

	const decoded = deserializeGraphValue(result.payload) as typeof value;

	expect(decoded.bytes.buffer).toBe(decoded.buffer);
	expect(decoded.words.buffer).toBe(decoded.buffer);
	expect(decoded.words.byteOffset).toBe(2);
	expect(decoded.words.length).toBe(2);
	expect([...new Uint8Array(decoded.buffer)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
	expect([...decoded.words]).toEqual([770, 1284]);
});

test('serializeGraphValue preserves DataView backing buffer identity and offsets', () => {
	const buffer = new ArrayBuffer(8);
	new Uint8Array(buffer).set([0, 1, 2, 3, 4, 5, 6, 7]);
	const value = {
		buffer,
		bytes: new Uint8Array(buffer),
		view: new DataView(buffer, 2, 4),
	};

	const result = serializeGraphValue(value);

	expect(result.ok).toBe(true);
	if (!result.ok) return;

	const decoded = deserializeGraphValue(result.payload) as typeof value;

	expect(decoded.view).toBeInstanceOf(DataView);
	expect(decoded.view.buffer).toBe(decoded.buffer);
	expect(decoded.view.buffer).toBe(decoded.bytes.buffer);
	expect(decoded.view.byteOffset).toBe(2);
	expect(decoded.view.byteLength).toBe(4);
	expect(decoded.view.getUint16(0)).toBe(515);
	expect([...new Uint8Array(decoded.buffer)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
});

test('serializeGraphValue preserves built-in object identity for Date RegExp and URL', () => {
	const created = new Date('2026-06-14T12:00:00.000Z');
	const pattern = /menu/gi;
	const url = new URL('https://example.com/app?x=1');
	const value = {
		created,
		again: created,
		pattern,
		samePattern: pattern,
		url,
		sameUrl: url,
	};

	const result = serializeGraphValue(value);

	expect(result.ok).toBe(true);
	if (!result.ok) return;

	const decoded = deserializeGraphValue(result.payload) as typeof value;

	expect(decoded.created).toBe(decoded.again);
	expect(decoded.pattern).toBe(decoded.samePattern);
	expect(decoded.url).toBe(decoded.sameUrl);
	expect(decoded.created).toEqual(created);
	expect(decoded.pattern).toEqual(pattern);
	expect(decoded.url.toString()).toBe(url.toString());
});

test('serializeGraphValue reports unsupported values with a state path', () => {
	const result = serializeGraphValue({
		session: {
			socket: () => undefined,
		},
	});

	expect(result.ok).toBe(false);
	if (result.ok) return;

	expect(result.diagnostics).toEqual([
		{
			code: 'ARCADE_SERIALIZE_UNSUPPORTED_VALUE',
			severity: 'error',
			phase: 'serialization',
			title: 'Cannot serialize graph state value',
			path: ['session', 'socket'],
			statePath: 'session.socket',
			valueKind: 'function',
			message:
				'Cannot serialize value at session.socket because function values are not durable graph state.',
			why: 'Serialization is for durable graph state. Functions and host/runtime resources cannot be restored during resume.',
			suggestions: [
				{
					message:
						'Move runtime resources into attach={...}, make the value serializable state, or derive it with computed().',
				},
			],
			docsUrl: 'https://arcadejs.com/errors/ARCADE_SERIALIZE_UNSUPPORTED_VALUE',
		},
	]);
});

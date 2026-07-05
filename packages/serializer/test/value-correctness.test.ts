import { expect, test } from 'vitest';
import { deserializeGraphValue, serializeGraphValue } from '../src/index.ts';

class AppToken {
	constructor(readonly label: string) {}
	display(): string { return this.label; }
}

class RuntimeHandle {
	constructor(readonly url: string) {}
	close(): void {}
}
test('serializeGraphValue round-trips object fields with falsy values', () => {
	const value = {
		muted: false,
		retries: 0,
		note: '',
		fault: null,
		gap: undefined,
		active: true,
	};

	const result = serializeGraphValue(value);
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.payload.records[0]).toMatchObject({
		type: 'object',
		fields: expect.arrayContaining([
			['muted', false],
			['retries', 0],
			['note', ''],
			['fault', null],
			['gap', { $type: 'undefined' }],
			['active', true],
		]),
	});
	expect(deserializeGraphValue(result.payload)).toEqual(value);
});

test('serializeGraphValue round-trips falsy array items and collection entries', () => {
	const value = {
		list: [false, 0, '', null, undefined, true],
		map: new Map<unknown, unknown>([
			[false, 0],
			['', null],
			[undefined, false],
		]),
		set: new Set<unknown>([false, 0, '', null, undefined, true]),
	};

	const result = serializeGraphValue(value);
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	const decoded = deserializeGraphValue(result.payload) as typeof value;
	expect(decoded.list).toEqual(value.list);
	expect([...decoded.map.entries()]).toEqual([...value.map.entries()]);
	expect([...decoded.set.values()]).toEqual([...value.set.values()]);
});

test('serializeGraphValue includes false state fields in encoded records', () => {
	const result = serializeGraphValue({ drawer: { collapsed: false } });
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.payload.records).toContainEqual({
		id: 1,
		type: 'object',
		fields: [['collapsed', false]],
	});
});

test('serializeGraphValue diagnoses class and runtime resource instances', () => {
	for (const [field, value, valueKind] of [
		['token', new AppToken('abc'), 'AppToken'],
		['socket', new RuntimeHandle('wss://example.test'), 'RuntimeHandle'],
	] as const) {
		const result = serializeGraphValue({ session: { [field]: value } });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.diagnostics[0]).toMatchObject({
			code: 'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
			path: ['session', field],
			statePath: `session.${field}`,
			valueKind,
		});
		expect(result.diagnostics[0].message).toContain(`session.${field}`);
		expect(result.diagnostics[0].message).toContain(valueKind);
	}
});

test('serializeGraphValue keeps current behavior for supported and function values', () => {
	const nullPrototype = Object.create(null) as Record<string, unknown>;
	nullPrototype.ready = true;
	const supported = {
		plain: { ready: true },
		nullPrototype,
		when: new Date('2026-07-04T00:00:00.000Z'),
		pairs: new Map([[1, 'one']]),
		tags: new Set(['a']),
		bytes: new Uint8Array([1, 2, 3]),
	};

	const result = serializeGraphValue(supported);
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	const decoded = deserializeGraphValue(result.payload) as typeof supported;
	expect(decoded.plain).toEqual(supported.plain);
	expect(decoded.nullPrototype).toEqual({ ready: true });
	expect(decoded.when).toEqual(supported.when);
	expect([...decoded.pairs]).toEqual([...supported.pairs]);
	expect([...decoded.tags]).toEqual([...supported.tags]);
	expect([...decoded.bytes]).toEqual([...supported.bytes]);

	const functionResult = serializeGraphValue({ session: { socket: () => undefined } });
	expect(functionResult.ok).toBe(false);
	if (functionResult.ok) return;
	expect(functionResult.diagnostics[0]).toMatchObject({
		code: 'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		path: ['session', 'socket'],
		valueKind: 'function',
	});
});

import { isDeepStrictEqual } from 'node:util';
import { expect, it } from 'vitest';
import { nativeScriptOf } from '../src/passes/native-script.ts';

// The phone engine's structuredClone against Node's own (V8's, as Chromium's), run in this realm so values compare.
const engine = (): { structuredClone: (value: unknown) => unknown; FormData: new () => unknown } => {
	const global = Object.create(globalThis) as Record<string, unknown>;
	for (const name of ['structuredClone', 'FormData', '__marklessHost', '__markless']) global[name] = undefined;
	const { source } = nativeScriptOf([], []);
	new Function('globalThis', source)(global);
	return global as never;
};

it("clones data as the web's structuredClone does: types, shared and circular references, and what it refuses", () => {
	const { structuredClone: clone, FormData } = engine();
	const shared = { n: 1 };
	const circular: Record<string, unknown> = { name: 'loop' };
	circular['self'] = circular;
	const buffer = new ArrayBuffer(8);
	class Point {
		x = 1;
		get y() {
			return 2;
		}
	}
	const getter = Object.defineProperty({}, 'computed', { enumerable: true, get: () => 'read' });
	const cases: unknown[] = [
		undefined,
		null,
		0,
		-0,
		Number.NaN,
		'text',
		10n,
		true,
		{ a: [1, { b: 'c' }], d: null },
		Object.assign([] as number[], { 0: 1, 2: 3 }),
		Object.assign([1, 2], { extra: 'kept' }),
		new Date(1_700_000_000_000),
		/a+b/giu,
		new Map<unknown, unknown>([[{ key: 1 }, new Set([1, 'two'])]]),
		new Set([shared, shared]),
		{ first: shared, second: shared },
		circular,
		new Uint8Array([1, 2, 3]),
		[new Uint16Array(buffer, 0, 2), new Uint8Array(buffer, 4, 4)],
		new DataView(new ArrayBuffer(4), 1, 2),
		new Boolean(false),
		new Number(5),
		new String('boxed'),
		Object(3n),
		new TypeError('wrong'),
		new Point(),
		getter,
	];
	for (const value of cases) {
		const ours = clone(value);
		const theirs = structuredClone(value);
		expect(isDeepStrictEqual(ours, theirs), String(value)).toBe(true);
		if (value !== null && typeof value === 'object') expect(ours).not.toBe(value);
	}
	const sharedClone = clone({ first: shared, second: shared }) as { first: unknown; second: unknown };
	expect(sharedClone.first).toBe(sharedClone.second);
	const loop = clone(circular) as Record<string, unknown>;
	expect(loop['self']).toBe(loop);
	const views = clone([new Uint16Array(buffer, 0, 2), new Uint8Array(buffer, 4, 4)]) as ArrayBufferView[];
	expect(views[0]!.buffer).toBe(views[1]!.buffer);

	const refusal = (value: unknown) => {
		try {
			clone(value);
		} catch (error) {
			return [(error as Error).name, (error as Error).message];
		}
		return null;
	};
	expect(refusal(() => 1)).toEqual([
		'DataCloneError',
		"Failed to execute 'structuredClone' on 'Window': () => 1 could not be cloned.",
	]);
	expect(refusal({ deep: [Symbol('s')] })).toEqual([
		'DataCloneError',
		"Failed to execute 'structuredClone' on 'Window': Symbol(s) could not be cloned.",
	]);
	expect(refusal(new FormData())).toEqual([
		'DataCloneError',
		"Failed to execute 'structuredClone' on 'Window': FormData object could not be cloned.",
	]);
	expect(refusal(new WeakMap())).toEqual([
		'DataCloneError',
		"Failed to execute 'structuredClone' on 'Window': WeakMap object could not be cloned.",
	]);
});

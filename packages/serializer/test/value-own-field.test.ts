import { expect, test } from 'vitest';
import { setDataField, valueAlongPaths } from '../src/index.ts';

test('a "__proto__" key from data is an own field, and other keys assign as usual', () => {
	const target: Record<string, unknown> = {};
	setDataField(target, '__proto__', { admin: true });
	setDataField(target, 'name', 'ada');
	expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
	expect(target.admin).toBeUndefined();
	expect(Object.keys(target)).toEqual(['__proto__', 'name']);
	expect(({} as Record<string, unknown>).admin).toBeUndefined();
});

test('trimming a value to its read paths keeps a "__proto__" field as data', () => {
	const kept = valueAlongPaths(JSON.parse('{"__proto__":{"admin":true}}'), [['__proto__']]);
	expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
	expect(Object.getOwnPropertyDescriptor(kept, '__proto__')?.value).toEqual({ admin: true });
});

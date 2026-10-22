import { expect, test } from 'vitest';
import {
	protocolBoundSymbolBase,
	protocolBoundSymbolBaseEnd,
	protocolBoundSymbolPrefix,
} from '../src/protocol.ts';

const bind = (base: string, path: string) => `${protocolBoundSymbolPrefix(base)}:${path}`;

test('a plain base is percent-encoded, as before', () => {
	expect(bind('symbol:3', '0/1')).toBe('bound:symbol%3A3:0/1');
	expect(protocolBoundSymbolBase('bound:symbol%3A3:0/1')).toBe('symbol:3');
});

test('each level of nesting adds its own path once and reads back to the level below', () => {
	let id = 'symbol:19';
	const levels: string[] = [];
	for (let depth = 0; depth < 12; depth++) {
		levels.push(id);
		id = bind(id, '9/8/7');
	}
	expect(id).not.toContain('%25');
	expect(bind(id, '9/8/7').length - id.length).toBe(id.length - levels.at(-1)!.length);
	for (let depth = levels.length - 1; depth >= 0; depth--) {
		const base = protocolBoundSymbolBase(id)!;
		expect(base).toBe(levels[depth]);
		expect(id.slice(protocolBoundSymbolBaseEnd(id) + 1)).toBe('9/8/7');
		id = base;
	}
	expect(protocolBoundSymbolBase(id)).toBeUndefined();
});

test('parentheses inside a plain base or path segment cannot close a nested base early', () => {
	const inner = bind('symbol:(odd)', 'edge');
	expect(inner).toBe('bound:symbol%3A%28odd%29:edge');
	expect(protocolBoundSymbolBase(bind(inner, 'outer'))).toBe(inner);
});

test('an id that is not bound has no base', () => {
	expect(protocolBoundSymbolBaseEnd('symbol:1')).toBe(-1);
	expect(protocolBoundSymbolBase('c0:symbol:1')).toBeUndefined();
	expect(protocolBoundSymbolBaseEnd('bound:(bound:symbol%3A1:0')).toBe(-1);
});

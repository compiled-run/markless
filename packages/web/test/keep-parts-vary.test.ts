import { expect, test } from 'vitest';
import { KEEP_PARTS_HOOK, type KeepParts } from '../src/fns/keep-parts-hook.ts';
import { installKeepParts, PROTOCOL_KEEP_ATTRIBUTE } from '../src/fns/keep-parts.ts';

installKeepParts();
const keep = (globalThis as { [KEEP_PARTS_HOOK]?: KeepParts })[KEEP_PARTS_HOOK]!;

// A part whose root element's `disabled` attribute comes from a prop.
const child = {
	state: { cells: [{ graphNodeId: 'prop:props' }], computed: [] },
	view: {
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0 }],
		domUpdates: [
			{
				hostNodeId: 'h0',
				graphNodeId: 'prop:disabled',
				path: [],
				target: { kind: 'attribute', name: 'disabled' },
			},
		],
	},
};
const filler = `<span>${'words every page repeats '.repeat(30)}</span>`;
const hash = (html: string) =>
	new RegExp(`${PROTOCOL_KEEP_ATTRIBUTE}="([^"]+)"`).exec(keep(html, undefined, child))?.[1];

test('leaving out a prop-set attribute leaves a word of the same name inside another attribute value', () => {
	const plain = hash(`<button class="button extra" disabled="">${filler}</button>`);
	const worded = hash(`<button class="button disabled extra" disabled="">${filler}</button>`);
	expect(plain).toBeTruthy();
	expect(worded).toBeTruthy();
	expect(worded).not.toBe(plain);
	expect(hash(`<button class="button disabled extra">${filler}</button>`)).toBe(worded);
});

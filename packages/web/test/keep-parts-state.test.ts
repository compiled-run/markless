import { expect, test } from 'vitest';
import { KEEP_PARTS_HOOK, type KeepParts } from '../src/fns/keep-parts-hook.ts';
import {
	installKeepParts,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_INSTANCE_ATTRIBUTE,
	PROTOCOL_VARY_ATTRIBUTE,
} from '../src/fns/keep-parts.ts';

installKeepParts();
const keep = (globalThis as { [KEEP_PARTS_HOOK]?: KeepParts })[KEEP_PARTS_HOOK]!;

// A part with its own count: the button raises it, the second span shows it, the root's `data-open` follows it.
const counter = (options: { readonly source?: string; readonly repeatOver?: string } = {}) => ({
	state: {
		cells: [{ graphNodeId: 'state:count' }, { graphNodeId: 'prop:props' }],
		computed: [
			{ graphNodeId: 'computed:open', dependencies: [{ graphNodeId: 'state:count' }] },
			{ graphNodeId: 'computed:rows', dependencies: [{ graphNodeId: 'prop:props' }] },
		],
	},
	view: {
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0 },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1 },
			{ hostNodeId: 'h3', strategy: 'dom-order', index: 3 },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:0'] }],
		domUpdates: [
			{
				hostNodeId: 'h0',
				source: 'open',
				graphNodeId: 'computed:open',
				path: [],
				target: { kind: 'attribute', name: 'data-open' },
			},
			{
				hostNodeId: 'h3',
				source: options.source ?? 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
			},
		],
		keyedRepeats: options.repeatOver
			? [{ id: 'repeat:0', collectionGraphNodeId: options.repeatOver }]
			: [],
	},
	structure: { locators: [{ hostNodeId: 'c2:h0', index: 0 }] },
});
const filler = `<span>${'words every page repeats '.repeat(30)}</span>`;
const markup = (open: string, count: string, note = 'Count') =>
	`<div class="counter" data-open="${open}"><button type="button">Raise</button><span>${note}</span><span>${count}</span>${filler}</div>`;
const attribute = (html: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];

test('a part with state is kept with its instance path, and what its records write is left out of the hash', () => {
	const first = keep(markup('false', '0'), undefined, counter());
	const later = keep(markup('true', '7'), undefined, counter());
	expect(attribute(first, PROTOCOL_KEEP_ATTRIBUTE)).toBeTruthy();
	expect(attribute(first, PROTOCOL_KEEP_ATTRIBUTE)).toBe(
		attribute(later, PROTOCOL_KEEP_ATTRIBUTE),
	);
	expect(attribute(first, PROTOCOL_KEEP_INSTANCE_ATTRIBUTE)).toBe('c2:');
	expect(first).toContain(`<button ${PROTOCOL_VARY_ATTRIBUTE}="m:on" type="button">`);
	expect(first).toContain(`<span ${PROTOCOL_VARY_ATTRIBUTE}="#text">0</span>`);
});

test('text no record writes stays in the hash, and so does the shape of the records', () => {
	const hash = (html: string, child: object) =>
		attribute(keep(html, undefined, child), PROTOCOL_KEEP_ATTRIBUTE);
	const plain = hash(markup('false', '0'), counter());
	expect(hash(markup('false', '0', 'Total'), counter())).not.toBe(plain);
	expect(hash(markup('false', '0'), counter({ source: 'count * 2' }))).not.toBe(plain);
});

test('a list over the part props is kept, and a list over its state is not', () => {
	expect(
		keep(markup('false', '0'), undefined, counter({ repeatOver: 'computed:rows' })),
	).toContain(PROTOCOL_KEEP_ATTRIBUTE);
	expect(
		keep(markup('false', '0'), undefined, counter({ repeatOver: 'state:count' })),
	).not.toContain(PROTOCOL_KEEP_ATTRIBUTE);
});

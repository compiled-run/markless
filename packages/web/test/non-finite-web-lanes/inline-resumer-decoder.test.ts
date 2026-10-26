import { afterEach, expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	encodeProtocolPayloadLists,
	renderPayloadScripts,
} from '../../../serializer/src/index.ts';
import {
	createInlineResumerSource,
	INLINE_MODULE_LOADER_SOURCE,
	INLINE_RESUMER_PAGE_TOKEN,
	renderInlineResumerPageSource,
} from '../../src/inline/resumer.ts';
import { inlineResumerPage } from '../../src/render-to-string.ts';

const BOOT_TAIL = `(${INLINE_MODULE_LOADER_SOURCE},${INLINE_RESUMER_PAGE_TOKEN});`;

type SharedGraphPolicy = {
	read?: (container: unknown, graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
};

const globalScope = globalThis as typeof globalThis & {
	__marklessInlineSyncPolicy?: SharedGraphPolicy;
	document?: unknown;
};

afterEach(() => {
	delete globalScope.__marklessInlineSyncPolicy;
});

// The inline resumer's shared graph policy is the only decoder on the page
// before the resume module loads, so a `graph-truthy` condition reads the
// served cell through it.
function bootSharedGraphPolicy(): SharedGraphPolicy {
	const source = createInlineResumerSource({
		debug: false,
		executionLog: 'never',
		graphSyncPolicy: true,
		resumeModuleUrl: '/build/resume.js',
		sharedGraphPolicy: true,
		syncPolicy: true,
	});
	expect(source).toContain(BOOT_TAIL);

	const view = {
		asyncBoundaries: [],
		behaviors: [],
		domUpdates: [],
		events: [],
		locators: [],
	};
	const root = {
		addEventListener: () => {},
		querySelector: () => null,
	};
	const fakeDocument = {
		currentScript: {
			closest: (selector: string) => (selector === '[data-async-container]' ? root : null),
			getAttribute: () => null,
		},
		createTreeWalker: () => ({ nextNode: () => null }),
	};
	const previousDocument = globalScope.document;
	try {
		const runnable = renderInlineResumerPageSource(
			source.replace(BOOT_TAIL, `(__load,${INLINE_RESUMER_PAGE_TOKEN});`),
			inlineResumerPage(view as never),
		);
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		new Function('document', 'addEventListener', '__load', runnable)(
			fakeDocument,
			() => {},
			() => Promise.resolve({}),
		);
	} finally {
		globalScope.document = previousDocument;
	}

	const shared = globalScope.__marklessInlineSyncPolicy;
	if (!shared?.read) throw new Error('inline shared graph policy did not install');
	return shared;
}

function container(
	value: unknown,
	cells: ReadonlyArray<Parameters<typeof createProtocolStatePayload>[0]['cells'][number]> = [
		{ graphNodeId: 'limit', name: 'limit', valueKind: 'scalar', value },
	],
	encode?: typeof encodeProtocolPayloadLists,
) {
	const scripts = renderPayloadScripts(
		{
			state: createProtocolStatePayload({ cells }),
			view: {
				version: 1,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
		} as never,
		encode,
	);
	return {
		querySelector: () => ({
			textContent: scripts.stateScript.replace(/^<script[^>]*>/, '').replace('</script>', ''),
		}),
	};
}

test.each([
	['Infinity', Number.POSITIVE_INFINITY],
	['-Infinity', Number.NEGATIVE_INFINITY],
	['NaN', Number.NaN],
])('the inline resumer decodes a %s cell', (_name, value) => {
	const shared = bootSharedGraphPolicy();
	expect(shared.read!(container(value), 'limit', [])).toBe(value);
});

test('the inline resumer leaves a finite cell alone', () => {
	const shared = bootSharedGraphPolicy();
	expect(shared.read!(container(3.5), 'limit', [])).toBe(3.5);
});

test('the inline resumer decodes a non-finite object field', () => {
	const shared = bootSharedGraphPolicy();
	expect(
		shared.read!(container({ maxWidth: Number.POSITIVE_INFINITY }), 'limit', ['maxWidth']),
	).toBe(Number.POSITIVE_INFINITY);
});

test('the inline resumer reads a row cell out of a templated cell list', () => {
	const shared = bootSharedGraphPolicy();
	const kids = [{ id: 7, label: 'kid' }];
	const rows = Array.from({ length: 12 }, (_, row) => `c0:${'r:1:c0:'.repeat(row)}`);
	const cells = rows.flatMap((path) => [
		{
			graphNodeId: `${path}state:open`,
			name: 'open',
			valueKind: 'scalar' as const,
			value: true,
		},
		{
			graphNodeId: `${path}prop:props`,
			name: 'props',
			valueKind: 'object' as const,
			value: { kids },
		},
	]);
	const served = container(undefined, cells, encodeProtocolPayloadLists);
	expect(served.querySelector().textContent).toContain('"instancePaths"');
	expect(shared.read!(served, `${rows[11]}state:open`, [])).toBe(true);
	expect(shared.read!(served, `${rows[9]}prop:props`, ['kids', '0', 'label'])).toBe('kid');
});

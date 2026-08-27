import { afterEach, expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../../serializer/src/index.ts';
import { createInlineResumerSource } from '../../src/inline/resumer.ts';

const LOADER_TAIL = '((url) => import(/* @vite-ignore */ url));';

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
	expect(source).toContain(LOADER_TAIL);

	const root = {
		addEventListener: () => {},
		querySelector: () => ({
			textContent: JSON.stringify({
				asyncBoundaries: [],
				behaviors: [],
				domUpdates: [],
				events: [],
				locators: [],
			}),
		}),
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
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		new Function('document', '__load', source.replace(LOADER_TAIL, '(__load);'))(
			fakeDocument,
			() => Promise.resolve({}),
		);
	} finally {
		globalScope.document = previousDocument;
	}

	const shared = globalScope.__marklessInlineSyncPolicy;
	if (!shared?.read) throw new Error('inline shared graph policy did not install');
	return shared;
}

function container(value: unknown) {
	const scripts = renderPayloadScripts({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'limit', name: 'limit', valueKind: 'scalar', value }],
		}),
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
	} as never);
	return {
		querySelector: () => ({
			textContent: scripts.stateScript
				.replace(/^<script[^>]*>/, '')
				.replace('</script>', ''),
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
	expect(shared.read!(container({ maxWidth: Number.POSITIVE_INFINITY }), 'limit', ['maxWidth'])).toBe(
		Number.POSITIVE_INFINITY,
	);
});

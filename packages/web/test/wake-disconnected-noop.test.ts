import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import type { ProtocolViewPayload } from '@markless/serializer';
import { resumeFromPayloadDocument } from '../src/index.ts';
import { disposeResumedPayload } from '../src/payload-full.ts';

// A container can be torn down while its first resume is still in flight:
// dispose files nothing (the resume never reached the registry) and the root
// leaves the document. The late wake that follows must not boot a runtime
// against the dead page - it would re-read served locators against DOM that is
// gone and refuse, and every wake caller discards the promise.

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	isConnected: boolean;
	readonly listeners: Array<{ readonly type: string }>;
	addEventListener(type: string): void;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		childNodes,
		isConnected: true,
		listeners: [],
		addEventListener(type) {
			this.listeners.push({ type });
		},
	};
}

function view(): ProtocolViewPayload {
	return {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function payloadDocument() {
	const scripts = renderPayloadScripts({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
		}),
		view: view(),
	});
	const content = (script: string) =>
		script.replace(/^<script type="markless\/(?:state|view)">/, '').replace('</script>', '');
	const entries: Record<string, { readonly textContent: string } | undefined> = {
		'script[type="markless/state"]': { textContent: content(scripts.stateScript) },
		'script[type="markless/view"]': { textContent: content(scripts.viewScript) },
	};
	return {
		querySelector(selector: string) {
			return entries[selector] ?? null;
		},
	};
}

// The shape a torn-down container leaves behind: emptied by the teardown and
// out of the document, so the served button locator can no longer resolve.
function tornDownRoot(): FakeElement {
	const root = element('SECTION');
	root.isConnected = false;
	return root;
}

test('a wake on a root that left the document is a no-op instead of a refused boot', async () => {
	const root = tornDownRoot();
	// The generated wake handoff claims the container before it calls in.
	(root as FakeElement & { __asyncResumeRuntimeStarted?: boolean }).__asyncResumeRuntimeStarted =
		true;

	const result = await resumeFromPayloadDocument({
		document: payloadDocument(),
		root: root as never,
		loadSymbol: () => {
			throw new Error('a detached wake must not resolve symbols');
		},
	});

	await expect(result.runtime.dispatch({ type: 'click', target: root } as never)).resolves.toBe(
		undefined,
	);
	expect(root.listeners).toEqual([]);
});

test('an explicit resume on a detached root stays loud', async () => {
	const root = tornDownRoot();

	await expect(
		resumeFromPayloadDocument({
			document: payloadDocument(),
			root: root as never,
			loadSymbol: () => () => undefined,
		}),
	).rejects.toThrow();
});

test('a wake boot that refuses on a live root is reported once instead of left unhandled', async () => {
	// Still in the document, so the census is worth being right about: the
	// refusal must surface, but through the host's error sink rather than as a
	// rejection every wake site drops on the floor.
	const root = element('SECTION');
	(root as FakeElement & { __asyncResumeRuntimeStarted?: boolean }).__asyncResumeRuntimeStarted =
		true;
	const host = globalThis as { reportError?: (error: unknown) => void };
	const previous = host.reportError;
	const reports: unknown[] = [];
	host.reportError = (error) => {
		reports.push(error);
	};
	try {
		const result = await resumeFromPayloadDocument({
			document: payloadDocument(),
			root: root as never,
			loadSymbol: () => () => undefined,
		});
		await expect(
			result.runtime.dispatch({ type: 'click', target: root } as never),
		).resolves.toBe(undefined);
	} finally {
		if (previous) host.reportError = previous;
		else delete host.reportError;
	}

	expect(reports).toHaveLength(1);
	expect(reports[0]).toMatchObject({
		phase: 'runtime',
		severity: 'error',
		message: expect.stringContaining('Resume locator h1'),
	});
});

test('a disposed root still in the document re-boots', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const first = await resumeFromPayloadDocument({
		document: payloadDocument(),
		root: root as never,
		loadSymbol: () => () => undefined,
	});
	disposeResumedPayload(root as never);

	const second = await resumeFromPayloadDocument({
		document: payloadDocument(),
		root: root as never,
		loadSymbol: () => () => undefined,
	});
	expect(second.runtime).not.toBe(first.runtime);
	expect(second.warnings).toBe(undefined);
});

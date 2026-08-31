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

function payloadDocument(stateText?: string) {
	const scripts = renderPayloadScripts({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
		}),
		view: view(),
	});
	const content = (script: string) =>
		script.replace(/^<script type="markless\/(?:state|view)">/, '').replace('</script>', '');
	const entries: Record<string, { readonly textContent: string } | undefined> = {
		'script[type="markless/state"]': { textContent: stateText ?? content(scripts.stateScript) },
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

// Connected when the wake called in, so nothing filed it as retired; the
// teardown lands while the boot is in flight. Reading the children is the first
// thing locator resolution does, which is where the container goes away.
function tornDownMidBoot(): FakeElement {
	const root = element('SECTION');
	let connected = true;
	Object.defineProperty(root, 'isConnected', { get: () => connected });
	Object.defineProperty(root, 'childNodes', {
		get: () => {
			connected = false;
			return [];
		},
	});
	return root;
}

test('a wake boot that refuses after its container left the document is a silent no-op', async () => {
	const root = tornDownMidBoot();
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

	expect(root.isConnected).toBe(false);
	expect(reports).toEqual([]);
});

// The other half: a container still in the document keeps the boot's rejection.
// Generated wake code drops the promise, so the page's unhandled-rejection
// reporting is what sees the refusal, carrying the payload's own code and docs
// link. Routing it to the host error sink instead would swap a rejection a page
// can cancel for an uncancellable global error.
test('a tampered payload on a live wake root rejects with its own code and docs link', async () => {
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
		await expect(
			resumeFromPayloadDocument({
				document: payloadDocument(JSON.stringify({ version: 1, cells: 'tampered' })),
				root: root as never,
				loadSymbol: () => () => undefined,
			}),
		).rejects.toMatchObject({
			code: 'MARKLESS_PAYLOAD_INVALID',
			docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		});
	} finally {
		if (previous) host.reportError = previous;
		else delete host.reportError;
	}

	// One surface, not two: the rejection is the report.
	expect(reports).toEqual([]);
});

test('a wake boot that refuses on a root still in the document keeps its rejection', async () => {
	const root = element('SECTION');
	(root as FakeElement & { __asyncResumeRuntimeStarted?: boolean }).__asyncResumeRuntimeStarted =
		true;

	await expect(
		resumeFromPayloadDocument({
			document: payloadDocument(),
			root: root as never,
			loadSymbol: () => () => undefined,
		}),
	).rejects.toThrow(/Resume locator h1/);
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

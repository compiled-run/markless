import { expect, test } from 'vitest';
import { emitResumeModule } from '../src/source-module.ts';

// The registration contract in `emitQueuedResumeContainerEvent` is
// `(handoff, fallback)`: a registered handler owns the event only if it can
// handle it, and must pass everything else down the chain. The staged prerender
// dispatcher honors it. The ungrouped full-prerender fallback used to register a
// ONE-parameter function, which silently dropped `fallback` and made the trigger
// group loader unreachable for the life of the page — one click on a recordless
// spot killed every grouped interaction after it.
//
// These tests run the emitted module for real (dynamic imports stubbed) rather
// than matching its text, because the defect was behavioral: the strings all
// looked right.

const baseInput = {
	filename: '/workspace/app/src/App.tsrx',
	payloadId: 'virtual:markless:payload',
	resolverId: 'virtual:markless:resolver',
	environment: 'client' as const,
	clientOutput: 'full' as const,
	publicRenderModuleSource: '',
	publicRenderRootExportName: null,
	publicCsrModuleSource: '',
	publicRenderCsrExportName: null,
	publicSsrModuleSource: '',
	publicRenderSsrExportName: null,
	symbols: [{ id: 'symbol:click', chunk: './click.js', exportName: 'onClick' }],
	symbolRoutes: [],
	needsFullResume: true,
	recordsOnly: true,
	prerenderDataId: 'virtual:markless:render-data:app',
	prerenderTriggerGroups: [
		{
			id: 'host:play:click',
			hostNodeId: 'host:play',
			eventName: 'click',
			hostIndex: 1,
			hostTagName: 'button',
			moduleId: 'virtual:markless:trigger-group:App:0',
		},
	],
};

type Handoff = { readonly event: { readonly type?: string; readonly target?: unknown } };
type Registered = (handoff: Handoff, fallback: (handoff: Handoff) => unknown) => unknown;

function stagedHarness() {
	const calls: string[] = [];
	const registrations: Registered[] = [];
	let fullResumeBuilds = 0;
	let groupRegistered = false;
	let rawRegister: ((next: Registered) => void) | undefined;

	const groupedHost = {
		tagName: 'BUTTON',
		contains: (node: unknown) => node === groupedHost,
	};
	const root: Record<string, unknown> = {};
	// Probe the registration the emitted module installs on itself, so the test
	// can read the arity of every handler that seizes the chain.
	Object.defineProperty(root, '__marklessRegisterDispatch', {
		configurable: true,
		get: () => (next: Registered) => {
			registrations.push(next);
			rawRegister?.(next);
		},
		set: (value: (next: Registered) => void) => {
			rawRegister = value;
		},
	});

	const modules: Record<string, Record<string, unknown>> = {
		'virtual:markless:render-data:app': { marklessPrerenderData: { records: true } },
		'virtual:markless:trigger-group:App:0': {
			groupId: 'play',
			state: {},
			view: {},
			graphNodeIds: [],
			loadSymbol: () => {},
		},
		'@markless/web/fns/prerender-trigger-resume': {
			mergePrerenderPayloadRecords: (records: unknown) => records,
			// Mirrors resumePrerenderTriggerGroup: one registration for the
			// container, arity 2, unmatched events handed to `fallback`.
			resumePrerenderTriggerGroup: async ({ groupId }: { groupId: string }) => {
				const runtime = {
					dispatch: () => {
						calls.push(`group:${groupId}`);
					},
				};
				if (!groupRegistered) {
					groupRegistered = true;
					(root.__marklessRegisterDispatch as (next: Registered) => void)(
						async (handoff, fallback) => {
							if (handoff.event?.target === groupedHost) runtime.dispatch();
							else await fallback(handoff);
						},
					);
				}
				return { runtime };
			},
		},
		'@markless/web/fns/prerender-resume': {
			derivePrerenderResumeRecords: async () => ({}),
			renderPrerenderBoundary: () => {},
			resumeFromPrerenderRecords: async () => {
				fullResumeBuilds += 1;
				return {
					runtime: {
						dispatch: () => {
							calls.push('full');
						},
					},
				};
			},
		},
	};

	const source =
		emitResumeModule(baseInput as never)
			.replace(/^import [^\n]*;$/gm, '')
			.replace(/^export function resumeContainerEvent/m, 'function resumeContainerEvent')
			.replace(/\bimport\(/g, '__mxImport(') + '\nreturn resumeContainerEvent;';
	const resumeContainerEvent = new Function(
		'__mxImport',
		'marklessFindElementAtDomOrderIndex',
		'payloadRuntimeDemandMap',
		source,
	)(
		async (id: string) => {
			const module = modules[id];
			if (!module) throw new Error(`unstubbed import ${id}`);
			return module;
		},
		(_root: unknown, index: number) => (index === 1 ? groupedHost : null),
		{ actions: [] },
	) as (input: unknown) => Promise<void>;

	const dispatch = (target: unknown) =>
		resumeContainerEvent({ root, event: { type: 'click', target }, element: target });

	return {
		calls,
		registrations,
		groupedHost,
		recordless: () => dispatch({ nodeType: 1 }),
		grouped: () => dispatch(groupedHost),
		fullResumeBuilds: () => fullResumeBuilds,
	};
}

test('a recordless click leaves grouped interactions reachable', async () => {
	const harness = stagedHarness();

	await harness.recordless();
	await harness.grouped();

	expect(harness.calls).toEqual(['full', 'group:play']);
});

test('every handler registered on the dispatch chain accepts the fallback', async () => {
	const harness = stagedHarness();

	await harness.recordless();
	await harness.grouped();
	await harness.recordless();

	expect(harness.registrations.map((next) => next.length)).toEqual(
		harness.registrations.map(() => 2),
	);
});

test('repeated recordless clicks reuse one ungrouped fallback runtime', async () => {
	const harness = stagedHarness();

	await harness.recordless();
	await harness.recordless();
	await harness.recordless();

	expect(harness.fullResumeBuilds()).toBe(1);
	expect(harness.calls).toEqual(['full', 'full', 'full']);
});

test('grouped interactions still route to their group after the fallback ran', async () => {
	const harness = stagedHarness();

	await harness.grouped();
	await harness.recordless();
	await harness.grouped();

	expect(harness.calls).toEqual(['group:play', 'full', 'group:play']);
});

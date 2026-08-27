import { expect, test } from 'vitest';
import { emitResumeModule } from '../src/source-module.ts';

// The non-staged prerender-data handoff runs on EVERY event: the inline resumer
// re-enters `resumeContainerEvent` per delegated event, so an uncached body
// re-derives the entire render-data surface every time and hands each dispatch a
// freshly built runtime object. These tests run the emitted module for real
// (dynamic imports stubbed) rather than matching its text, the way the staged
// fallback's routing tests do.

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
	// No trigger groups: this is the linked render-data page, not a staged one.
	prerenderDataId: 'virtual:markless:render-data:app',
};

function nonStagedHarness() {
	const dispatched: string[] = [];
	let derives = 0;
	let runtimeBuilds = 0;
	const runtimes: unknown[] = [];
	const root: Record<string, unknown> = {
		querySelector: () => null,
	};

	const modules: Record<string, Record<string, unknown>> = {
		'@markless/web/fns/prerender-resume': {
			derivePrerenderResumeRecords: async () => {
				derives += 1;
				return {};
			},
			mergePrerenderPayloadRecords: (records: unknown) => records,
			renderPrerenderBoundary: () => {},
			resumeFromPrerenderRecords: async () => {
				runtimeBuilds += 1;
				// State a resumed runtime owns — an arm commit's records live here.
				// A replacement runtime starts over with none of it.
				const runtime = {
					hits: 0,
					dispatch: () => {
						runtime.hits += 1;
						dispatched.push(`hits:${runtime.hits}`);
					},
				};
				runtimes.push(runtime);
				return { runtime };
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
		'marklessPrerenderData',
		'payloadRuntimeDemandMap',
		source,
	)(
		async (id: string) => {
			const module = modules[id];
			if (!module) throw new Error(`unstubbed import ${id}`);
			return module;
		},
		{ renderData: {}, components: {} },
		{ actions: [] },
	) as (input: unknown) => Promise<void>;

	let clock = 0;
	return {
		dispatched,
		derives: () => derives,
		runtimeBuilds: () => runtimeBuilds,
		runtimes,
		// Each event needs its own identity: the emitted dispatch queue drops a
		// repeat of the same event object at the same timestamp.
		click: () => {
			clock += 1;
			const target = { nodeType: 1 };
			return resumeContainerEvent({
				root,
				event: { type: 'click', target, timeStamp: clock },
				element: target,
			});
		},
	};
}

test('repeated events on a linked render-data page reuse one runtime', async () => {
	const harness = nonStagedHarness();

	await harness.click();
	await harness.click();
	await harness.click();

	expect(harness.runtimeBuilds()).toBe(1);
	expect(new Set(harness.runtimes).size).toBe(1);
});

test('the render-data surface is derived once per container, not once per event', async () => {
	const harness = nonStagedHarness();

	await harness.click();
	await harness.click();

	expect(harness.derives()).toBe(1);
});

// `resumeFromPrerenderRecordsImpl` keeps its own per-root registry, so the live
// system already deduped the runtime object behind this handoff. This row pins
// the contract at the handoff itself: one runtime per container, not one that
// only survives because a WeakMap downstream happens to catch it.
test('state the resumed runtime holds accumulates across events instead of resetting', async () => {
	const harness = nonStagedHarness();

	await harness.click();
	await harness.click();

	expect(harness.dispatched).toEqual(['hits:1', 'hits:2']);
});

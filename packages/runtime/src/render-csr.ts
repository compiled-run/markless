import type { ProtocolStatePayload, ProtocolViewPayload } from '@arcade/protocol';
import type { EventOnlyResumeDomElement, EventOnlyResumeDomEvent } from './event-only-resume.ts';
import type { RuntimeGraph } from './graph.ts';
import type { CsrRenderContainer, CsrRenderOptions, CsrRenderOutput } from './render.ts';
import type { ResumeRuntimeInput } from './resume.ts';

export async function renderCsrRuntime(input: {
	readonly output: CsrRenderOutput;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly options: CsrRenderOptions;
}): Promise<CsrRenderContainer> {
	const { output, state, view, loadSymbol, options } = input;

	if (canUseEventOnlyCsrRuntime(output, state, view)) {
		const { createEventOnlyResumeContainerFromPayloads } =
			await import('./event-only-resume.ts');
		const runtime = await createEventOnlyResumeContainerFromPayloads({
			root: output.root as EventOnlyResumeDomElement,
			state,
			view,
			loadSymbol: loadSymbol as unknown as Parameters<
				typeof createEventOnlyResumeContainerFromPayloads
			>[0]['loadSymbol'],
		});
		for (const eventName of new Set(view.events.map((event) => event.eventName))) {
			output.root.addEventListener?.(
				eventName,
				async (event: EventOnlyResumeDomEvent) => {
					await runtime.dispatch(event);
				},
				{ capture: true },
			);
		}

		return {
			phase: 'csr',
			root: output.root,
			graph: runtime.graph as RuntimeGraph,
			runtime,
		};
	}

	const graph = output.graph ?? (await createFullRuntimeGraph(state, !!output.state));
	const { createResumeRuntime } = await import('./resume.ts');
	const runtime = createResumeRuntime({
		root: output.root,
		graph,
		view,
		loadSymbol,
		createVisibilityObserver: options.createVisibilityObserver,
		createRemovalObserver: options.createRemovalObserver,
		applyDomJournal: options.applyDomJournal,
	});
	await runtime.start();

	return {
		phase: 'csr',
		root: output.root,
		graph,
		runtime,
	};
}

function canUseEventOnlyCsrRuntime(
	output: CsrRenderOutput,
	state: ProtocolStatePayload,
	view: ProtocolViewPayload,
): boolean {
	if (output.graph) return false;
	if ((state.sharedDefinitions?.length ?? 0) > 0) return false;
	if (state.computed.length > 0) return false;
	if (view.behaviors.length > 0) return false;
	if (view.elementHandles.length > 0) return false;
	if (view.asyncBoundaries.length > 0) return false;
	if (view.events.some((event) => event.eventName === 'visible' || !!event.syncPolicy)) {
		return false;
	}
	return true;
}

async function createFullRuntimeGraph(
	state: ProtocolStatePayload,
	hasAuthoredState: boolean,
): Promise<RuntimeGraph> {
	if (hasAuthoredState) {
		const { createRuntimeGraphFromStatePayload } = await import('./payload.ts');
		return createRuntimeGraphFromStatePayload(state);
	}

	const { createRuntimeGraph } = await import('./graph.ts');
	return createRuntimeGraph({ cells: [] });
}

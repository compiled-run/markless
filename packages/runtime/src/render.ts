import type { ProtocolStatePayload, ProtocolViewPayload } from '@arcade/protocol';
import {
	createEventOnlyCsrContainer,
	startEventOnlyCsrRuntime,
	type EventOnlyCsrContainer,
} from './event-only-csr.ts';
import type { RuntimeGraph } from './graph.ts';
import type {
	ResumeDomElement,
	ResumeRuntime,
	ResumeRuntimeInput,
	ResumeSymbol,
} from './resume.ts';

export type RenderTarget = {
	readonly replaceChildren?: (...children: ReadonlyArray<ResumeDomElement>) => void;
	readonly appendChild?: (child: ResumeDomElement) => unknown;
};

export type CsrRenderOutput = {
	readonly root: ResumeDomElement;
	readonly graph?: RuntimeGraph;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
};

export type CsrRenderOptions = {
	readonly target: RenderTarget;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
	readonly createRemovalObserver?: ResumeRuntimeInput['createRemovalObserver'];
	readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
};

export type CsrRenderRuntime = ResumeRuntime | EventOnlyCsrContainer;

export type CsrRenderContainer = {
	readonly phase: 'csr';
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly runtime: CsrRenderRuntime;
	readonly payloadScripts?: undefined;
	readonly resumerScript?: undefined;
};

const EMPTY_PROTOCOL_VERSION = 1 satisfies ProtocolStatePayload['version'];

export async function render(
	component: () => CsrRenderOutput,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	const output = component();
	const view = output.view ?? emptyViewPayload();
	const state = output.state ?? emptyStatePayload();
	const loadSymbol = output.loadSymbol ?? options.loadSymbol ?? missingLoadSymbol;

	mountRoot(options.target, output.root);

	if (canUseEventOnlyCsrRuntime(output, state, view)) {
		const runtime = createEventOnlyCsrContainer({
			root: output.root,
			state,
			view,
			loadSymbol: loadSymbol as Parameters<
				typeof createEventOnlyCsrContainer
			>[0]['loadSymbol'],
		});
		startEventOnlyCsrRuntime(output.root, view, runtime);

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

function mountRoot(target: RenderTarget, root: ResumeDomElement): void {
	if (target.replaceChildren) {
		target.replaceChildren(root);
		return;
	}
	if (target.appendChild) {
		target.appendChild(root);
		return;
	}
	throw new TypeError(
		'render(App, { target }) requires a target that can receive the root node.',
	);
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

function emptyStatePayload(): ProtocolStatePayload {
	return {
		version: EMPTY_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
}

function emptyViewPayload(): ProtocolViewPayload {
	return {
		version: EMPTY_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function missingLoadSymbol(symbolId: string): ResumeSymbol {
	throw new Error(`Cannot load async symbol ${symbolId} without a generated symbol resolver.`);
}

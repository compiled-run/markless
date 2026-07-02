import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { EventOnlyResumeContainer } from './event-only-resume.ts';
import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeDomElement, ResumeRuntime, ResumeRuntimeInput } from './resume.ts';

export type RenderTarget = {
	readonly replaceChildren?: (...children: ReadonlyArray<ResumeDomElement>) => void;
	readonly appendChild?: (child: ResumeDomElement) => unknown;
};

export type CsrRenderOutput = {
	readonly root: ResumeDomElement;
	readonly graph?: RuntimeGraph;
	readonly runtime?: CsrRenderRuntime;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly connectRuntime?: (context: {
		readonly graph: unknown;
		readonly runtime: CsrRenderRuntime;
	}) => void;
};

export type CsrRenderArtifact = {
	readonly renderCsr: (props?: unknown) => CsrRenderOutput;
	readonly preload?: () => void | Promise<void>;
};

export type CsrRenderable = (() => CsrRenderOutput) | CsrRenderArtifact;

export type CsrRenderOptions = {
	readonly target: RenderTarget;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
	readonly createRemovalObserver?: ResumeRuntimeInput['createRemovalObserver'];
	readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
};

type CompilerProvidedCsrRuntime = {
	readonly dispatch: (event?: unknown, options?: unknown) => Promise<void>;
};

export type CsrRenderRuntime =
	| ResumeRuntime
	| EventOnlyResumeContainer
	| CompilerProvidedCsrRuntime;

export type CsrRenderContainer = {
	readonly phase: 'csr';
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly runtime: CsrRenderRuntime;
	readonly payloadScripts?: undefined;
	readonly resumerScript?: undefined;
};

export async function render(
	component: CsrRenderable,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	startCsrPreload(component);
	const output = typeof component === 'function' ? component() : component.renderCsr();

	if (output.graph && output.runtime) {
		mountRoot(options.target, output.root);
		return {
			phase: 'csr',
			root: output.root,
			graph: output.graph,
			runtime: output.runtime,
		};
	}

	const container = await import('./render-csr.ts').then((runtime) =>
		runtime.renderCsrRuntime({
			output,
			options,
		}),
	);
	mountRoot(options.target, output.root);
	return container;
}

function startCsrPreload(component: CsrRenderable): void {
	if (typeof component === 'function' || typeof component.preload !== 'function') return;

	try {
		const result = component.preload();
		if (isPromiseLike(result)) {
			void result.catch(() => {
				// Preload hints are opportunistic; render and interaction must still work.
			});
		}
	} catch {
		// Preload hints are opportunistic; render and interaction must still work.
	}
}

function mountRoot(target: RenderTarget, root: ResumeDomElement): void {
	const mount = target.replaceChildren ?? target.appendChild;
	if (!mount) throw new TypeError('Invalid render target.');
	mount.call(target, root);
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}

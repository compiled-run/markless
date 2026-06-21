import type { ProtocolStatePayload, ProtocolViewPayload } from '@arcade/protocol';
import type { EventOnlyResumeContainer } from './event-only-resume.ts';
import type { RuntimeGraph } from './graph.ts';
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
};

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
	component: () => CsrRenderOutput,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	const output = component();

	mountRoot(options.target, output.root);

	if (output.graph && output.runtime) {
		return {
			phase: 'csr',
			root: output.root,
			graph: output.graph,
			runtime: output.runtime,
		};
	}

	return import('./render-csr.ts').then((runtime) =>
		runtime.renderCsrRuntime({
			output,
			options,
		}),
	);
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

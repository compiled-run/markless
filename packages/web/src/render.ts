import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import type { EventOnlyResumeContainer } from './event-only-resume.ts';
import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeDomElement, ResumeRuntime, ResumeRuntimeInput } from './resume.ts';
import type { PrerenderDataSurface } from './prerender/evaluator.ts';

// A mount target is a real DOM element in the browser and a structural stand-in in tests,
// so the child parameter names both worlds.
export type RenderTarget = {
	readonly replaceChildren?: (
		...children: ReadonlyArray<ResumeDomElement | Node | string>
	) => void;
	readonly appendChild?: (child: ResumeDomElement | Node) => unknown;
};

export type CsrRenderOutput = {
	readonly root: ResumeDomElement;
	readonly graph?: RuntimeGraph;
	readonly runtime?: CsrRenderRuntime;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly liveHostNodes?: ReadonlyMap<string, ResumeDomElement>;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly loadBehaviorSymbol?: ResumeRuntimeInput['loadSymbol'];
};

export type CsrRenderArtifact = {
	readonly renderData?:
		| PrerenderDataSurface
		| Promise<PrerenderDataSurface>
		| (() => PrerenderDataSurface | Promise<PrerenderDataSurface>);
	readonly props?: unknown;
	readonly renderCsr?: (props?: unknown) => CsrRenderOutput;
	readonly renderSsr?: (props?: unknown) =>
		| {
				readonly html: string;
				readonly state?: ProtocolStatePayload;
				readonly view?: ProtocolViewPayload;
		  }
		| Promise<{
				readonly html: string;
				readonly state?: ProtocolStatePayload;
				readonly view?: ProtocolViewPayload;
		  }>;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly preload?: () => void | Promise<void>;
};

export type CsrRenderable = (() => CsrRenderOutput) | CsrRenderArtifact;

export type CsrRenderOptions = {
	readonly target: RenderTarget;
	readonly loadSymbol?: ResumeRuntimeInput['loadSymbol'];
	readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
	readonly createRemovalObserver?: ResumeRuntimeInput['createRemovalObserver'];
	readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
	readonly renderBranchHtml?: ResumeRuntimeInput['renderBranchHtml'];
	// D8 navigation transitions: runs after the page is fully live (runtime
	// started, boundary runners demanded) but BEFORE it is mounted into the
	// target — the router holds the outgoing page here until the destination
	// settles or the deadline passes. Returning false cancels the mount (the
	// navigation was superseded).
	readonly beforeMount?: (
		container: CsrRenderContainer,
	) => Promise<boolean | void> | boolean | void;
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

type CsrRenderSettlement = {
	readonly container: CsrRenderContainer;
	readonly selfWake: boolean;
};

export function render(
	component: CsrRenderable,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	const rendered = renderCsr(component, options);
	const settled = rendered.then(({ container }) => container);
	// Defer the boundary self-wake past settlement: render stays symbol-load free.
	void rendered.then(
		({ container, selfWake }) => {
			if (!selfWake) return;
			queueMicrotask(() => {
				void (container.runtime as { readonly start?: () => Promise<void> }).start?.();
			});
		},
		() => {},
	);
	return settled;
}

async function renderCsr(
	component: CsrRenderable,
	options: CsrRenderOptions,
): Promise<CsrRenderSettlement> {
	startCsrPreload(component);
	const output =
		typeof component === 'function'
			? component()
			: component.renderCsr
				? component.renderCsr()
				: await (
						await import('./render-canonical.ts')
					).renderCanonicalClientOutput(component, options.target);
	const startCsrRuntime = async (runtimeOutput: CsrRenderOutput) =>
		(await import('./render-csr.ts')).renderCsrRuntime({ output: runtimeOutput, options });
	if (output.view && hasKeyedRepeats(output.view)) {
		const repeats = await import('./repeat-runtime.ts');
		if (output.state) {
			await repeats.validateKeyedRepeatPayloadKeys({
				state: output.state,
				view: output.view,
			});
		}
		if (output.graph && output.runtime) {
			repeats.validateKeyedRepeatGraphKeys(output.graph, output.view);
		}
	}

	if (output.graph && output.runtime) {
		const container: CsrRenderContainer = {
			phase: 'csr',
			root: output.root,
			graph: output.graph,
			runtime: output.runtime,
		};
		if ((await options.beforeMount?.(container)) === false) {
			return { container: disposeCancelledMount(container), selfWake: false };
		}
		mountRoot(options.target, output.root);
		return csrRenderSettlement(container, output.view);
	}

	// Fragment-rooted components: DOM expands the fragment on mount, so the
	// runtime must be created AFTER mounting, with the mount target as the
	// container root (owner-ratified D3 semantics). Fragment-relative locator
	// indexes shift +1 because the root element joins the dom-order walk —
	// the same discipline containerScopedView applies for SSR containers.
	if ((output.root as { readonly nodeType?: number }).nodeType === 11) {
		const fragment = await import('./render-route-holder.ts');
		const fragmentView = output.view
			? fragment.offsetElementLocators(output.view, 1)
			: output.view;
		// A held route swap cannot mount into the visible target first: the
		// fragment expands into a layout-transparent holder that stays the
		// container root, and the holder itself mounts when the hold commits.
		const holder = options.beforeMount
			? fragment.createFragmentHolder(options.target)
			: undefined;
		if (holder) {
			mountRoot(holder as RenderTarget, output.root);
			const container = await startCsrRuntime({
				...output,
				root: holder,
				view: fragmentView,
			});
			if ((await options.beforeMount!(container)) === false) {
				return { container: disposeCancelledMount(container), selfWake: false };
			}
			mountRoot(options.target, holder);
			return csrRenderSettlement(container, fragmentView);
		}
		mountRoot(options.target, output.root);
		return csrRenderSettlement(
			await startCsrRuntime({
				...output,
				root: options.target as unknown as ResumeDomElement,
				view: fragmentView,
			}),
			fragmentView,
		);
	}

	const container = await startCsrRuntime(output);
	if ((await options.beforeMount?.(container)) === false) {
		return { container: disposeCancelledMount(container), selfWake: false };
	}
	mountRoot(options.target, output.root);
	return csrRenderSettlement(container, output.view);
}

function csrRenderSettlement(
	container: CsrRenderContainer,
	view: ProtocolViewPayload | undefined,
): CsrRenderSettlement {
	return { container, selfWake: (view?.asyncBoundaries.length ?? 0) > 0 };
}

// A superseded navigation never mounts; release the held page's runtime
// wiring so the abandoned island holds no live subscriptions or observers.
function disposeCancelledMount(container: CsrRenderContainer): CsrRenderContainer {
	(container.runtime as { readonly dispose?: () => void }).dispose?.();
	return container;
}

function hasKeyedRepeats(view: ProtocolViewPayload): boolean {
	return (view.keyedRepeats?.length ?? 0) > 0;
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

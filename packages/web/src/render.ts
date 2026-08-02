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
	readonly liveHostNodes?: ReadonlyMap<string, ResumeDomElement>;
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

export async function render(
	component: CsrRenderable,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	startCsrPreload(component);
	const output = typeof component === 'function' ? component() : component.renderCsr();
	const startCsrRuntime = async (runtimeOutput: CsrRenderOutput) =>
		(await import('./render-csr.ts')).renderCsrRuntime({ output: runtimeOutput, options });
	if (output.view && hasKeyedRepeats(output.view)) {
		const repeats = await import('./repeat-runtime.ts');
		if (output.state) {
			await repeats.validateKeyedRepeatPayloadKeys({ state: output.state, view: output.view });
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
			return disposeCancelledMount(container);
		}
		mountRoot(options.target, output.root);
		return container;
	}

	// Fragment-rooted components: DOM expands the fragment on mount, so the
	// runtime must be created AFTER mounting, with the mount target as the
	// container root (owner-ratified D3 semantics). Fragment-relative locator
	// indexes shift +1 because the root element joins the dom-order walk —
	// the same discipline containerScopedView applies for SSR containers.
	if ((output.root as { readonly nodeType?: number }).nodeType === 11) {
		const fragmentView = output.view ? offsetElementLocators(output.view, 1) : output.view;
		// A held route swap cannot mount into the visible target first: the
		// fragment expands into a layout-transparent holder that stays the
		// container root, and the holder itself mounts when the hold commits.
		const holder = options.beforeMount ? createFragmentHolder(options.target) : undefined;
		if (holder) {
			mountRoot(holder as RenderTarget, output.root);
			const container = await startCsrRuntime({
				...output,
				root: holder,
				view: fragmentView,
			});
			if ((await options.beforeMount!(container)) === false) {
				return disposeCancelledMount(container);
			}
			mountRoot(options.target, holder);
			return container;
		}
		mountRoot(options.target, output.root);
		return await startCsrRuntime({
			...output,
			root: options.target as unknown as ResumeDomElement,
			view: fragmentView,
		});
	}

	const container = await startCsrRuntime(output);
	if ((await options.beforeMount?.(container)) === false) {
		return disposeCancelledMount(container);
	}
	mountRoot(options.target, output.root);
	return container;
}

// A superseded navigation never mounts; release the held page's runtime
// wiring so the abandoned island holds no live subscriptions or observers.
function disposeCancelledMount(container: CsrRenderContainer): CsrRenderContainer {
	(container.runtime as { readonly dispose?: () => void }).dispose?.();
	return container;
}

// The holder wraps a fragment-rooted page for a held route swap. It stays in
// the page as the container root, so it must be layout-transparent
// (display: contents) — the page's own top-level elements keep their layout.
function createFragmentHolder(target: RenderTarget): ResumeDomElement | undefined {
	const documentHost =
		(target as { readonly ownerDocument?: unknown }).ownerDocument ??
		(globalThis as { readonly document?: unknown }).document;
	const createElement = (
		documentHost as { readonly createElement?: (tagName: string) => unknown } | undefined
	)?.createElement;
	if (typeof createElement !== 'function') return undefined;
	const holder = createElement.call(documentHost, 'div') as ResumeDomElement & {
		readonly setAttribute?: (name: string, value: string) => void;
	};
	holder.setAttribute?.('style', 'display: contents');
	holder.setAttribute?.('data-markless-route-holder', '');
	return holder;
}

function offsetElementLocators(view: ProtocolViewPayload, offset: number): ProtocolViewPayload {
	return {
		...view,
		locators: view.locators.map((locator) => ({
			...locator,
			index: locator.index + offset,
		})),
	};
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

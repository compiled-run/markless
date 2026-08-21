import {
	render as renderCsrContainer,
	disposeResumedPayload,
	type CsrRenderable,
	type CsrRenderContainer,
	type CsrRenderOptions,
	type RenderTarget,
} from '@markless/web';
import type { SsrFixtureRenderOptions } from './ssr-plugin.ts';

export type BrowserRenderElement = RenderTarget & {
	innerHTML?: string;
	parentNode?: {
		readonly removeChild?: (child: BrowserRenderElement) => unknown;
	} | null;
	appendChild?: (child: BrowserRenderElement) => BrowserRenderElement;
};

export type BrowserRenderDocument = {
	readonly body: BrowserRenderElement;
	readonly createElement: (tagName: string) => BrowserRenderElement;
	readonly createRange?: () => {
		readonly createContextualFragment: (html: string) => unknown;
	};
};

export type BrowserRenderOptions = Omit<CsrRenderOptions, 'target'> & {
	readonly container?: BrowserRenderElement;
	readonly baseElement?: BrowserRenderElement;
	readonly document?: BrowserRenderDocument;
};

export type BrowserRenderResult = {
	readonly container: BrowserRenderElement;
	readonly baseElement: BrowserRenderElement;
	readonly runtime: CsrRenderContainer;
	readonly unmount: () => void;
	readonly asFragment: () => unknown;
};

type MountedContainer = {
	readonly container: BrowserRenderElement;
	readonly document: BrowserRenderDocument;
	readonly removeOnCleanup: boolean;
	readonly runtime?: CsrRenderContainer;
};

const mountedContainers = new Map<BrowserRenderElement, MountedContainer>();

// The harness owns cleanup the way every vitest-browser framework wrapper does:
// each test starts from an empty document without suites registering afterEach
// themselves. Manual cleanup() stays exported for tests that need it mid-test.
if (typeof (globalThis as { __vitest_browser__?: unknown }).__vitest_browser__ !== 'undefined') {
	const { afterEach } = await import('vitest');
	afterEach(() => cleanup());
}

/**
 * A compiled component's own type is what the type service derives for its
 * signature, not the runtime's CsrRenderable contract; the harness mounts
 * either, so both are accepted and narrowed at the runtime boundary.
 */
export type BrowserRenderComponent = CsrRenderable | (() => unknown);

export async function render(
	component: BrowserRenderComponent,
	options: BrowserRenderOptions = {},
): Promise<BrowserRenderResult> {
	const setup = setupContainer(options);
	const runtime = await renderCsrContainer(component as CsrRenderable, {
		target: setup.container,
		loadSymbol: options.loadSymbol,
		createVisibilityObserver: options.createVisibilityObserver,
		applyDomJournal: options.applyDomJournal,
	});

	return createRenderResult(setup, runtime);
}

export type SsrRenderHtmlOptions = {
	readonly container?: HTMLElement;
	readonly baseElement?: HTMLElement;
};

export type SsrRenderResult = {
	readonly container: HTMLElement;
	readonly baseElement: HTMLElement;
	readonly unmount: () => void;
	readonly asFragment: () => unknown;
};

export type SsrPhasedRenderResult = {
	readonly html: string;
	readonly mount: (options?: SsrRenderHtmlOptions) => SsrRenderResult;
};

// Marker rewritten by the testSSR() vitest plugin into the Node-side
// commands.renderSSR RPC plus renderServerHTML(). Calling it untransformed
// means the browser project is missing the plugin, so fail loudly.
export function renderSSR(
	component: unknown,
	options?: SsrFixtureRenderOptions,
): Promise<SsrRenderResult> {
	void component;
	void options;
	throw new Error(
		'renderSSR(Component) was not transformed. Add testSSR() from ' +
			'@markless/vitest-browser/ssr-plugin to the browser test project plugins ' +
			'(before the markless plugin). v1 supports renderSSR(Component) with a ' +
			'component imported from a separate .tsrx module and no props.',
	);
}

// Marker rewritten by testSSR() into the same Node-side render command as
// renderSSR(), but leaves client mounting explicit so tests can reset
// instrumentation between server render and browser load.
export function renderSSRPhased(
	component: unknown,
	options?: SsrFixtureRenderOptions,
): Promise<SsrPhasedRenderResult> {
	void component;
	void options;
	throw new Error(
		'renderSSRPhased(Component) was not transformed. Add testSSR() from ' +
			'@markless/vitest-browser/ssr-plugin to the browser test project plugins ' +
			'(before the markless plugin). v1 supports renderSSRPhased(Component) with a ' +
			'component imported from a separate .tsrx module and no props.',
	);
}

// Marker rewritten by testSSR() into a Node-side renderToStream command. The
// command returns only the first-flush shell and deliberately leaves stream
// appends unconsumed so tests can model a connection that ended after flush.
export function renderStreamShell(
	component: unknown,
	options?: SsrFixtureRenderOptions,
): Promise<string> {
	void component;
	void options;
	throw new Error(
		'renderStreamShell(Component) was not transformed. Add testSSR() from ' +
			'@markless/vitest-browser/ssr-plugin to the browser test project plugins ' +
			'(before the markless plugin). v1 supports renderStreamShell(Component) with a ' +
			'component imported from a separate .tsrx module and no props.',
	);
}

export function renderServerHTML(
	html: string,
	options: SsrRenderHtmlOptions = {},
): SsrRenderResult {
	if (!html.includes('data-async-container')) {
		throw new Error(
			'renderServerHTML expects Markless server-rendered HTML (renderToString ' +
				'output with a data-async-container root and embedded payload scripts). ' +
				'The received HTML has no server-render fingerprints.',
		);
	}

	const document = globalDomDocument();
	const baseElement = options.baseElement ?? document.body;
	const container = options.container ?? document.createElement('div');
	if (!options.container) {
		baseElement.appendChild(container);
	}
	setHtmlAndRunScripts(document, container, html);

	const mounted: MountedContainer = {
		container: container as BrowserRenderElement,
		document: document as unknown as BrowserRenderDocument,
		removeOnCleanup: options.container === undefined,
	};
	mountedContainers.set(mounted.container, mounted);

	return {
		container,
		baseElement,
		unmount() {
			destroyContainer(mounted);
		},
		asFragment() {
			return document.createRange().createContextualFragment(container.innerHTML);
		},
	};
}

// innerHTML never executes <script> tags. Re-inserting each script as a
// freshly created element runs the serialized payload scripts and the inline
// resumer that renderToString embeds in the server HTML.
function setHtmlAndRunScripts(document: Document, container: HTMLElement, html: string): void {
	container.innerHTML = html;
	for (const inertScript of Array.from(container.querySelectorAll('script'))) {
		const script = document.createElement('script');
		for (const attribute of Array.from(inertScript.attributes)) {
			script.setAttribute(attribute.name, attribute.value);
		}
		script.text = inertScript.textContent ?? '';
		inertScript.parentNode?.replaceChild(script, inertScript);
	}
}

function globalDomDocument(): Document {
	if (typeof document === 'undefined') {
		throw new Error(
			'@markless/vitest-browser renderServerHTML() requires a real browser document.',
		);
	}
	return document;
}

export async function cleanup(): Promise<void> {
	while (mountedContainers.size > 0) {
		const mounted = mountedContainers.values().next().value;
		if (!mounted) return;
		destroyContainer(mounted);
	}
}

function setupContainer(options: BrowserRenderOptions): MountedContainer & {
	readonly baseElement: BrowserRenderElement;
} {
	const document = options.document ?? globalDocument();
	const baseElement = options.baseElement ?? document.body;
	const container = options.container ?? document.createElement('div');
	const removeOnCleanup = options.container === undefined;

	if (!options.container) {
		baseElement.appendChild?.(container);
	}

	return {
		container,
		baseElement,
		document,
		removeOnCleanup,
	};
}

function createRenderResult(
	mounted: MountedContainer & { readonly baseElement: BrowserRenderElement },
	runtime: CsrRenderContainer,
): BrowserRenderResult {
	const mountedRuntime = { ...mounted, runtime };
	mountedContainers.set(mounted.container, mountedRuntime);

	return {
		container: mounted.container,
		baseElement: mounted.baseElement,
		runtime,
		unmount() {
			destroyContainer(mountedRuntime);
		},
		asFragment() {
			return mounted.document
				.createRange?.()
				.createContextualFragment(mounted.container.innerHTML ?? '');
		},
	};
}

function destroyContainer(mounted: MountedContainer): void {
	(mounted.runtime?.runtime as { readonly dispose?: () => void } | undefined)?.dispose?.();
	for (const root of serverRuntimeRoots(mounted.container)) {
		disposeResumedPayload(root);
	}
	mounted.container.replaceChildren?.();
	mounted.container.innerHTML = '';
	mountedContainers.delete(mounted.container);

	if (mounted.removeOnCleanup) {
		mounted.container.parentNode?.removeChild?.(mounted.container);
	}
}

function serverRuntimeRoots(container: BrowserRenderElement): HTMLElement[] {
	const root = container as unknown as HTMLElement;
	const roots =
		typeof root.querySelectorAll === 'function'
			? Array.from(root.querySelectorAll<HTMLElement>('[data-async-container]'))
			: [];
	if (typeof root.matches === 'function' && root.matches('[data-async-container]')) {
		roots.unshift(root);
	}
	return roots;
}

function globalDocument(): BrowserRenderDocument {
	if (typeof document !== 'undefined') {
		return document as unknown as BrowserRenderDocument;
	}

	throw new Error(
		'@markless/vitest-browser render() requires a browser document or an explicit document option.',
	);
}

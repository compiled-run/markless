import {
	render as renderCsrContainer,
	type CsrRenderable,
	type CsrRenderContainer,
	type CsrRenderOptions,
	type RenderTarget,
} from '@markless/web';

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
};

const mountedContainers = new Map<BrowserRenderElement, MountedContainer>();

export async function render(
	component: CsrRenderable,
	options: BrowserRenderOptions = {},
): Promise<BrowserRenderResult> {
	const setup = setupContainer(options);
	const runtime = await renderCsrContainer(component, {
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

// Marker rewritten by the testSSR() vitest plugin into the Node-side
// commands.renderSSR RPC plus renderServerHTML(). Calling it untransformed
// means the browser project is missing the plugin, so fail loudly.
export function renderSSR(component: unknown): Promise<SsrRenderResult> {
	void component;
	throw new Error(
		'renderSSR(Component) was not transformed. Add testSSR() from ' +
			'@markless/vitest-browser/ssr-plugin to the browser test project plugins ' +
			'(before the markless plugin). v1 supports renderSSR(Component) with a ' +
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
	mountedContainers.set(mounted.container, mounted);

	return {
		container: mounted.container,
		baseElement: mounted.baseElement,
		runtime,
		unmount() {
			destroyContainer(mounted);
		},
		asFragment() {
			return mounted.document
				.createRange?.()
				.createContextualFragment(mounted.container.innerHTML ?? '');
		},
	};
}

function destroyContainer(mounted: MountedContainer): void {
	mounted.container.replaceChildren?.();
	mounted.container.innerHTML = '';
	mountedContainers.delete(mounted.container);

	if (mounted.removeOnCleanup) {
		mounted.container.parentNode?.removeChild?.(mounted.container);
	}
}

function globalDocument(): BrowserRenderDocument {
	if (typeof document !== 'undefined') {
		return document as unknown as BrowserRenderDocument;
	}

	throw new Error(
		'@markless/vitest-browser render() requires a browser document or an explicit document option.',
	);
}

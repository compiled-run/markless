import {
	render as renderCsrContainer,
	type CsrRenderContainer,
	type CsrRenderOptions,
	type CsrRenderOutput,
	type RenderTarget,
} from '@arcade/runtime';

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
	component: () => CsrRenderOutput,
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
		'@arcade/vitest-browser render() requires a browser document or an explicit document option.',
	);
}

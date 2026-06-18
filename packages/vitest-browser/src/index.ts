import {
	applyDomJournalEntries,
	render as renderCsrContainer,
	type CsrRenderContainer,
	type CsrRenderOptions,
	type CsrRenderOutput,
	type DomJournalEntry,
	type RenderTarget,
} from '@arcade/runtime';

export type BrowserRenderElement = RenderTarget & {
	readonly nodeType?: number;
	readonly tagName?: string;
	readonly childNodes?: ArrayLike<BrowserRenderElement>;
	innerHTML?: string;
	parentNode?: {
		readonly removeChild?: (child: BrowserRenderElement) => unknown;
	} | null;
	appendChild?: (child: BrowserRenderElement) => BrowserRenderElement;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
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
	let output: CsrRenderOutput | undefined;
	const runtime = await renderCsrContainer(
		() => {
			output = component();
			return output;
		},
		{
			target: setup.container,
			loadSymbol: options.loadSymbol,
			createVisibilityObserver: options.createVisibilityObserver,
			applyDomJournal:
				options.applyDomJournal ??
				((entries) => {
					if (!output?.view) return;
					applyBrowserDomJournal(
						entries,
						output.root as BrowserRenderElement,
						output.view,
					);
				}),
		},
	);

	return createRenderResult(setup, runtime);
}

function applyBrowserDomJournal(
	entries: ReadonlyArray<DomJournalEntry>,
	root: BrowserRenderElement,
	view: NonNullable<CsrRenderOutput['view']>,
): void {
	const elementsByHostId = materializeDomLocators(root, view.locators);

	applyDomJournalEntries(entries, {
		resolveTarget(locator) {
			return elementsByHostId.get(locator);
		},
	});
}

function materializeDomLocators(
	root: BrowserRenderElement,
	locators: NonNullable<CsrRenderOutput['view']>['locators'],
): Map<string, BrowserRenderElement> {
	const elements = collectElements(root);
	const byHostId = new Map<string, BrowserRenderElement>();

	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) continue;
		if (element.tagName?.toLowerCase() !== locator.tagName.toLowerCase()) continue;

		byHostId.set(locator.hostNodeId, element);
	}

	return byHostId;
}

function collectElements(root: BrowserRenderElement): BrowserRenderElement[] {
	const elements: BrowserRenderElement[] = [];
	const visit = (node: BrowserRenderElement): void => {
		if (node.nodeType === 1) elements.push(node);
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};

	visit(root);
	return elements;
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
		return document;
	}

	throw new Error(
		'@arcade/vitest-browser render() requires a browser document or an explicit document option.',
	);
}

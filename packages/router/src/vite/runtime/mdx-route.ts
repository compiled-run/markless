export type MdxRoutePart =
	| {
			readonly kind: 'html';
			readonly elementCount: number;
	  }
	| {
			readonly kind: 'component';
			readonly componentIndex: number;
	  };

export type MdxRenderOutput = {
	readonly html?: string;
	readonly root?: ChildNode;
	readonly state?: MdxStatePayload;
	readonly view?: MdxViewPayload;
	readonly loadSymbol?: (symbolId: string) => unknown;
	readonly connectRuntime?: (context: unknown) => unknown;
};

export type MdxChild = {
	readonly componentIndex: number;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
	readonly output?: MdxRenderOutput;
};

export type MdxComponentArtifact = {
	readonly renderSsr?: (props?: unknown) => MdxRenderOutput;
	readonly renderCsr?: (props?: unknown) => MdxRenderOutput;
};

export type MdxSymbolLoader = {
	readonly prefix: string;
	readonly loadSymbol: (symbolId: string) => unknown;
};

type MdxStatePayload = {
	readonly version: unknown;
	readonly cells?: readonly unknown[];
	readonly computed?: readonly unknown[];
	readonly sharedDefinitions?: readonly unknown[];
};

type MdxLocator = {
	readonly hostNodeId: string;
	readonly index: number;
	readonly [key: string]: unknown;
};

type MdxEventRecord = {
	readonly hostNodeId: string;
	readonly symbolIds: readonly string[];
	readonly [key: string]: unknown;
};

type MdxSymbolRecord = {
	readonly hostNodeId: string;
	readonly symbolId?: string;
	readonly [key: string]: unknown;
};

type MdxViewPayload = {
	readonly version: unknown;
	readonly locators?: readonly MdxLocator[];
	readonly events?: readonly MdxEventRecord[];
	readonly domUpdates?: readonly MdxSymbolRecord[];
	readonly behaviors?: readonly MdxSymbolRecord[];
	readonly elementHandles?: readonly MdxSymbolRecord[];
	readonly asyncBoundaries?: readonly unknown[];
};

export function renderMdxChild(
	children: MdxChild[],
	component: MdxComponentArtifact,
	props: unknown,
	child: Omit<MdxChild, 'output'>,
): string {
	const output = component.renderSsr?.(props);
	if (output) children.push({ ...child, output });
	return output?.html ?? '';
}

export function rootFromMdxHtml(html: string): Element {
	const template = document.createElement('template');
	template.innerHTML = html;
	const root = template.content.firstElementChild;
	if (!root) {
		throw new Error('Markless Router MDX render did not produce a root element.');
	}
	return root;
}

export function replaceMdxChild(root: ParentNode, index: number, child: ChildNode | undefined) {
	const placeholder = root.querySelector?.(`[data-markless-mdx-child="${index}"]`);
	if (placeholder && child) {
		placeholder.replaceWith(child);
		return;
	}
	placeholder?.remove();
}

export function composeMdxState(children: readonly MdxChild[]): MdxStatePayload | undefined {
	const childStates = children.map((child) => child.output?.state).filter(isDefined);
	if (childStates.length === 0) {
		return undefined;
	}

	return {
		version: childStates[0]!.version,
		cells: childStates.flatMap((state) => state.cells ?? []),
		computed: childStates.flatMap((state) => state.computed ?? []),
		...(childStates.some((state) => state.sharedDefinitions?.length)
			? {
					sharedDefinitions: childStates.flatMap(
						(state) => state.sharedDefinitions ?? [],
					),
				}
			: {}),
	};
}

export function composeMdxView(
	parts: readonly MdxRoutePart[],
	children: readonly MdxChild[],
	initialElementOffset: number,
): MdxViewPayload | undefined {
	const childViews = children
		.map((child) => ({
			...child,
			view: child.output?.view,
			hostCount: child.output?.view?.locators?.length ?? 0,
		}))
		.filter((child): child is typeof child & { readonly view: MdxViewPayload } =>
			Boolean(child.view),
		);
	if (childViews.length === 0) {
		return undefined;
	}

	const childByIndex = new Map(childViews.map((child) => [child.componentIndex, child]));
	const locators: MdxLocator[] = [];
	const events: MdxEventRecord[] = [];
	const domUpdates: MdxSymbolRecord[] = [];
	const behaviors: MdxSymbolRecord[] = [];
	const elementHandles: MdxSymbolRecord[] = [];
	let elementOffset = initialElementOffset;

	for (const part of parts) {
		if (part.kind === 'html') {
			elementOffset += part.elementCount;
			continue;
		}

		const child = childByIndex.get(part.componentIndex);
		if (!child) continue;
		appendMdxChildView({
			child,
			elementOffset,
			locators,
			events,
			domUpdates,
			behaviors,
			elementHandles,
		});
		elementOffset += child.hostCount;
	}

	locators.sort((a, b) => a.index - b.index);
	return {
		version: childViews[0]!.view.version,
		locators,
		events,
		domUpdates,
		behaviors,
		elementHandles,
		asyncBoundaries: [],
	};
}

export function loadMdxSymbol(
	symbolId: string,
	children: readonly MdxChild[],
	loaders: readonly MdxSymbolLoader[],
): unknown {
	for (const child of children) {
		if (symbolId.startsWith(child.symbolPrefix) && child.output?.loadSymbol) {
			return child.output.loadSymbol(symbolId.slice(child.symbolPrefix.length));
		}
	}

	for (const loader of loaders) {
		if (symbolId.startsWith(loader.prefix)) {
			return loader.loadSymbol(symbolId);
		}
	}

	return Promise.reject(new Error(`Unknown Markless MDX symbol ${symbolId}`));
}

function appendMdxChildView(context: {
	readonly child: MdxChild & { readonly view: MdxViewPayload };
	readonly elementOffset: number;
	readonly locators: MdxLocator[];
	readonly events: MdxEventRecord[];
	readonly domUpdates: MdxSymbolRecord[];
	readonly behaviors: MdxSymbolRecord[];
	readonly elementHandles: MdxSymbolRecord[];
}) {
	const childView = context.child.view;

	for (const locator of childView.locators ?? []) {
		context.locators.push({
			...locator,
			hostNodeId: context.child.hostPrefix + locator.hostNodeId,
			index: context.elementOffset + locator.index,
		});
	}
	for (const event of childView.events ?? []) {
		context.events.push({
			...event,
			hostNodeId: context.child.hostPrefix + event.hostNodeId,
			symbolIds: event.symbolIds.map((symbolId) => context.child.symbolPrefix + symbolId),
		});
	}
	for (const update of childView.domUpdates ?? []) {
		context.domUpdates.push(prefixMdxSymbolRecord(update, context.child));
	}
	for (const behavior of childView.behaviors ?? []) {
		context.behaviors.push(prefixMdxSymbolRecord(behavior, context.child));
	}
	for (const handle of childView.elementHandles ?? []) {
		context.elementHandles.push({
			...handle,
			hostNodeId: context.child.hostPrefix + handle.hostNodeId,
		});
	}
}

function prefixMdxSymbolRecord(record: MdxSymbolRecord, child: MdxChild): MdxSymbolRecord {
	return {
		...record,
		hostNodeId: child.hostPrefix + record.hostNodeId,
		...(record.symbolId ? { symbolId: child.symbolPrefix + record.symbolId } : {}),
	};
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}

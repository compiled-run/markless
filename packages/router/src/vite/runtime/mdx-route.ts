export type MdxRoutePart =
	| {
			readonly kind: 'html';
			readonly elementCount: number;
			readonly html?: string;
			readonly elementTags?: ReadonlyArray<string>;
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
};

export type MdxChild = {
	readonly componentIndex: number;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
	readonly output?: MdxRenderOutput;
};

export type MdxComponentArtifact = {
	// MaybePromise: compiled artifacts are async — a sync type here is what
	// let unawaited .html reads slip past vp check.
	readonly renderSsr?: (props?: unknown) => MdxRenderOutput | Promise<MdxRenderOutput>;
	readonly renderCsr?: (props?: unknown) => MdxRenderOutput | Promise<MdxRenderOutput>;
};

export type MdxSymbolLoader = {
	readonly prefix: string;
	readonly loadSymbol: (symbolId: string) => unknown;
};

type MdxRenderDataSurface = {
	readonly rootComponentName: string | null;
	readonly renderData: Readonly<Record<string, unknown>>;
	readonly components: Readonly<Record<string, unknown>>;
	readonly imports: Readonly<Record<string, MdxRenderDataSurface>>;
};

type MdxRenderDataChild = {
	readonly componentIndex: number;
	readonly hostPrefix: string;
	readonly symbolPrefix: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly surface: MdxRenderDataSurface;
};

// MDX contributes only static markup records. Imported TSRX children keep their
// compiler-emitted render-data surfaces and compose through ordinary child edges.
export function createMdxRenderDataSurface(
	parts: ReadonlyArray<MdxRoutePart>,
	children: ReadonlyArray<MdxRenderDataChild>,
): MdxRenderDataSurface {
	const componentName = 'MarklessMdxRoute';
	const rootChunkId = `template:${componentName}`;
	const childrenByIndex = new Map(children.map((child) => [child.componentIndex, child]));
	const statics: string[] = [];
	const slots: Array<Record<string, unknown>> = [];
	const hosts: Array<Record<string, unknown>> = [
		{
			hostNodeId: '__mdx:root',
			tagName: 'main',
			coordinate: { kind: 'child-index', path: [0] },
		},
	];
	const edges: Array<Record<string, unknown>> = [];
	let staticHtml = '<main data-markless-mdx-root>';
	let slotIndex = 0;
	for (const [partIndex, part] of parts.entries()) {
		if (part.kind === 'html') {
			staticHtml += part.html ?? '';
			for (const [tagIndex, tagName] of (part.elementTags ?? []).entries()) {
				hosts.push({
					hostNodeId: `__mdx:static:${partIndex}:${tagIndex}`,
					tagName,
					coordinate: { kind: 'child-index', path: [0, partIndex, tagIndex] },
				});
			}
			continue;
		}
		const child = childrenByIndex.get(part.componentIndex);
		if (!child)
			throw new Error(`MARKLESS_MDX_RENDER_DATA_CHILD_MISSING: ${part.componentIndex}`);
		const childComponentName = child.surface.rootComponentName;
		if (!childComponentName) {
			throw new Error(`MARKLESS_MDX_RENDER_DATA_ROOT_MISSING: ${part.componentIndex}`);
		}
		const edgeId = `mdx:edge:${part.componentIndex}`;
		staticHtml += `<!--markless-slot:${slotIndex}-->`;
		statics.push(staticHtml);
		staticHtml = '';
		slots.push({
			kind: 'child-component',
			componentEdgeId: edgeId,
			childComponentName,
			childTemplateId: `template:${childComponentName}`,
			coordinate: { kind: 'comment-anchor', path: [0, partIndex] },
			staticIndex: slotIndex,
		});
		edges.push({
			id: edgeId,
			childComponentName,
			hostPrefix: child.hostPrefix,
			symbolPrefix: child.symbolPrefix,
			props: Object.entries(child.props).map(([name, value]) => ({
				name,
				kind: 'serializable',
				value,
			})),
		});
		slotIndex++;
	}
	statics.push(`${staticHtml}</main>`);
	const state = { version: 1, cells: [], computed: [] };
	const view = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const renderData = {
		root: { componentName, templateId: rootChunkId },
		chunks: [
			{
				id: rootChunkId,
				kind: 'template',
				componentName,
				statics,
				hosts,
				slots,
			},
		],
		initialValues: [],
		branches: [],
		repeats: [],
		boundaries: [],
		interactions: [],
	};
	return {
		rootComponentName: componentName,
		renderData,
		components: {
			[componentName]: {
				name: componentName,
				state,
				view,
				rootChunkId,
				stateGraphNodeIds: [],
				initialValues: [],
				branches: [],
				boundaries: [],
				edges,
				propCellId: null,
			},
		},
		imports: Object.fromEntries(
			children.flatMap((child) =>
				child.surface.rootComponentName
					? [[child.surface.rootComponentName, child.surface] as const]
					: [],
			),
		),
	};
}

type MdxComputedRecord = {
	readonly deriveSymbolId?: string;
	readonly [key: string]: unknown;
};

type MdxStatePayload = {
	readonly version: unknown;
	readonly cells?: readonly unknown[];
	readonly computed?: readonly MdxComputedRecord[];
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

export async function renderMdxChild(
	children: MdxChild[],
	component: MdxComponentArtifact,
	props: unknown,
	child: Omit<MdxChild, 'output'>,
): Promise<string> {
	// Compiled marklessRenderSsr is async (initial render awaits demanded
	// async work); the unawaited Promise passed the truthy guard while .html
	// read undefined — the MDX child silently dropped from SSR html.
	const output = await component.renderSsr?.(props);
	if (output) children.push({ ...child, output });
	return output?.html ?? '';
}

export function composeMdxState(children: readonly MdxChild[]): MdxStatePayload | undefined {
	const childStates = children
		.map((child) => ({ child, state: child.output?.state }))
		.filter((entry): entry is { readonly child: MdxChild; readonly state: MdxStatePayload } =>
			isDefined(entry.state),
		);
	if (childStates.length === 0) {
		return undefined;
	}

	return {
		version: childStates[0]!.state.version,
		cells: childStates.flatMap(({ state }) => state.cells ?? []),
		computed: childStates.flatMap(({ child, state }) =>
			(state.computed ?? []).map((record) => prefixMdxComputedRecord(record, child)),
		),
		...(childStates.some(({ state }) => state.sharedDefinitions?.length)
			? {
					sharedDefinitions: childStates.flatMap(
						({ state }) => state.sharedDefinitions ?? [],
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

// deriveSymbolId is the only state field loadMdxSymbol resolves; graph node ids stay
// unprefixed because the view records that read them are unprefixed too.
function prefixMdxComputedRecord(record: MdxComputedRecord, child: MdxChild): MdxComputedRecord {
	return {
		...record,
		...(record.deriveSymbolId
			? { deriveSymbolId: child.symbolPrefix + record.deriveSymbolId }
			: {}),
	};
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

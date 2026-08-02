import {
	ASYNC_BOUNDARY_ARM,
	renderPayloadScripts,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
	type RenderedPayloadScripts,
} from '@markless/serializer';

type Awaitable<T> = T | Promise<T>;

export type SsrDataResidue =
	| { readonly kind: 'graph-read'; readonly graphNodeId: string; readonly path: ReadonlyArray<string> }
	| { readonly kind: 'repeat-item'; readonly repeatId: string; readonly path: ReadonlyArray<string> }
	| { readonly kind: 'authored-expression'; readonly source: string };

export type SsrDataCoordinate =
	| { readonly kind: 'child-index'; readonly path: ReadonlyArray<number> }
	| { readonly kind: 'comment-anchor'; readonly path: ReadonlyArray<number> };

type LocatedSlot = { readonly staticIndex: number; readonly coordinate: SsrDataCoordinate };

export type SsrDataSlot = LocatedSlot &
	(
		| { readonly kind: 'text'; readonly residue: SsrDataResidue; readonly raw?: boolean }
		| { readonly kind: 'attribute'; readonly name: string; readonly residue: SsrDataResidue }
		| {
				readonly kind: 'spread-attributes';
				readonly residue: SsrDataResidue;
				readonly excludeNames: ReadonlyArray<string>;
		  }
		| {
				readonly kind: 'child-component';
				readonly componentEdgeId: string;
				readonly childComponentName: string;
				readonly childTemplateId: string;
				readonly projectionChunkId?: string;
		  }
		| {
				readonly kind: 'branch';
				readonly branchSiteId: string;
				readonly armTemplateIds: ReadonlyArray<string>;
		  }
		| {
				readonly kind: 'repeat';
				readonly repeatId: string;
				readonly rowTemplateId: string;
				readonly emptyTemplateId?: string;
		  }
		| {
				readonly kind: 'async';
				readonly boundaryId: string;
				readonly armTemplateIds: Readonly<{ readonly try: string; readonly pending?: string; readonly catch?: string }>;
		  }
		| {
				readonly kind: 'dynamic-host';
				readonly hostNodeId: string;
				readonly cardinality: 'zero-or-one';
				readonly nullishTag: 'omit';
				readonly tag: SsrDataResidue;
				readonly staticAttributes: Readonly<Record<string, string>>;
				readonly attributeSlots: ReadonlyArray<
					| { readonly kind: 'attribute'; readonly name: string; readonly residue: SsrDataResidue }
					| { readonly kind: 'spread'; readonly residue: SsrDataResidue }
				>;
				readonly childChunkId: string;
		  }
	);

export type SsrDataChunk = {
	readonly id: string;
	readonly kind: 'template' | 'branch-arm' | 'async-arm' | 'repeat-row' | 'repeat-empty' | 'dynamic-host-children';
	readonly componentName: string;
	readonly statics: ReadonlyArray<string>;
	readonly hosts: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly tagName: string;
		readonly coordinate: { readonly kind: 'child-index'; readonly path: ReadonlyArray<number> };
	}>;
	readonly slots: ReadonlyArray<SsrDataSlot>;
};

export type SsrRenderData = {
	readonly root: { readonly componentName: string; readonly templateId: string } | null;
	readonly chunks: ReadonlyArray<SsrDataChunk>;
	readonly repeats: ReadonlyArray<{
		readonly repeatId: string;
		readonly collectionGraphNodeId?: string;
		readonly collectionPath?: ReadonlyArray<string>;
		readonly rowChunkId: string;
		readonly emptyChunkId?: string;
	}>;
	readonly boundaries: ReadonlyArray<{
		readonly boundaryId: string;
		readonly runnerGraphNodeId: string | null;
		readonly initiallyServedArm: number;
		readonly armChunkIds: Readonly<{ readonly try: string; readonly pending?: string; readonly catch?: string }>;
	}>;
};

export type SsrDataReadContext = {
	readonly chunkId: string;
	readonly repeatItem?: unknown;
	readonly repeatIndex?: number;
	readonly asyncError?: unknown;
	readonly projectionHtml?: string;
};

export type SsrDataStructure = {
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly tagName: string;
		readonly index: number;
	}>;
	readonly anchors: ReadonlyArray<{
		readonly kind: 'branch' | 'async';
		readonly id: string;
		readonly startIndex: number;
		readonly endIndex: number;
		readonly elementStart: number;
		readonly elementEnd: number;
		readonly html: string;
	}>;
	readonly elementCount: number;
};

export type SsrDataCoordinates = {
	readonly locators: ReadonlyArray<{
		readonly chunkId: string;
		readonly hostNodeId: string;
		readonly tagName: string;
		readonly coordinate: SsrDataCoordinate;
	}>;
	readonly anchors: ReadonlyArray<{
		readonly chunkId: string;
		readonly kind: 'branch' | 'repeat' | 'async' | 'child-component' | 'dynamic-host';
		readonly id: string;
		readonly coordinate: SsrDataCoordinate;
	}>;
};

export type RenderSsrDataInput = {
	readonly renderData: SsrRenderData;
	readonly idPrefix?: string;
	readonly read: (residue: SsrDataResidue, context: SsrDataReadContext) => Awaitable<unknown>;
	readonly renderChild?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'child-component' }>,
		context: SsrDataReadContext,
	) => Awaitable<{
		readonly html: string;
		readonly coordinates?: SsrDataCoordinates;
		readonly structure?: SsrDataStructure;
		readonly structureTokens?: ReadonlyArray<StructureToken>;
		readonly elementCount?: number;
	}>;
	readonly selectBranchArm?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'branch' }>,
		context: SsrDataReadContext,
	) => Awaitable<number>;
	readonly repeatItems?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'repeat' }>,
		context: SsrDataReadContext,
	) => Awaitable<ReadonlyArray<unknown> | null | undefined>;
	readonly selectAsyncArm?: (
		slot: Extract<SsrDataSlot, { readonly kind: 'async' }>,
		context: SsrDataReadContext,
	) => Awaitable<number | { readonly arm: number; readonly error?: unknown }>;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
};

export type RenderSsrDataOutput = {
	readonly html: string;
	readonly state?: ProtocolStatePayload;
	readonly view?: ProtocolViewPayload;
	readonly payloadScripts?: RenderedPayloadScripts;
	readonly coordinates: SsrDataCoordinates;
	readonly structure: SsrDataStructure;
	/** Internal composition stream; child renderers return it without reparsing HTML. */
	readonly structureTokens: ReadonlyArray<StructureToken>;
};

export type StructureToken =
	| { readonly kind: 'element'; readonly hostNodeId: string; readonly tagName: string }
	| {
			readonly kind: 'comment';
			readonly anchorKind: 'branch' | 'async';
			readonly anchorId: string;
			readonly edge: 'start' | 'end';
			readonly anchorHtml?: string;
	  };

type RenderedPart = { readonly html: string; readonly tokens: ReadonlyArray<StructureToken> };

export async function renderSsrData(input: RenderSsrDataInput): Promise<RenderSsrDataOutput> {
	const idPrefix = input.idPrefix ?? '';
	const chunks = new Map(input.renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const locators: Array<SsrDataCoordinates['locators'][number]> = [];
	const anchors: Array<SsrDataCoordinates['anchors'][number]> = [];
	const rootId = input.renderData.root?.templateId;
	const rendered = rootId ? await renderChunk(rootId, {}) : { html: '', tokens: [] };
	const html = rendered.html;
	const structure = materializeStructure(rendered.tokens);
	const payloadScripts = input.state && input.view
		? renderPayloadScripts({ state: input.state, view: input.view })
		: undefined;

	return {
		html,
		...(input.state ? { state: input.state } : {}),
		...(input.view ? { view: input.view } : {}),
		...(payloadScripts ? { payloadScripts } : {}),
		coordinates: { locators, anchors },
		structure,
		structureTokens: rendered.tokens,
	};

	async function renderChunk(
		chunkId: string,
		repeat: { readonly item?: unknown; readonly index?: number },
	): Promise<RenderedPart> {
		const chunk = chunks.get(chunkId);
		if (!chunk) throw new Error(`MARKLESS_SSR_DATA_CHUNK_MISSING: ${chunkId}`);
		for (const host of chunk.hosts) locators.push({
			chunkId: `${idPrefix}${chunkId}`,
			...host,
			hostNodeId: `${idPrefix}${host.hostNodeId}`,
		});

		const slotsByStatic = new Map<number, SsrDataSlot[]>();
		for (const slot of chunk.slots) {
			const group = slotsByStatic.get(slot.staticIndex) ?? [];
			group.push(slot);
			slotsByStatic.set(slot.staticIndex, group);
		}

		let html = '';
		const renderedSlots = new Map<SsrDataSlot, RenderedPart>();
		for (let index = 0; index < chunk.statics.length; index++) {
			const slots = slotsByStatic.get(index) ?? [];
			html += withoutSlotMarker(chunk.statics[index] ?? '', index, slots);
			for (const slot of slots) {
				const context = {
					chunkId,
					...(repeat.item !== undefined ? { repeatItem: repeat.item } : {}),
					...(repeat.index !== undefined ? { repeatIndex: repeat.index } : {}),
				};
				const renderedSlot = await renderSlot(slot, context);
				renderedSlots.set(slot, renderedSlot);
				html += renderedSlot.html;
			}
		}
		const ordered = [
			...chunk.hosts.map((host) => ({
				path: host.coordinate.path,
				order: 0,
				tokens: [{ kind: 'element', hostNodeId: `${idPrefix}${host.hostNodeId}`, tagName: host.tagName }] as StructureToken[],
			})),
			...chunk.slots.flatMap((slot, order) => {
				const tokens = renderedSlots.get(slot)?.tokens ?? [];
				return tokens.length > 0 ? [{ path: slot.coordinate.path, order: order + 1, tokens }] : [];
			}),
		].sort((left, right) => comparePath(left.path, right.path) || left.order - right.order);
		return { html, tokens: ordered.flatMap((entry) => entry.tokens) };
	}

	async function renderSlot(slot: SsrDataSlot, context: SsrDataReadContext): Promise<RenderedPart> {
		switch (slot.kind) {
			case 'text': {
				const value = await input.read(slot.residue, context);
				return { html: slot.raw ? String(value ?? '') : escapeHtml(value), tokens: [] };
			}
			case 'attribute':
				return { html: escapeHtml(await input.read(slot.residue, context)), tokens: [] };
			case 'spread-attributes':
				return { html: renderSpreadAttributes(await input.read(slot.residue, context), slot.excludeNames), tokens: [] };
			case 'child-component': {
				anchors.push(anchorRecord(idPrefix, context.chunkId, slot, slot.componentEdgeId));
				const projection = slot.projectionChunkId
					? await renderChunk(slot.projectionChunkId, {})
					: undefined;
				if (!input.renderChild)
					throw new Error(`MARKLESS_SSR_DATA_CHILD_RENDERER_MISSING: ${slot.componentEdgeId}`);
				const child = await input.renderChild(slot, {
					...context,
					...(projection ? { projectionHtml: projection.html } : {}),
				});
				if (!child || typeof child !== 'object')
					throw new Error(`MARKLESS_SSR_DATA_CHILD_STRUCTURE_MISSING: ${slot.componentEdgeId}`);
				if (child.coordinates) {
					locators.push(...child.coordinates.locators);
					anchors.push(...child.coordinates.anchors);
				}
				const childTokens = 'structureTokens' in child
					? (child as { readonly structureTokens?: ReadonlyArray<StructureToken> }).structureTokens
					: undefined;
				const childElementCount = 'elementCount' in child && typeof child.elementCount === 'number'
					? child.elementCount
					: undefined;
				if (!childTokens && childElementCount === undefined)
					throw new Error(`MARKLESS_SSR_DATA_CHILD_STRUCTURE_MISSING: ${slot.componentEdgeId}`);
				const countTokens = Array.from({ length: childElementCount }, (_, index) => ({
					kind: 'element' as const,
					hostNodeId: `${idPrefix}__child:${slot.componentEdgeId}:${index}`,
					tagName: '*',
				}));
				return {
					html: child.html,
					tokens: childTokens ?? [...countTokens, ...(projection?.tokens ?? [])],
				};
			}
			case 'branch': {
				anchors.push(anchorRecord(idPrefix, context.chunkId, slot, slot.branchSiteId));
				if (!input.selectBranchArm)
					throw new Error(`MARKLESS_SSR_DATA_BRANCH_SELECTOR_MISSING: ${slot.branchSiteId}`);
				const arm = await input.selectBranchArm(slot, context);
				const armChunkId = slot.armTemplateIds[arm];
				const body = armChunkId ? await renderChunk(armChunkId, {}) : { html: '', tokens: [] };
				const id = `${idPrefix}${slot.branchSiteId}`;
				return {
					html: `<!--markless:branch:${id}-->${body.html}<!--/markless:branch:${id}-->`,
					tokens: [commentToken('branch', id, 'start', body.html), ...body.tokens, commentToken('branch', id, 'end')],
				};
			}
			case 'repeat': {
				anchors.push(anchorRecord(idPrefix, context.chunkId, slot, slot.repeatId));
				const record = input.renderData.repeats.find((candidate) => candidate.repeatId === slot.repeatId);
				const items = input.repeatItems
					? await input.repeatItems(slot, context)
					: record?.collectionGraphNodeId
						? await input.read({
								kind: 'graph-read',
								graphNodeId: record.collectionGraphNodeId,
								path: record.collectionPath ?? [],
							}, context)
						: [];
				if (!Array.isArray(items) || items.length === 0)
					return slot.emptyTemplateId ? renderChunk(slot.emptyTemplateId, {}) : { html: '', tokens: [] };
				const rows = await Promise.all(items.map((item, index) => renderChunk(slot.rowTemplateId, { item, index })));
				return { html: rows.map((row) => row.html).join(''), tokens: rows.flatMap((row) => row.tokens) };
			}
			case 'async': {
				anchors.push(anchorRecord(idPrefix, context.chunkId, slot, slot.boundaryId));
				const boundary = input.renderData.boundaries.find(
					(candidate) => candidate.boundaryId === slot.boundaryId,
				);
				if (!boundary) throw new Error(`MARKLESS_SSR_DATA_BOUNDARY_MISSING: ${slot.boundaryId}`);
				const protocolBoundary = input.view?.asyncBoundaries.find(
					(candidate) => candidate.id === slot.boundaryId,
				);
				const selected = input.selectAsyncArm
					? await input.selectAsyncArm(slot, context)
					: protocolBoundary?.initiallyServedArm ?? boundary.initiallyServedArm;
				const arm = typeof selected === 'number' ? selected : selected.arm;
				const armChunkId = servedArmChunk(
					arm,
					slot.armTemplateIds,
				);
				const body = armChunkId
					? await renderChunk(armChunkId, { ...context, ...(typeof selected === 'number' ? {} : { asyncError: selected.error }) })
					: { html: '', tokens: [] };
				const id = `${idPrefix}${slot.boundaryId}`;
				return {
					html: `<!--markless:async:${id}-->${body.html}<!--/markless:async:${id}-->`,
					tokens: [commentToken('async', id, 'start', body.html), ...body.tokens, commentToken('async', id, 'end')],
				};
			}
			case 'dynamic-host': {
				anchors.push(anchorRecord(idPrefix, context.chunkId, slot, slot.hostNodeId));
				const tag = dynamicTag(await input.read(slot.tag, context));
				if (tag === null) return { html: '', tokens: [] };
				locators.push({
					chunkId: `${idPrefix}${context.chunkId}`,
					hostNodeId: `${idPrefix}${slot.hostNodeId}`,
					tagName: tag,
					coordinate: slot.coordinate,
				});
				let attributes = '';
				for (const [name, value] of Object.entries(slot.staticAttributes))
					attributes += renderAttribute(name, value);
				for (const attribute of slot.attributeSlots) {
					const value = await input.read(attribute.residue, context);
					attributes += attribute.kind === 'attribute'
						? renderAttribute(attribute.name, value)
						: renderSpreadAttributes(value);
				}
				const body = await renderChunk(slot.childChunkId, {});
				return {
					html: `<${tag}${attributes}>${body.html}</${tag}>`,
					tokens: [
					{ kind: 'element', hostNodeId: `${idPrefix}${slot.hostNodeId}`, tagName: tag },
					...body.tokens,
				],
				};
			}
		}
	}
}

function commentToken(
	anchorKind: 'branch' | 'async',
	anchorId: string,
	edge: 'start' | 'end',
	anchorHtml?: string,
): StructureToken {
	return { kind: 'comment', anchorKind, anchorId, edge, ...(anchorHtml === undefined ? {} : { anchorHtml }) };
}

function comparePath(left: ReadonlyArray<number>, right: ReadonlyArray<number>): number {
	for (let index = 0; index < Math.min(left.length, right.length); index++) {
		const difference = left[index]! - right[index]!;
		if (difference !== 0) return difference;
	}
	return left.length - right.length;
}

function materializeStructure(tokens: ReadonlyArray<StructureToken>): SsrDataStructure {
	const locators: Array<SsrDataStructure['locators'][number]> = [];
	const starts = new Map<string, { readonly comment: number; readonly element: number; readonly html: string }>();
	const anchors: Array<SsrDataStructure['anchors'][number]> = [];
	let commentIndex = 0;
	for (const token of tokens) {
		if (token.kind === 'element') {
			locators.push({ hostNodeId: token.hostNodeId, tagName: token.tagName, index: locators.length });
			continue;
		}
		if (token.edge === 'start')
			starts.set(token.anchorId, {
				comment: commentIndex,
				element: locators.length,
				html: token.anchorHtml ?? '',
			});
		else {
			const start = starts.get(token.anchorId);
			if (!start) throw new Error(`MARKLESS_SSR_DATA_ANCHOR_START_MISSING: ${token.anchorId}`);
			anchors.push({
				kind: token.anchorKind,
				id: token.anchorId,
				startIndex: start.comment,
				endIndex: commentIndex,
				elementStart: start.element,
				elementEnd: locators.length,
				html: start.html,
			});
		}
		commentIndex++;
	}
	return { locators, anchors, elementCount: locators.length };
}

export type SsrHtmlComparison =
	| { readonly equal: true }
	| { readonly equal: false; readonly expected: string; readonly actual: string; readonly firstDifference: number };

export function compareSsrHtml(expected: string, actual: string): SsrHtmlComparison {
	if (expected === actual) return { equal: true };
	let firstDifference = 0;
	while (
		firstDifference < expected.length &&
		firstDifference < actual.length &&
		expected[firstDifference] === actual[firstDifference]
	) firstDifference++;
	return { equal: false, expected, actual, firstDifference };
}

function anchorRecord(
	idPrefix: string,
	chunkId: string,
	slot: Extract<SsrDataSlot, { readonly kind: 'branch' | 'repeat' | 'async' | 'child-component' | 'dynamic-host' }>,
	id: string,
): SsrDataCoordinates['anchors'][number] {
	return {
		chunkId: `${idPrefix}${chunkId}`,
		kind: slot.kind,
		id: `${idPrefix}${id}`,
		coordinate: slot.coordinate,
	};
}

function withoutSlotMarker(staticText: string, staticIndex: number, slots: ReadonlyArray<SsrDataSlot>): string {
	if (slots.every((slot) => slot.kind === 'attribute')) return staticText;
	const marker = `<!--markless-slot:${staticIndex}-->`;
	return staticText.endsWith(marker) ? staticText.slice(0, -marker.length) : staticText;
}

function servedArmChunk(
	arm: number,
	chunks: Readonly<{ readonly try: string; readonly pending?: string; readonly catch?: string }>,
): string | undefined {
	if (arm === ASYNC_BOUNDARY_ARM.try) return chunks.try;
	if (arm === ASYNC_BOUNDARY_ARM.pending) return chunks.pending;
	if (arm === ASYNC_BOUNDARY_ARM.catch) return chunks.catch;
	throw new Error(`MARKLESS_SSR_DATA_SERVED_ARM_INVALID: ${String(arm)}`);
}

function dynamicTag(value: unknown): string | null {
	if (value === null || value === undefined || value === false || value === '') return null;
	const tag = String(value);
	if (!/^[a-zA-Z][a-zA-Z0-9:_.-]*$/.test(tag))
		throw new Error(`MARKLESS_DYNAMIC_TAG_INVALID: ${tag}`);
	return tag;
}

function renderAttribute(name: string, value: unknown): string {
	return ` ${name}="${escapeHtml(value)}"`;
}

function renderSpreadAttributes(value: unknown, excludeNames: ReadonlyArray<string> = []): string {
	if (!value || typeof value !== 'object') return '';
	let html = '';
	for (const [name, attribute] of Object.entries(value)) {
		if (excludeNames.includes(name)) continue;
		if (!/^[A-Za-z_][\w.:-]*$/.test(name) || /^on[A-Z]/.test(name) || name === 'attach' || name === 'el' || name === 'children') continue;
		if (attribute === null || attribute === undefined || attribute === false) continue;
		html += attribute === true ? ` ${name}=""` : renderAttribute(name, attribute);
	}
	return html;
}

function escapeHtml(value: unknown): string {
	return (value == null ? '' : String(value))
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

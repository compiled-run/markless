import type {
	CaptureSlot,
	GeneratedSymbolModule,
	PublicRenderPlanAsyncBoundaryArms,
	PublicRenderPlanBranchArms,
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	RenderDataArtifact,
	SemanticGraphDependency,
	SemanticModuleImport,
	SymbolModulesArtifact,
	SymbolModulesInput,
} from '../artifacts.ts';
import { asNodes, childNodes, isNode, type AnyNode } from '../ast/nodes.ts';
import { parseJavaScriptModule } from '../js-ast.ts';
import {
	arrayNode,
	arrowFunctionNode,
	binaryNode,
	callNode,
	computedMemberNode,
	conditionalNode,
	constDeclarationNode,
	type EmissionNode,
	type EmissionPrintInput,
	type EmissionSite,
	exportNamedDeclarationNode,
	forStatementNode,
	functionDeclarationNode,
	graphReadCall,
	identifierNode,
	ifStatementNode,
	jsonValueNode,
	letDeclarationNode,
	literalNode,
	logicalNode,
	memberChainNode,
	memberNode,
	moduleImportNode,
	moduleProgramNode,
	newNode,
	objectNode,
	optionalMemberNode,
	parseEmissionSource,
	postfixUpdateNode,
	printEmittedModule,
	propertyNode,
	returnStatementNode,
	shorthandPropertyNode,
	spreadNode,
	stringArrayNode,
	unaryNode,
	withLeadingBlockComment,
	type EmittedModule,
} from './emit-codegen.ts';
import { moduleScopeLines } from './public-render/shared.ts';

export function emitSymbolModules(input: SymbolModulesInput): SymbolModulesArtifact {
	const moduleDeclarations = sourceModuleScopeLines(input.source);
	const localNamesBySymbol = rowLocalNamesBySymbol(input.renderData);
	const captureSlotsBySymbol = new Map(
		input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			symbol.loaderSymbolId
				? []
				: [
						[
							symbol.symbolId,
							symbol.captureSlots.filter((slot) =>
								slot.routes.some((route) => route.componentEdgeId !== undefined),
							),
						] as const,
					],
		),
	);
	const boundCallbackSymbolIds = new Set(
		input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			symbol.captureSlots.flatMap((slot) =>
				slot.routes.flatMap((route) =>
					route.kind === 'callback-route' ? [route.callbackSymbolId] : [],
				),
			),
		),
	);
	const unsupportedCaptureSymbolIds = new Set(
		input.captureAnalysis.extractedSymbols.flatMap((symbol) =>
			!symbol.loaderSymbolId && symbol.captureSlots.some((slot) =>
				slot.routes.some((route) => route.kind === 'unsupported-opaque'),
			)
				? [symbol.symbolId]
				: [],
		),
	);

	const asyncComputedNodeIds = asyncComputedGraphNodeIds(input.semanticGraph);
	const branchArmsBySite = renderBranchArms(input.renderData, asyncComputedNodeIds);
	const boundaryArmsById = renderBoundaryArms(input.renderData, asyncComputedNodeIds);
	const sourceFileName = input.source?.filename ?? 'markless-module.tsrx';
	const authoredSource = input.source?.source ?? '';
	return {
		passId: 'symbol-modules',
		modules: input.symbolResolver.symbols.flatMap((symbol) => {
			if (unsupportedCaptureSymbolIds.has(symbol.id)) return [];
			if (symbol.kind === 'branch-update') {
				const arms = branchArmsBySite.get(symbol.branchSiteId);
				if (!arms) return [];
				return [
					{
						symbolId: symbol.id,
						kind: symbol.kind,
						exportName: symbolExportName(symbol.id),
						source: emitBranchUpdateModuleNodes({ symbol, arms, sourceFileName, authoredSource })
							.code,
					},
				];
			}
			if (symbol.kind === 'async-boundary-update') {
				const arms = boundaryArmsById.get(symbol.boundaryId);
				if (!arms) return [];
				return [
					{
						symbolId: symbol.id,
						kind: symbol.kind,
						exportName: symbolExportName(symbol.id),
						source: emitAsyncBoundaryUpdateModuleNodes({
							symbol,
							arms,
							sourceFileName,
							authoredSource,
						}).code,
					},
				];
			}
			return emitSymbolModule(
				symbol,
				localNamesBySymbol.get(symbol.id) ?? emptyLocalNames,
				captureSlotsBySymbol.get(symbol.id) ?? [],
				boundCallbackSymbolIds.has(symbol.id),
				moduleDeclarations,
				input.semanticGraph?.moduleImports ?? [],
				input.semanticGraph,
				input.renderData,
				input.omitAuthoredSource === true,
				sourceFileName,
			);
		}),
		diagnostics: input.captureAnalysis.diagnostics,
	};
}

function sourceModuleScopeLines(source: SymbolModulesInput['source']): string[] {
	if (!source) return [];
	try {
		return moduleScopeLines(source.source, source.filename);
	} catch {
		// The semantic pass owns parse diagnostics. Do not let this closure
		// projection replace its structured compile error with a raw parser error.
		return [];
	}
}

// A bare read of an async computed lands on the snapshot root, not the awaited
// result; lower it the way the view-record producer already does.
function asyncComputedGraphNodeIds(
	semanticGraph: SymbolModulesInput['semanticGraph'],
): ReadonlySet<string> {
	return new Set(
		(semanticGraph?.graphBindings ?? []).flatMap((binding) =>
			binding.kind === 'computed' && binding.async === true ? [binding.id] : [],
		),
	);
}

function armPartReadPath(
	graphNodeId: string,
	path: ReadonlyArray<string>,
	asyncComputedNodeIds: ReadonlySet<string>,
): ReadonlyArray<string> {
	return path.length === 0 && asyncComputedNodeIds.has(graphNodeId) ? ['value'] : path;
}

function renderBranchArms(
	renderData: RenderDataArtifact | undefined,
	asyncComputedNodeIds: ReadonlySet<string>,
): ReadonlyMap<string, PublicRenderPlanBranchArms> {
	if (!renderData) return new Map();
	return new Map((renderData.branches ?? []).flatMap((branch) => {
		if (branch.update === 'boundary') return [];
		const arms = branch.armChunkIds.map((chunkId) =>
			renderChunkParts(renderData, chunkId, asyncComputedNodeIds),
		);
		if (arms.some((arm) => arm === null)) return [];
		return [[branch.branchSiteId, {
			branchSiteId: branch.branchSiteId,
			testRead: branch.testReads[0] ?? null,
			arms: arms as PublicRenderPlanBranchArms['arms'],
			...(branch.armTests ? { armTests: branch.armTests } : {}),
			...(branch.declaredEmptyArms ? { declaredEmptyArms: branch.declaredEmptyArms } : {}),
		}] as const];
	}));
}

function renderBoundaryArms(
	renderData: RenderDataArtifact | undefined,
	asyncComputedNodeIds: ReadonlySet<string>,
): ReadonlyMap<string, PublicRenderPlanAsyncBoundaryArms> {
	if (!renderData) return new Map();
	return new Map((renderData.boundaries ?? []).flatMap((boundary) => {
		const chunkIds = [boundary.armChunkIds.try, boundary.armChunkIds.catch].filter(
			(candidate): candidate is string => candidate !== undefined,
		);
		const arms = chunkIds.map((chunkId) =>
			renderChunkParts(renderData, chunkId, asyncComputedNodeIds),
		);
		if (arms.some((arm) => arm === null)) return [];
		return [[boundary.boundaryId, {
			boundaryId: boundary.boundaryId,
			arms: arms as PublicRenderPlanAsyncBoundaryArms['arms'],
		}] as const];
	}));
}

function renderChunkParts(
	renderData: RenderDataArtifact,
	chunkId: string,
	asyncComputedNodeIds: ReadonlySet<string>,
): PublicRenderPlanBranchArms['arms'][number] | null {
	const chunk = renderData.chunks.find((candidate) => candidate.id === chunkId);
	if (!chunk) return null;
	const parts: Array<PublicRenderPlanBranchArms['arms'][number][number]> = [];
	const pushText = (text: string) => {
		const clean = text.replace(/<!--markless-slot:\d+-->/g, '');
		if (!clean) return;
		const last = parts[parts.length - 1];
		if (last && 'text' in last) parts[parts.length - 1] = { text: last.text + clean };
		else parts.push({ text: clean });
	};
	for (let staticIndex = 0; staticIndex < chunk.statics.length; staticIndex++) {
		pushText(chunk.statics[staticIndex] ?? '');
		for (const slot of chunk.slots.filter((candidate) => candidate.staticIndex === staticIndex)) {
			if (slot.kind === 'text' && slot.residue.kind === 'graph-read') {
				parts.push({ read: {
					graphNodeId: slot.residue.graphNodeId,
					path: armPartReadPath(
						slot.residue.graphNodeId,
						slot.residue.path,
						asyncComputedNodeIds,
					),
				} });
				continue;
			}
			if (slot.kind === 'repeat') {
				const repeat = renderData.repeats.find((candidate) => candidate.repeatId === slot.repeatId);
				const row = repeat ? renderData.chunks.find((candidate) => candidate.id === repeat.rowChunkId) : undefined;
				if (!repeat?.collectionGraphNodeId || !row) return null;
				const rowParts: Array<{ text: string } | { read: { graphNodeId: string; path: ReadonlyArray<string> } } | { itemPath: ReadonlyArray<string> }> = [];
				for (let rowIndex = 0; rowIndex < row.statics.length; rowIndex++) {
					const text = (row.statics[rowIndex] ?? '').replace(/<!--markless-slot:\d+-->/g, '');
					if (text) rowParts.push({ text });
					for (const rowSlot of row.slots.filter((candidate) => candidate.staticIndex === rowIndex)) {
						if (rowSlot.kind !== 'text') return null;
						if (rowSlot.residue.kind === 'repeat-item') rowParts.push({ itemPath: rowSlot.residue.path });
						else if (rowSlot.residue.kind === 'graph-read') rowParts.push({ read: { graphNodeId: rowSlot.residue.graphNodeId, path: armPartReadPath(rowSlot.residue.graphNodeId, rowSlot.residue.path, asyncComputedNodeIds) } });
						else return null;
					}
				}
				parts.push({ repeat: {
					read: { graphNodeId: repeat.collectionGraphNodeId, path: repeat.collectionPath },
					rowParts,
				} });
				continue;
			}
			return null;
		}
	}
	return parts;
}

const emptyLocalNames = new Set<string>();

function rowLocalNamesBySymbol(
	renderData: RenderDataArtifact | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
	const localNamesBySymbol = new Map<string, Set<string>>();
	const addLocal = (symbolId: string, itemName: string): void => {
		let localNames = localNamesBySymbol.get(symbolId);
		if (!localNames) {
			localNames = new Set();
			localNamesBySymbol.set(symbolId, localNames);
		}
		localNames.add(itemName);
	};
	if (renderData) {
		for (const repeat of renderData.repeats) {
			const rowHostIds = renderChunkHostIds(renderData, repeat.rowChunkId);
			for (const interaction of renderData.interactions) {
				if (!rowHostIds.has(interaction.hostNodeId)) continue;
				for (const symbolId of interaction.symbolIds) addLocal(symbolId, repeat.itemName);
			}
		}
	}
	return localNamesBySymbol;
}

// Row modules execute outside the authored @for callback. The repeat runtime
// supplies the item through context.locals, so symbols owned by a row chunk
// must retain that existing capture context even when the legacy public plan
// has no top-level record for an async-arm repeat.
function renderChunkHostIds(
	renderData: RenderDataArtifact,
	chunkId: string,
	seen = new Set<string>(),
): ReadonlySet<string> {
	if (seen.has(chunkId)) return new Set();
	seen.add(chunkId);
	const chunk = renderData.chunks.find((candidate) => candidate.id === chunkId);
	const hostIds = new Set((chunk?.hosts ?? []).map((host) => host.hostNodeId));
	for (const slot of chunk?.slots ?? []) {
		const childChunkIds =
			slot.kind === 'branch'
				? slot.armTemplateIds
				: slot.kind === 'repeat'
					? [slot.rowTemplateId, ...(slot.emptyTemplateId ? [slot.emptyTemplateId] : [])]
					: slot.kind === 'async'
						? Object.values(slot.armTemplateIds).filter(
								(candidate): candidate is string => candidate !== undefined,
							)
						: slot.kind === 'child-component'
							? [slot.childTemplateId]
							: slot.kind === 'dynamic-host'
								? [slot.childChunkId]
								: [];
		for (const childChunkId of childChunkIds) {
			for (const hostId of renderChunkHostIds(renderData, childChunkId, seen)) hostIds.add(hostId);
		}
	}
	return hostIds;
}

function emitSymbolModule(
	symbol: PlannedSymbol,
	localNames: ReadonlySet<string>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	usesArgumentVector: boolean,
	moduleDeclarations: readonly string[],
	moduleImports: readonly SemanticModuleImport[],
	semanticGraph: SymbolModulesInput['semanticGraph'],
	renderData: SymbolModulesInput['renderData'],
	omitAuthoredSource: boolean,
	sourceFileName: string,
): GeneratedSymbolModule[] {
	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitEventHandlerModule(symbol, localNames, captureSlots, usesArgumentVector),
			},
		];
	}

	if (symbol.kind === 'sync-computed-derive') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitSyncComputedDeriveModule(symbol, captureSlots, omitAuthoredSource),
			},
		];
	}

	const emitted = emitSymbolModuleNodes({
		symbol,
		moduleDeclarations,
		moduleImports,
		captureSlots,
		semanticGraph,
		renderData,
		omitAuthoredSource,
		sourceFileName,
	});
	if (!emitted) return [];

	return [
		{
			symbolId: symbol.id,
			kind: symbol.kind,
			exportName: symbolExportName(symbol.id),
			source: emitted.code,
		},
	];
}

function emitEventHandlerModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	localNames: ReadonlySet<string>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	usesArgumentVector: boolean,
): string {
	const exportName = symbolExportName(symbol.id);
	const scalarWriteLeaf = captureSlots.length === 0 ? scalarWriteLeafSource(symbol, localNames) : null;
	if (scalarWriteLeaf) {
		return [
			"import { marklessWriteScalar } from '@markless/web/fns/write-scalar';",
			'',
			'/* scalar leaf marker: context.graph.update({ */',
			`export function ${exportName}(context) {`,
			...indentBody(scalarWriteLeaf),
			'}',
			'',
		].join('\n');
	}
	const parameters = symbol.parameters ?? [];
	const importedReference = importedHandlerReference(symbol);
	const body = importedReference
		? symbol.kind === 'callback-prop' && (usesArgumentVector || parameters.length > 1)
			? `return ${symbol.source.trim()}(...(context.args ?? []));`
			: `return ${symbol.source.trim()}(context.event);`
		: eventHandlerAuthoredBody(symbol, localNames, captureSlots);
	const imports = eventModuleImports(symbol, body);
	const asyncKeyword =
		!importedReference &&
		(eventHandlerIsAsync(symbol.source) || captureSlots.some(callbackCaptureSlot))
			? 'async '
			: '';
	const parameterDeclarations =
		!importedReference && parameters.length > 0
			? parameters.flatMap((parameter, index) => {
					if (symbol.kind !== 'callback-prop' || (!usesArgumentVector && parameters.length <= 1)) {
						return [`	const ${parameter} = context.event;`];
					}
					return [
						`	const ${parameter} = context.args?.[${index}];`,
						`	/* legacy callback binding was: const ${parameter} = context.event; */`,
					];
				})
			: [];

	return [
		...imports.map(emitModuleImport),
		...(imports.length > 0 ? [''] : []),
		`export ${asyncKeyword}function ${exportName}(context) {`,
		...parameterDeclarations,
		...indentBody(body),
		'}',
		'',
	].join('\n');
}

function eventModuleImports(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	emittedSource: string,
): ReadonlyArray<SemanticModuleImport> {
	if (!emittedSource) return [];

	return uniqueModuleImports(
		(symbol.moduleImports ?? []).filter((moduleImport) =>
			sourceReferencesIdentifier(emittedSource, moduleImport.localName),
		),
	);
}

function importedHandlerReference(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
): SemanticModuleImport | null {
	const source = symbol.source.trim();
	if (!source) return null;

	const firstName = source.split('.')[0] ?? '';
	if (!isIdentifierObjectKey(firstName)) return null;

	return (
		(symbol.moduleImports ?? []).find((moduleImport) => moduleImport.localName === firstName) ??
		null
	);
}

function eventHandlerAuthoredBody(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	localNames: ReadonlySet<string>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): string {
	const directCallbackSlot = captureSlots.find(
		(slot) => callbackCaptureSlot(slot) && slot.source.trim() === symbol.source.trim(),
	);
	if (directCallbackSlot) {
		return `return await context.capture.invoke(${JSON.stringify(directCallbackSlot.id)}, [context.event]);`;
	}
	const directReferenceRead = (symbol.reads ?? []).find(
		(read) => read.source.trim() === symbol.source.trim(),
	);
	if (directReferenceRead && isIdentifierObjectKey(symbol.source.trim())) {
		return `return ${graphReadCallSource(
			'context.graph.read',
			directReferenceRead.graphNodeId,
			directReferenceRead.path,
		)}(context.event);`;
	}
	const body = eventHandlerBodySource(symbol.source);
	if (!body) return 'void context;';

	return spliceEventHandlerBody(
		body.source,
		body.sourceStart,
		symbol,
		symbol.parameters ?? [],
		localNames,
		captureSlots,
	);
}

function eventHandlerBodySource(
	source: string,
): { readonly source: string; readonly sourceStart: number } | null {
	const arrowIndex = source.indexOf('=>');
	if (arrowIndex === -1) return declaredFunctionBodySource(source);

	const bodyStart = arrowIndex + 2 + leadingWhitespaceLength(source.slice(arrowIndex + 2));
	if (bodyStart >= source.length) return null;

	if (source[bodyStart] === '{') {
		const bodyEnd = source.lastIndexOf('}');
		if (bodyEnd === -1) return null;
		const inner = source.slice(bodyStart + 1, bodyEnd);

		return {
			source: inner.trim(),
			sourceStart: bodyStart + 1 + leadingWhitespaceLength(inner),
		};
	}

	return {
		source: `return ${source.slice(bodyStart).trim()};`,
		sourceStart: bodyStart,
	};
}

function declaredFunctionBodySource(
	source: string,
): { readonly source: string; readonly sourceStart: number } | null {
	if (!/^\s*(?:async\s+)?function\b/.test(source)) return null;
	let parameterDepth = 0;
	let sawParameters = false;
	let quote: string | null = null;
	let escaped = false;

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		if (quote) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(') {
			parameterDepth++;
			sawParameters = true;
			continue;
		}
		if (char === ')') {
			parameterDepth = Math.max(0, parameterDepth - 1);
			continue;
		}
		if (char !== '{' || !sawParameters || parameterDepth !== 0) continue;
		const bodyEnd = source.lastIndexOf('}');
		if (bodyEnd <= index) return null;
		const inner = source.slice(index + 1, bodyEnd);
		return {
			source: inner.trim(),
			sourceStart: index + 1 + leadingWhitespaceLength(inner),
		};
	}

	return null;
}

function eventHandlerIsAsync(source: string): boolean {
	return source.trimStart().startsWith('async ');
}

function callbackCaptureSlot(slot: CaptureSlot): boolean {
	return slot.routes.some((route) => route.kind === 'callback-route');
}

function captureSlotMatchesRead(slot: CaptureSlot, read: LoweredStateRead): boolean {
	if (read.bindingId && slot.bindingId !== read.bindingId) return false;
	if (slot.sourceSpan && read.sourceSpan) {
		return (
			slot.sourceSpan.filename === read.sourceSpan.filename &&
			slot.sourceSpan.start === read.sourceSpan.start &&
			slot.sourceSpan.end === read.sourceSpan.end
		);
	}
	return slot.source === read.source;
}

function callbackInvocationSpans(
	source: string,
	callee: string,
): ReadonlyArray<{ start: number; end: number; arguments: ReadonlyArray<string> }> {
	const prefix = 'async function* __marklessCallbackBody() {\n';
	const moduleSource = `${prefix}${source}\n}`;
	const calls: Array<{ start: number; end: number; arguments: ReadonlyArray<string> }> = [];
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(moduleSource);
	} catch {
		return [];
	}
	const visit = (node: AnyNode): void => {
		if (
			node.type === 'CallExpression' &&
			typeof node.start === 'number' &&
			typeof node.end === 'number'
		) {
			const called = node.callee as AnyNode | undefined;
			const argumentNodes = Array.isArray(node.arguments) ? (node.arguments as AnyNode[]) : [];
			if (
				called &&
				typeof called.start === 'number' &&
				typeof called.end === 'number' &&
				moduleSource.slice(called.start, called.end) === callee &&
				argumentNodes.every(
					(argument) => typeof argument.start === 'number' && typeof argument.end === 'number',
				)
			) {
				calls.push({
					start: node.start - prefix.length,
					end: node.end - prefix.length,
					arguments: argumentNodes.map((argument) =>
						moduleSource.slice(argument.start as number, argument.end as number),
					),
				});
			}
		}
		for (const child of childNodes(node)) visit(child);
	};
	visit(ast);
	return calls;
}

function captureArgumentSource(
	argument: string,
	valueSlots: ReadonlyArray<CaptureSlot>,
	eventParameters: ReadonlyArray<string>,
	reads: ReadonlyArray<LoweredStateRead>,
): string {
	const replacements = [
		...reads.flatMap((read) =>
			argumentReadBodySpans(argument, read).map((span) => {
				const slot = valueSlots.find((candidate) => captureSlotMatchesRead(candidate, read));
				const graphRead = slot
					? `context.capture.read(${JSON.stringify(slot.id)})`
					: graphReadCallSource('context.graph.read', read.graphNodeId, read.path);
				return {
					start: span.start,
					end: span.end,
					replacement: span.shorthandKey
						? `${span.shorthandKey}: ${graphRead}`
						: graphRead,
				};
			}),
		),
		...valueSlots.flatMap((slot) => {
			if (reads.some((read) => captureSlotMatchesRead(slot, read))) return [];
			return argumentReadBodySpans(argument, slot).map((span) => {
				const captureRead = `context.capture.read(${JSON.stringify(slot.id)})`;
				return {
					start: span.start,
					end: span.end,
					replacement: span.shorthandKey
						? `${span.shorthandKey}: ${captureRead}`
						: captureRead,
				};
			});
		}),
	]
		.sort((left, right) => right.start - left.start || right.end - left.end)
		.filter(
			(item, index, items) =>
				!items.some(
					(other, otherIndex) =>
						otherIndex !== index &&
						item.start >= other.start &&
						item.end <= other.end &&
						other.end - other.start > item.end - item.start,
				),
		);

	let emitted = argument;
	for (const replacement of replacements) {
		emitted =
			emitted.slice(0, replacement.start) +
			replacement.replacement +
			emitted.slice(replacement.end);
	}
	for (const parameter of eventParameters) {
		const pattern = new RegExp(`\\b${escapeRegExp(parameter)}(?:\\.[$A-Z_a-z][$0-9A-Z_a-z]*)*`, 'g');
		emitted = emitted.replace(pattern, (source) => eventFieldAssignmentSource(source, [parameter]) ?? source);
	}
	return emitted;
}

function argumentReadBodySpans(
	argument: string,
	read: Pick<LoweredStateRead, 'source'>,
): ReturnType<typeof readBodySpans> {
	return readBodySpans(`(${argument})`, read).flatMap((span) =>
		span.start > 0 && span.end <= argument.length + 1
			? [{ ...span, start: span.start - 1, end: span.end - 1 }]
			: [],
	);
}

function escapeRegExp(source: string): string {
	return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function spliceEventHandlerBody(
	bodySource: string,
	bodyStartInHandlerSource: number,
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	eventParameters: ReadonlyArray<string>,
	localNames: ReadonlySet<string>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): string {
	const callbackSlots = captureSlots.filter(callbackCaptureSlot);
	const valueSlots = captureSlots.filter((slot) => !callbackCaptureSlot(slot));
	const replacements = [
		...callbackSlots.flatMap((slot) =>
			callbackInvocationSpans(bodySource, slot.source).map((call) => ({
				start: call.start,
				end: call.end,
				replacement: `await context.capture.invoke(${JSON.stringify(slot.id)}, [${call.arguments
					.map((argument) =>
						captureArgumentSource(argument, valueSlots, eventParameters, symbol.reads ?? []),
					)
					.join(', ')}])`,
			})),
		),
		...(symbol.reads ?? []).flatMap((read) =>
			readBodySpans(bodySource, read).map((span) => {
				const slot = valueSlots.find((candidate) => captureSlotMatchesRead(candidate, read));
				const graphRead = slot
					? `context.capture.read(${JSON.stringify(slot.id)})`
					: graphReadCallSource('context.graph.read', read.graphNodeId, read.path);
				return {
					start: span.start,
					end: span.end,
					replacement: span.shorthandKey
						? `${span.shorthandKey}: ${graphRead}`
						: graphRead,
				};
			}),
		),
		...(symbol.writes ?? []).flatMap((write) => {
			const replacement = emitEventWriteExpression(
				write,
				symbol.kind === 'callback-prop' ? [] : eventParameters,
				symbol.reads ?? [],
				symbol.moduleImports ?? [],
				localNames,
			);
			if (!replacement) return [];

			const span = handlerBodyWriteSpan(bodySource, bodyStartInHandlerSource, symbol, write);
			return span ? [{ ...span, replacement }] : [];
		}),
		...(symbol.kind === 'event-handler' ? (symbol.elementHandleCalls ?? []) : []).flatMap(
			(call) => {
				const replacement = emitElementHandleCall(call, eventParameters)
					.map((line) => line.replace(/^\t/, ''))
					.join('\n')
					.replace(/;$/, '');
				let start = call.offset - bodyStartInHandlerSource;
				if (start < 0 || start >= bodySource.length) return [];

				let end = call.endOffset - bodyStartInHandlerSource;
				if (end <= start || end > bodySource.length) return [];
				if (bodySource.slice(start, end) !== call.source) {
					start = bodySource.indexOf(call.source);
					end = start + call.source.length;
				}
				if (start < 0 || end <= start || end > bodySource.length) return [];
				return [{ start, end, replacement }];
			},
		),
	]
		.sort((left, right) => right.start - left.start || right.end - left.end)
		.filter(
			(item, index, items) =>
				!items.some(
					(other, otherIndex) =>
						otherIndex !== index &&
						item.start >= other.start &&
						item.end <= other.end &&
						other.end - other.start > item.end - item.start,
				),
		);

	let emitted = bodySource;
	for (const replacement of replacements) {
		emitted =
			emitted.slice(0, replacement.start) +
			replacement.replacement +
			emitted.slice(replacement.end);
	}

	return emitted.trim() || 'void context;';
}

function readBodySpans(
	bodySource: string,
	read: Pick<LoweredStateRead, 'source'>,
): ReadonlyArray<{
	readonly start: number;
	readonly end: number;
	readonly shorthandKey?: string;
}> {
	const prefix = 'async function* __marklessBody() {\n';
	const source = `${prefix}${bodySource}\n}`;
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(source);
	} catch {
		return [];
	}

	const spans = new Map<
		number,
		{ readonly start: number; readonly end: number; readonly shorthandKey?: string }
	>();
	const walkWithParent = (node: AnyNode, parent?: AnyNode): void => {
		if (
			isGraphReadExpression(node) &&
			isValuePositionGraphRead(node, parent) &&
			typeof node.start === 'number' &&
			typeof node.end === 'number' &&
			source.slice(node.start, node.end) === read.source
		) {
			const start = node.start - prefix.length;
			const end = node.end - prefix.length;
			if (start >= 0 && end <= bodySource.length) {
				const shorthandKey = objectShorthandKeySource(parent, node, source);
				spans.set(start, { start, end, ...(shorthandKey ? { shorthandKey } : {}) });
			}
		}

		for (const child of childNodes(node)) walkWithParent(child, node);
	};
	walkWithParent(ast);
	return [...spans.values()];
}

function isValuePositionGraphRead(node: AnyNode, parent: AnyNode | undefined): boolean {
	if (node.type !== 'Identifier' || !parent) return true;

	if (parent.type === 'Property') {
		const key = parent.key as AnyNode | undefined;
		if (key === node && parent.computed !== true && parent.shorthand !== true) return false;
	}

	if (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') {
		const property = parent.property as AnyNode | undefined;
		if (property === node && parent.computed !== true) return false;
	}

	return true;
}

function objectShorthandKeySource(
	parent: AnyNode | undefined,
	read: AnyNode,
	source: string,
): string | null {
	if (parent?.type !== 'Property' || parent.shorthand !== true) return null;
	const key = parent.key as AnyNode | undefined;
	const value = parent.value as AnyNode | undefined;
	if (
		key?.type !== 'Identifier' ||
		typeof key.start !== 'number' ||
		typeof key.end !== 'number' ||
		typeof value?.start !== 'number' ||
		typeof value.end !== 'number' ||
		read.start !== value.start ||
		read.end !== value.end
	) {
		return null;
	}

	return source.slice(key.start, key.end);
}

function isGraphReadExpression(node: AnyNode): boolean {
	return (
		node.type === 'Identifier' ||
		node.type === 'MemberExpression' ||
		node.type === 'ChainExpression'
	);
}

function handlerBodyWriteSpan(
	bodySource: string,
	bodyStartInHandlerSource: number,
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	write: LoweredStateWrite,
): { readonly start: number; readonly end: number } | null {
	if (symbol.sourceSpan && write.sourceSpan) {
		const start = write.sourceSpan.start - symbol.sourceSpan.start - bodyStartInHandlerSource;
		const end = write.sourceSpan.end - symbol.sourceSpan.start - bodyStartInHandlerSource;
		if (start >= 0 && end > start && end <= bodySource.length) {
			const spanSource = bodySource.slice(start, end);
			const expectedSource = authoredWriteSource(write);
			if (!expectedSource || spanSource === expectedSource) return { start, end };
		}
	}

	const authoredWrite = authoredWriteSource(write);
	if (!authoredWrite) return null;

	const start = bodySource.indexOf(authoredWrite);
	if (start === -1) return null;

	return {
		start,
		end: start + authoredWrite.length,
	};
}

function authoredWriteSource(write: LoweredStateWrite): string | null {
	if (write.operation === 'assign') {
		const operator = write.assignmentOperator ?? '=';
		if (!write.valueSource) return null;
		return `${write.source} ${operator} ${write.valueSource}`;
	}

	if (write.operation === 'update' && write.updateOperator) {
		return write.prefix
			? `${write.updateOperator}${write.source}`
			: `${write.source}${write.updateOperator}`;
	}

	if (write.operation === 'delete') return `delete ${write.source}`;

	if (write.operation === 'call' && write.method) {
		return `${write.source}.${write.method}(${(write.argumentSources ?? []).join(', ')})`;
	}

	return null;
}

function emitEventWriteExpression(
	write: LoweredStateWrite,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const lines = emitEventWrite(write, eventParameters, graphReads, moduleImports, localNames);
	if (lines.length === 0) return null;

	const source = lines.map((line) => line.replace(/^\t/, '')).join('\n');
	return source.endsWith(';') ? source.slice(0, -1) : source;
}

function indentBody(source: string): string[] {
	return source.split('\n').map((line) => (line.length > 0 ? `	${line}` : line));
}

function leadingWhitespaceLength(source: string): number {
	const match = /^\s*/.exec(source);
	return match ? match[0].length : 0;
}

function emitEventWrite(
	write: LoweredStateWrite,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string[] {
	if (write.operation === 'assign' && !write.assignmentOperator) {
		const valueSource = eventWriteValueSource(
			write.valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (valueSource) {
			return [
				'	context.graph.write({',
				`		graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
				`		path: ${JSON.stringify(write.path)},`,
				`		value: ${valueSource},`,
				'	});',
			];
		}
	}

	if (write.operation === 'assign' && write.assignmentOperator) {
		const operator = compoundAssignmentOperator(write.assignmentOperator);
		const valueSource = eventWriteValueSource(
			write.valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (operator && valueSource) {
			return [
				'	context.graph.update({',
				`		graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
				`		path: ${JSON.stringify(write.path)},`,
				'		returnValue: "next",',
				'		update(value) {',
				`			return value ${operator} ${valueSource};`,
				'		},',
				'	});',
			];
		}
	}

	if (write.operation === 'update' && write.updateOperator) {
		const operator = write.updateOperator;
		return [
			'	context.graph.update({',
			`		graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
			`		path: ${JSON.stringify(write.path)},`,
			'		returnValue: "next",',
			'		update(value) {',
			`			return Number(value) ${operator === '++' ? '+' : '-'} 1;`,
			'		},',
			'	});',
		];
	}

	if (write.operation === 'delete') {
		return [
			'	context.graph.delete({',
			`		graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
			`		path: ${JSON.stringify(write.path)},`,
			'	});',
		];
	}

	if (write.operation === 'call' && write.method) {
		const argumentSources = supportedArgumentSources(
			write.argumentSources ?? [],
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (!argumentSources) return [];

		return [
			'	context.graph.call({',
			`		graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
			`		path: ${JSON.stringify(write.path)},`,
			`		method: ${JSON.stringify(write.method)},`,
			`		args: [${argumentSources.join(', ')}],`,
			'	});',
		];
	}

	return [];
}

function scalarWriteLeafSource(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	localNames: ReadonlySet<string>,
): string | null {
	if (symbol.kind !== 'event-handler') return null;
	if ((symbol.writes ?? []).length !== 1) return null;
	if ((symbol.moduleImports ?? []).length > 0 || (symbol.elementHandleCalls ?? []).length > 0) {
		return null;
	}
	const write = symbol.writes?.[0];
	if (!write || write.path.length !== 0) return null;
	if (!eventHandlerBodyAllowsScalarLeaf(symbol, write)) return null;

	if (write.operation === 'update' && write.updateOperator) {
		return [
			'return marklessWriteScalar(context, {',
			`	graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
			'	returnValue: "next",',
			'	update(value) {',
			`		return Number(value) ${write.updateOperator === '++' ? '+' : '-'} 1;`,
			'	},',
			'});',
		].join('\n');
	}

	if (write.operation !== 'assign' || write.assignmentOperator) return null;
	const valueSource =
		literalValueSource(write.valueSource) ?? localValueSource(write.valueSource, localNames);
	if (!valueSource) return null;
	return [
		'return marklessWriteScalar(context, {',
		`	graphNodeId: ${JSON.stringify(write.graphNodeId)},`,
		`	value: ${valueSource},`,
		'});',
	].join('\n');
}

function eventHandlerBodyAllowsScalarLeaf(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	write: LoweredStateWrite,
): boolean {
	const body = eventHandlerBodySource(symbol.source);
	const authoredWrite = authoredWriteSource(write);
	if (!body || !authoredWrite) return false;
	let remainder = body.source.replace(authoredWrite, '');
	for (const parameter of symbol.parameters ?? []) {
		remainder = remainder.replaceAll(`${parameter}.preventDefault();`, '');
		remainder = remainder.replaceAll(`${parameter}.stopPropagation();`, '');
	}
	remainder = remainder.replace(/\breturn\b/g, '');
	return remainder.replace(/[;\s]/g, '') === '';
}

// ---------------------------------------------------------------------------
// DOM-binding emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2 —
// the last of the low-risk emitters. This band builds nodes and prints them
// through `emit-codegen.ts`; it calls nothing in the string-scanner band that
// invariant 5 keeps alive until the stage's final unit.
//
// It is not the wired path. `emitDomBindingModule` below still emits the
// spliced string the compiler ships, and `test/emit-dom-binding.test.ts` runs
// both over the same symbols and records exactly where the printed bytes differ
// from the spliced ones. The printer normalizes rather than preserves, so the
// two are behaviorally equal and not byte-equal, and invariant 2 makes the swap
// an owner-approved step rather than a side effect of this unit.
//
// This site synthesizes its whole module from render data — no authored text is
// spliced into it — so the emitted source map is non-null and names the authored
// file (invariant 3) but carries no segments. There is no honest mapping to
// carry: the emitted `context.value` is not the authored expression's text.
// ---------------------------------------------------------------------------

export type DomBindingEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>;
	/** The authored file the binding was extracted from; names the map. */
	readonly sourceFileName: string;
};

type DomUpdateTarget = Extract<PlannedSymbol, { readonly kind: 'dom-update' }>['target'];
type DomTextTarget = Extract<DomUpdateTarget, { readonly kind: 'text' }>;

/**
 * Build the print input for a DOM-binding module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildDomBindingEmission(input: DomBindingEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const body = isPlainTextUpdateLeaf(input.symbol.target)
		? domTextLeafBody(exportName, input.symbol.hostNodeId)
		: [
				exportNamedDeclarationNode(
					functionDeclarationNode(
						exportName,
						['context'],
						[returnStatementNode(domJournalEntryNode(input.symbol))],
					),
				),
			];

	return {
		program: moduleProgramNode(body),
		source: input.symbol.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed DOM-binding module, with its source map (invariant 3). */
export function emitDomBindingModuleNodes(input: DomBindingEmissionInput): EmittedModule {
	return printEmittedModule(buildDomBindingEmission(input));
}

/**
 * The one target shape that emits a runtime call instead of a journal entry.
 *
 * Stated separately from `emitDomBindingModule`'s inline condition rather than
 * extracted out of it: the string path stays byte-for-byte as it is until the
 * swap, so the two conditions are duplicated on purpose while parity is still
 * accumulating. `test/emit-dom-binding.test.ts` covers both branches on the
 * same fixtures, so a divergence between them fails a test rather than hiding.
 */
function isPlainTextUpdateLeaf(target: DomUpdateTarget): boolean {
	return (
		target.kind === 'text' &&
		target.prefix === undefined &&
		target.suffix === undefined &&
		target.trueValue === undefined &&
		target.falseValue === undefined
	);
}

function domTextLeafBody(exportName: string, hostNodeId: string): EmissionNode[] {
	return [
		moduleImportNode({
			kind: 'named',
			localName: 'marklessUpdateText',
			source: '@markless/web/fns/update-text',
		}),
		withLeadingBlockComment(
			exportNamedDeclarationNode(
				functionDeclarationNode(
					exportName,
					['context'],
					[
						returnStatementNode(
							callNode(identifierNode('marklessUpdateText'), [
								identifierNode('context'),
								literalNode(hostNodeId),
							]),
						),
					],
				),
			),
			' text update leaf marker: type: "setText" ',
		),
	];
}

/** The AST twin of `domJournalEntryProperties`, property for property. */
function domJournalEntryNode(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
): EmissionNode {
	const locator = domLocatorNode(symbol.hostNodeId);
	const target = symbol.target;

	if (target.kind === 'text') {
		return objectNode([
			propertyNode('type', literalNode('setText')),
			propertyNode('locator', locator),
			propertyNode('value', textDomUpdateValueNode(target)),
		]);
	}

	if (target.kind === 'property') {
		return objectNode([
			propertyNode('type', literalNode('setProp')),
			propertyNode('locator', locator),
			propertyNode('name', literalNode(target.name)),
			propertyNode('value', domUpdateValueNode()),
		]);
	}

	if (target.kind === 'class') {
		return objectNode([
			propertyNode('type', literalNode('setAttr')),
			propertyNode('locator', locator),
			propertyNode('name', literalNode('class')),
			propertyNode(
				'value',
				target.trueValue !== undefined && target.falseValue !== undefined
					? conditionalNode(
							domUpdateValueNode(),
							literalNode(target.trueValue),
							literalNode(target.falseValue),
						)
					: domUpdateValueNode(),
			),
		]);
	}

	return objectNode([
		propertyNode('type', literalNode('setAttr')),
		propertyNode('locator', locator),
		propertyNode('name', literalNode(target.kind === 'style' ? 'style' : target.name)),
		propertyNode('value', domUpdateValueNode()),
	]);
}

/** `context.domUpdate?.hostNodeId ?? "<hostNodeId>"`. */
function domLocatorNode(hostNodeId: string): EmissionNode {
	return logicalNode(
		'??',
		optionalMemberNode(memberChainNode('context.domUpdate'), 'hostNodeId'),
		literalNode(hostNodeId),
	);
}

/**
 * `context.value`, built fresh per use.
 *
 * A shared node object would appear at two places in one tree, which prints the
 * same but makes the tree a graph rather than a tree — every walker over it
 * (the TSRX assertion included) would then have to decide whether a second
 * visit is a cycle.
 */
function domUpdateValueNode(): EmissionNode {
	return memberChainNode('context.value');
}

/** The AST twin of `textDomUpdateValueSource`. */
function textDomUpdateValueNode(target: DomTextTarget): EmissionNode {
	const conditional = (): EmissionNode | null =>
		target.trueValue !== undefined && target.falseValue !== undefined
			? conditionalNode(
					domUpdateValueNode(),
					literalNode(target.trueValue),
					literalNode(target.falseValue),
				)
			: null;

	if (target.prefix === undefined && target.suffix === undefined) {
		return conditional() ?? domUpdateValueNode();
	}

	// The text path parenthesizes the conditional before reusing it twice; the
	// printer derives the parentheses the grammar needs, so none are built here.
	const base = (): EmissionNode => conditional() ?? domUpdateValueNode();

	return binaryNode(
		'+',
		binaryNode(
			'+',
			literalNode(target.prefix ?? ''),
			conditionalNode(
				binaryNode('==', base(), literalNode(null)),
				literalNode(''),
				callNode(identifierNode('String'), [base()]),
			),
		),
		literalNode(target.suffix ?? ''),
	);
}

// Nothing reads this export at runtime; consumer builds drop it rather than
// ship one authored-source string per symbol chunk.
function authoredSourceLines(source: string, omit: boolean): string[] {
	return omit ? [] : [`export const authoredSource = ${JSON.stringify(source)};`];
}

export function canEmitBehaviorModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'behavior' }>,
): boolean {
	if (symbol.moduleImport) return true;

	return isInlineFunctionSource(symbol.functionSource);
}

function isInlineFunctionSource(source: string): boolean {
	const trimmed = source.trim();
	if (trimmed.startsWith('function') || trimmed.startsWith('async function')) return true;

	return trimmed.includes('=>');
}

// ---------------------------------------------------------------------------
// Behavior emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2.
// This band builds nodes and prints them through `emit-codegen.ts`. It calls
// nothing in the string-scanner band (`topLevelBinaryOperators` through
// `sourceReferencesIdentifier`), which invariant 5 keeps alive until the
// stage's final unit but which a migrated site may not call. The behavior
// emitter never reached that band in the first place: its only authored input
// is `functionSource`, which the text path splices whole.
//
// It is not yet the wired path. `emitBehaviorModule` above still produces the
// bytes the compiler ships; `test/emit-behavior.test.ts` runs both paths over
// the same inputs and records where the printed bytes differ from the spliced
// ones. The printer normalizes rather than preserves, so the two are
// behaviorally equal and not byte-equal, and invariant 2 makes the swap an
// owner-approved step rather than a side effect of this unit.
// ---------------------------------------------------------------------------

export type BehaviorEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'behavior' }>;
	readonly omitAuthoredSource: boolean;
	/** The authored file the behavior was extracted from; names the map. */
	readonly sourceFileName: string;
};

/**
 * Build the print input for a behavior module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildBehaviorEmission(input: BehaviorEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const inputCount = input.symbol.inputSources.length;
	const projection = behaviorProjection(input.symbol.functionSource, input.sourceFileName);

	const body: EmissionNode[] = [
		...(input.symbol.moduleImport
			? [
					moduleImportNode({
						kind: input.symbol.moduleImport.kind,
						localName: input.symbol.moduleImport.localName,
						importedName: input.symbol.moduleImport.importedName,
						source: input.symbol.moduleImport.source,
					}),
				]
			: []),
		...(input.omitAuthoredSource
			? []
			: [
					exportNamedDeclarationNode(
						constDeclarationNode('authoredSource', literalNode(input.symbol.source)),
					),
				]),
		exportNamedDeclarationNode(
			constDeclarationNode(
				'behaviorFunctionSource',
				literalNode(input.symbol.functionSource),
			),
		),
		exportNamedDeclarationNode(
			constDeclarationNode(
				'behaviorInputSources',
				stringArrayNode(input.symbol.inputSources),
			),
		),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				constDeclarationNode('inputs', behaviorInputsExpression(inputCount)),
				constDeclarationNode(
					'behavior',
					inputCount > 0
						? callNode(projection.functionExpression, [
								spreadNode(identifierNode('inputs')),
							])
						: projection.functionExpression,
				),
				returnStatementNode(
					callNode(identifierNode('behavior'), [memberChainNode('context.element')]),
				),
			]),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: projection.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed behavior module, with its source map (invariant 3). */
export function emitBehaviorModuleNodes(input: BehaviorEmissionInput): EmittedModule {
	return printEmittedModule(buildBehaviorEmission(input));
}

/**
 * `context.behaviorInputs ?? new Array(n).fill(undefined)`, or `[]` when the
 * behavior takes no inputs — the two forms the text path writes today.
 *
 * The zero-input form is a separate branch rather than `new Array(0).fill(...)`
 * because the text path emits a literal `[]` there, and this band's job is to
 * reproduce that behavior, not to improve on it.
 */
function behaviorInputsExpression(inputCount: number): EmissionNode {
	if (inputCount === 0) return arrayNode([]);

	return logicalNode(
		'??',
		memberChainNode('context.behaviorInputs'),
		callNode(
			memberNode(newNode(identifierNode('Array'), [literalNode(inputCount)]), 'fill'),
			[identifierNode('undefined')],
		),
	);
}

type BehaviorProjection = {
	/** The one text every printed node carries an offset into. */
	readonly source: string;
	readonly functionExpression: EmissionNode;
};

/**
 * Parse the authored behavior factory once, as an expression.
 *
 * The factory is parenthesized so it parses as an expression statement in every
 * authored form — a `function` at statement start would otherwise be a
 * declaration, and the text path wraps it in parentheses for the same reason
 * (`callableBehaviorFunctionSource`). `preserveParens: false` then drops the
 * wrapper, and the printer re-derives whatever parentheses calling the factory
 * actually needs.
 */
function behaviorProjection(functionSource: string, filename: string): BehaviorProjection {
	const source = `(${functionSource});`;
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) {
		throw new Error(
			`symbol-modules: behavior emission could not parse its factory source (${errors
				.map((error) => error.message)
				.join('; ')})`,
		);
	}

	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (
		statements.length !== 1 ||
		!last ||
		last.type !== 'ExpressionStatement' ||
		!isNode(last.expression)
	) {
		throw new Error(
			'symbol-modules: behavior emission expected its factory source to be a single expression',
		);
	}

	return { source, functionExpression: last.expression as unknown as EmissionNode };
}

// ---------------------------------------------------------------------------
// State-initializer emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2.
// This band builds nodes and prints them through `emit-codegen.ts`. It reaches
// into nothing in the string-scanner band (lines "topLevelBinaryOperators
// through sourceReferencesIdentifier"), which invariant 5 keeps alive until the
// stage's final unit but which a migrated site may not call.
//
// It is not yet the wired path. `test/emit-state-initializer.test.ts` runs both
// paths over the same inputs and records exactly where the printed bytes differ
// from the spliced ones; the printer normalizes, so the two are behaviorally
// equal and not byte-equal, and invariant 2 makes the swap an owner-approved
// step rather than a side effect of this unit.
// ---------------------------------------------------------------------------

/** A component prop the initializer reads, before it becomes a graph read. */
export type StateInitializerPropRead = {
	readonly localName: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type StateInitializerEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'state-initializer' }>;
	readonly moduleDeclarations: readonly string[];
	readonly moduleImports: readonly SemanticModuleImport[];
	readonly propReads: ReadonlyArray<StateInitializerPropRead>;
	readonly omitAuthoredSource: boolean;
	/** The authored file the initializer was extracted from; names the map. */
	readonly sourceFileName: string;
};

/**
 * Build the print input for a state-initializer module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildStateInitializerEmission(
	input: StateInitializerEmissionInput,
): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const declarations = referencedModuleDeclarationSources(
		input.symbol.source,
		input.moduleDeclarations,
		input.sourceFileName,
	);
	const projection = stateInitializerProjection(
		declarations,
		input.symbol.source,
		input.sourceFileName,
	);
	const referencedNames = referencedIdentifierNames(projection.program as unknown as AnyNode);
	const imports = dedupeModuleImports([
		...(input.symbol.moduleImports ?? []),
		...input.moduleImports.filter((moduleImport) => referencedNames.has(moduleImport.localName)),
	]);

	const body: EmissionNode[] = [
		...imports.map((moduleImport) =>
			moduleImportNode({
				kind: moduleImport.kind,
				localName: moduleImport.localName,
				importedName: moduleImport.importedName,
				source: moduleImport.source,
			}),
		),
		...projection.declarationStatements,
		...(input.omitAuthoredSource
			? []
			: [
					exportNamedDeclarationNode(
						constDeclarationNode('authoredSource', literalNode(input.symbol.source)),
					),
				]),
		exportNamedDeclarationNode(
			functionDeclarationNode(
				exportName,
				input.propReads.length > 0 ? ['context'] : [],
				[
					...input.propReads.map(stateInitializerPropReadStatement),
					returnStatementNode(projection.initializerExpression),
				],
			),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: projection.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed state-initializer module, with its source map (invariant 3). */
export function emitStateInitializerModuleNodes(
	input: StateInitializerEmissionInput,
): EmittedModule {
	return printEmittedModule(buildStateInitializerEmission(input));
}

type StateInitializerProjection = {
	/** The one text every printed node carries an offset into. */
	readonly source: string;
	readonly program: unknown;
	readonly declarationStatements: ReadonlyArray<EmissionNode>;
	readonly initializerExpression: EmissionNode;
};

/**
 * Parse the selected module-scope declarations and the initializer expression
 * together, once.
 *
 * One parse matters for the source map: a node's `start`/`end` index the text it
 * was parsed from, so declarations parsed separately from the initializer would
 * carry offsets into two different strings and the map would attribute one of
 * them to positions in the other. The initializer is parenthesized so it parses
 * as an expression statement in every authored form (an object literal at
 * statement start would otherwise be a block); `preserveParens: false` then
 * drops the wrapper, and the printer re-derives whatever parentheses the
 * expression actually needs.
 */
function stateInitializerProjection(
	declarations: readonly string[],
	initializerSource: string,
	filename: string,
): StateInitializerProjection {
	const source = [...declarations, `(${initializerSource});`].join('\n');
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) {
		throw new Error(
			`symbol-modules: state-initializer emission could not parse its projected source (${errors
				.map((error) => error.message)
				.join('; ')})`,
		);
	}

	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (!last || last.type !== 'ExpressionStatement' || !isNode(last.expression)) {
		throw new Error(
			'symbol-modules: state-initializer emission expected its projected source to end in an expression statement',
		);
	}

	return {
		source,
		program,
		declarationStatements: statements.slice(0, -1) as unknown as ReadonlyArray<EmissionNode>,
		initializerExpression: last.expression as unknown as EmissionNode,
	};
}

/**
 * `const <local> = context.graph.read("<id>", [...])`.
 *
 * Built directly rather than through the foundation's `graphReadCall`, which
 * omits the path argument on an empty path. The text this replaces always
 * passes the array, so passing it keeps the call shape unchanged.
 */
function stateInitializerPropReadStatement(propRead: StateInitializerPropRead): EmissionNode {
	return constDeclarationNode(
		propRead.localName,
		callNode(memberChainNode('context.graph.read'), [
			literalNode(propRead.graphNodeId),
			stringArrayNode(propRead.path),
		]),
	);
}

/**
 * The prop reads a state initializer needs, as data.
 *
 * The structured twin of `stateInitializerPropDeclarations`. It decides which
 * props the initializer mentions from the parsed tree rather than from a text
 * scan, because the scan lives in the band a migrated site may not call.
 */
export function stateInitializerPropReads(
	symbol: Extract<PlannedSymbol, { readonly kind: 'state-initializer' }>,
	semanticGraph: SymbolModulesInput['semanticGraph'],
	renderData: SymbolModulesInput['renderData'],
	sourceFileName: string,
): StateInitializerPropRead[] {
	if (!semanticGraph) return [];
	const componentName =
		semanticGraph.localDeclarations.find(
			(declaration) =>
				declaration.scope === 'component' && declaration.name === symbol.name,
		)?.componentName ?? renderData?.root?.componentName;
	if (!componentName) return [];

	const propBinding = semanticGraph.graphBindings.find(
		(binding) => binding.kind === 'prop' && binding.componentName === componentName,
	);
	if (!propBinding) return [];

	const referenced = initializerReferencedNames(symbol.source, sourceFileName);
	if (propBinding.id !== 'prop:props') {
		return referenced.has(propBinding.name)
			? [{ localName: propBinding.name, graphNodeId: propBinding.id, path: [] }]
			: [];
	}

	return semanticGraph.componentPropBindings.flatMap((binding) =>
		binding.componentName === componentName && referenced.has(binding.localName)
			? [
					{
						localName: binding.localName,
						graphNodeId: 'prop:props',
						path: binding.propPath,
					},
				]
			: [],
	);
}

/**
 * The module-scope declarations the initializer transitively needs, in the same
 * order the text path selects them.
 *
 * The AST twin of `referencedModuleDeclarations`: a declaration is pulled in
 * when the accumulated reference set mentions one of the names it declares, and
 * pulling it in adds its own identifiers to that set, until nothing new is
 * reached.
 */
function referencedModuleDeclarationSources(
	initializerSource: string,
	declarations: readonly string[],
	filename: string,
): string[] {
	const remaining = declarations.map((declaration) => {
		const parsed = parseEmissionSource(declaration, filename, 'ts').program as unknown as AnyNode;
		return {
			declaration,
			names: declaredStatementNames(parsed),
			references: referencedIdentifierNames(parsed),
		};
	});

	const references = initializerReferencedNames(initializerSource, filename);
	const selected: string[] = [];
	let changed = true;
	while (changed) {
		changed = false;
		for (let index = 0; index < remaining.length; index += 1) {
			const candidate = remaining[index]!;
			if (!candidate.names.some((name) => references.has(name))) continue;
			selected.push(candidate.declaration);
			for (const name of candidate.references) references.add(name);
			remaining.splice(index, 1);
			index -= 1;
			changed = true;
		}
	}
	return selected;
}

function initializerReferencedNames(initializerSource: string, filename: string): Set<string> {
	const parsed = parseEmissionSource(`(${initializerSource});`, filename, 'ts')
		.program as unknown as AnyNode;
	return referencedIdentifierNames(parsed);
}

/** The names a parsed module's top-level declarations bind. */
function declaredStatementNames(program: AnyNode): string[] {
	return asNodes(program.body).flatMap((statement) => {
		if (statement.type === 'VariableDeclaration') {
			return asNodes(statement.declarations).flatMap((declarator) => {
				const id = declarator.id;
				return isNode(id) && id.type === 'Identifier' && typeof id.name === 'string'
					? [id.name]
					: [];
			});
		}
		const id = statement.id;
		return isNode(id) && id.type === 'Identifier' && typeof id.name === 'string' ? [id.name] : [];
	});
}

/**
 * Every identifier the tree mentions, excluding a non-computed member's
 * property name.
 *
 * That one exclusion is what `sourceReferencesIdentifier` approximates by
 * refusing a match preceded by a lone `.`; the tree states it exactly. Binding
 * positions are deliberately included, matching the text path, which appends a
 * selected declaration's whole source to the haystack.
 */
function referencedIdentifierNames(root: AnyNode): Set<string> {
	const names = new Set<string>();
	const seen = new Set<object>();
	const stack: AnyNode[] = [root];

	while (stack.length > 0) {
		const node = stack.pop()!;
		if (seen.has(node)) continue;
		seen.add(node);

		if (node.type === 'Identifier' && typeof node.name === 'string') names.add(node.name);

		const skipProperty = node.type === 'MemberExpression' && node.computed !== true;
		for (const [key, value] of Object.entries(node)) {
			if (key === 'parent' || key === 'loc' || key === 'range') continue;
			if (skipProperty && key === 'property') continue;
			if (Array.isArray(value)) {
				for (const item of value) if (isNode(item)) stack.push(item);
				continue;
			}
			if (isNode(value)) stack.push(value);
		}
	}

	return names;
}

/**
 * The AST path's import dedupe. Same key as `uniqueModuleImports`, which sits
 * inside the scanner band a migrated site may not call.
 */
function dedupeModuleImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): ReadonlyArray<SemanticModuleImport> {
	const seen = new Set<string>();
	const unique: SemanticModuleImport[] = [];

	for (const moduleImport of moduleImports) {
		const key = [
			moduleImport.kind,
			moduleImport.localName,
			moduleImport.importedName ?? '',
			moduleImport.source,
		].join('\0');
		if (seen.has(key)) continue;

		seen.add(key);
		unique.push(moduleImport);
	}

	return unique;
}

// ---------------------------------------------------------------------------
// Sync computed derive emission — migrated to AST construction plus the printer
// per `specs/framework/14-emission-codegen-migration.md` stage 1, sketch item 2.
//
// The authored derive function is parsed once, its dependency reads are
// rewritten by *node identity* (invariant 6) rather than by span arithmetic over
// the authored text, and the exported wrapper is printed through
// `emit-codegen.ts` — which applies the TSRX-node assertion (invariant 4) and
// the non-null source-map guard (invariant 3) at this site.
//
// The module frame around the printed function (imports, the `authoredSource`
// export, the blank-line layout) is still assembled from lines. That is
// deliberate: those pieces are produced by helpers shared with emitters this
// unit does not own, and printing the whole module as one program would drop the
// authored blank lines the printer does not preserve — a byte change beyond the
// indentation difference this migration is scoped to.
// ---------------------------------------------------------------------------

/**
 * The authored derive source is a function *expression* (`() => ...`,
 * `function () { ... }`), which is not a module on its own — an anonymous
 * `function () {}` at statement position is a syntax error. Wrapping it in a
 * declarator makes it parseable without changing the text of the function
 * itself, so a dependency's authored `source` still matches the wrapped text
 * exactly.
 */
const DERIVE_SOURCE_PREFIX = 'const __marklessSyncComputedDerive = (\n';
const DERIVE_SOURCE_SUFFIX = '\n);';
const DERIVE_SOURCE_FILENAME = 'markless-sync-computed-derive.ts';

/**
 * The print input for one derive module's exported function.
 *
 * Exported so the site's focused test can run the foundation's determinism
 * helper (invariant 7: print twice, then reparse and reprint) against the exact
 * tree production builds.
 */
export function syncComputedDeriveEmissionInput(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): EmissionPrintInput {
	return syncComputedDeriveEmission(symbol, captureSlots).input;
}

function syncComputedDeriveEmission(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): { readonly input: EmissionPrintInput; readonly statements: ReadonlyArray<EmissionNode> } {
	const exportName = symbolExportName(symbol.id);
	const wrappedSource = `${DERIVE_SOURCE_PREFIX}${symbol.source}${DERIVE_SOURCE_SUFFIX}`;
	const statements = syncComputedDeriveStatements(symbol, captureSlots, wrappedSource);

	const input: EmissionPrintInput = {
		program: {
			type: 'Program',
			sourceType: 'module',
			body: [
				{
					type: 'ExportNamedDeclaration',
					specifiers: [],
					source: null,
					declaration: {
						type: 'FunctionDeclaration',
						id: identifierNode(exportName),
						async: false,
						generator: false,
						params: [identifierNode('context')],
						body: { type: 'BlockStatement', body: statements },
					},
				},
			],
		},
		// The tree's offsets are offsets into the wrapped text, so the map is
		// built against that text. Naming the *authored* file at every print site
		// is the separate source-map wiring unit in the campaign sketch.
		source: wrappedSource,
		outputFileName: `${exportName}.js`,
		site: {
			phase: 'payload',
			passId: 'symbol-modules',
			sourceFileName: DERIVE_SOURCE_FILENAME,
			symbolId: symbol.id,
		},
	};

	return { input, statements };
}

function emitSyncComputedDeriveModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	omitAuthoredSource: boolean,
): string {
	const emission = syncComputedDeriveEmission(symbol, captureSlots);
	const printed = printEmittedModule(emission.input);
	const referenced = deriveReferencedIdentifierNames(emission.statements);
	const imports = uniqueModuleImports(
		(symbol.moduleImports ?? []).filter((moduleImport) =>
			referenced.has(moduleImport.localName),
		),
	);

	return [
		...imports.map(emitModuleImport),
		...(imports.length > 0 ? [''] : []),
		...authoredSourceLines(symbol.source, omitAuthoredSource),
		'',
		printed.code,
		'',
	].join('\n');
}

/**
 * The names the emitted body actually refers to, used to decide which module
 * imports the emitted module still needs.
 *
 * This replaces a call into the string-scanner band (`sourceReferencesIdentifier`
 * scans the emitted text), which is why it is here rather than reusing it: the
 * campaign requires a migrated site to reach no scanner. Reading the tree is
 * also more accurate — a name that appears only inside a string literal is not a
 * reference, and the text scan counted it as one.
 *
 * Non-computed member properties and non-computed object keys are excluded: they
 * are names of properties, not references to bindings.
 */
function deriveReferencedIdentifierNames(root: unknown): ReadonlySet<string> {
	const names = new Set<string>();
	const seen = new Set<object>();
	const stack: unknown[] = [root];

	while (stack.length > 0) {
		const value = stack.pop();
		if (!value || typeof value !== 'object') continue;
		if (seen.has(value)) continue;
		seen.add(value);

		if (Array.isArray(value)) {
			for (const item of value) stack.push(item);
			continue;
		}

		const node = value as AnyNode;
		if (node.type === 'Identifier' && typeof node.name === 'string') {
			names.add(node.name);
			continue;
		}

		for (const [key, child] of Object.entries(node)) {
			if (REFERENCE_WALK_IGNORED_KEYS.has(key)) continue;
			if (node.computed !== true && key === 'property' && node.type === 'MemberExpression') {
				continue;
			}
			if (node.computed !== true && key === 'key' && node.type === 'Property') continue;
			stack.push(child);
		}
	}

	return names;
}

/** Side tables and back-pointers, which are not tree structure. */
const REFERENCE_WALK_IGNORED_KEYS: ReadonlySet<string> = new Set([
	'parent',
	'loc',
	'range',
	'leadingComments',
	'trailingComments',
	'comments',
]);

function syncComputedDeriveStatements(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	wrappedSource: string,
): EmissionNode[] {
	const derive = parseDeriveFunction(wrappedSource);
	const body = derive?.body as AnyNode | undefined;
	if (!body) return [returnUndefinedStatement()];

	const statements =
		body.type === 'BlockStatement'
			? asNodes(body.body)
			: [{ type: 'ReturnStatement', argument: body } as AnyNode];

	rewriteDeriveReads(statements, symbol.dependencies ?? [], captureSlots, wrappedSource);

	if (statements.length === 0) return [returnUndefinedStatement()];
	return statements as unknown as EmissionNode[];
}

function returnUndefinedStatement(): EmissionNode {
	return { type: 'ReturnStatement', argument: identifierNode('undefined') };
}

function parseDeriveFunction(wrappedSource: string): AnyNode | null {
	let program: AnyNode;
	try {
		const parsed = parseEmissionSource(wrappedSource, DERIVE_SOURCE_FILENAME);
		if (parsed.errors.length > 0) return null;
		program = parsed.program as unknown as AnyNode;
	} catch {
		// A derive whose authored source does not parse has no tree to rewrite.
		// The caller emits `return undefined;` rather than shipping text that
		// cannot be printed.
		return null;
	}

	const declaration = asNodes(program.body)[0];
	if (declaration?.type !== 'VariableDeclaration') return null;

	const init = asNodes(declaration.declarations)[0]?.init;
	if (!isNode(init)) return null;
	if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') return null;

	return init;
}

/**
 * Keys the read walk does not descend into.
 *
 * This mirrors the ignore set `ast/nodes.ts#childNodes` uses, deliberately:
 * the string path this replaced detected reads by walking with `childNodes`, so
 * matching its blind spots — `id` above all, which keeps a declared function's
 * own name from being rewritten into a graph read — is what makes the migrated
 * emitter select the same reads as the emitter it replaces.
 */
const DERIVE_WALK_IGNORED_KEYS: ReadonlySet<string> = new Set([
	'closingElement',
	'comments',
	'id',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);

/**
 * Rewrite every dependency read in the derive body to a graph or capture read,
 * in place, keyed on the node that carries the read.
 *
 * The outermost matching node wins: once a read is replaced the walk does not
 * descend into it, so a dependency on `user.profile` and a dependency on `user`
 * cannot both rewrite the same text. The string path had no such rule and
 * corrupted the second splice when the spans nested.
 */
function rewriteDeriveReads(
	statements: ReadonlyArray<AnyNode>,
	dependencies: ReadonlyArray<SemanticGraphDependency>,
	captureSlots: ReadonlyArray<CaptureSlot>,
	wrappedSource: string,
): void {
	if (dependencies.length === 0) return;

	const visit = (
		node: AnyNode,
		parent: AnyNode | undefined,
		replace: ((next: EmissionNode) => void) | null,
	): void => {
		const dependency = matchingDependency(node, parent, dependencies, wrappedSource);
		if (dependency && replace) {
			replace(deriveReadNode(dependency, captureSlots));
			return;
		}

		if (node.type === 'Property') {
			visitPropertyChildren(node, visit);
			return;
		}

		for (const [key, value] of Object.entries(node)) {
			if (DERIVE_WALK_IGNORED_KEYS.has(key)) continue;

			if (Array.isArray(value)) {
				value.forEach((item, index) => {
					if (!isNode(item)) return;
					visit(item, node, (next) => {
						value[index] = next;
					});
				});
				continue;
			}

			if (!isNode(value)) continue;
			visit(value, node, (next) => {
				(node as Record<string, unknown>)[key] = next;
			});
		}
	};

	for (const statement of statements) visit(statement, undefined, null);
}

/**
 * A shorthand property's key and value cover the same text, so a generic walk
 * would match both. Only the value is a read; replacing it also has to drop the
 * shorthand flag, or the printer would render the property as its key alone and
 * silently discard the rewritten read.
 */
function visitPropertyChildren(
	property: AnyNode,
	visit: (
		node: AnyNode,
		parent: AnyNode | undefined,
		replace: ((next: EmissionNode) => void) | null,
	) => void,
): void {
	const key = property.key;
	if (property.computed === true && isNode(key)) {
		visit(key, property, (next) => {
			(property as Record<string, unknown>).key = next;
		});
	}

	const value = property.value;
	if (!isNode(value)) return;

	visit(value, property, (next) => {
		(property as Record<string, unknown>).value = next;
		(property as Record<string, unknown>).shorthand = false;
	});
}

function matchingDependency(
	node: AnyNode,
	parent: AnyNode | undefined,
	dependencies: ReadonlyArray<SemanticGraphDependency>,
	wrappedSource: string,
): SemanticGraphDependency | null {
	if (!isGraphReadExpression(node)) return null;
	if (!isValuePositionGraphRead(node, parent)) return null;
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return null;

	const text = wrappedSource.slice(node.start, node.end);
	return dependencies.find((dependency) => dependency.source === text) ?? null;
}

function deriveReadNode(
	dependency: SemanticGraphDependency,
	captureSlots: ReadonlyArray<CaptureSlot>,
): EmissionNode {
	const slot = captureSlots.find((candidate) => captureSlotMatchesRead(candidate, dependency));
	if (slot) {
		return callNode(memberChainNode('context.capture.read'), [literalNode(slot.id)]);
	}

	return graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: dependency.graphNodeId,
		path: dependency.path,
	});
}

function staticSourcePath(source: string): ReadonlyArray<string> | null {
	const parts = source.split('.');
	if (parts.length === 0) return null;
	if (parts.some((part) => !isIdentifierObjectKey(part))) return null;

	return parts;
}

// ---------------------------------------------------------------------------
// Async-computed-runner emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 2,
// third emitter. Built the same way the state-initializer band above is built:
// nodes go to `emit-codegen.ts` and come back printed, with a source map.
//
// This band calls nothing in the scanner band (`topLevelBinaryOperators`
// through `sourceReferencesIdentifier`), which invariant 5 keeps alive until
// stage 1's final unit but which a migrated site may not reach. Two string-path
// helpers are therefore re-expressed here rather than shared:
// `graphReadCallSource` and `uniqueModuleImports` are inside the band, and
// `staticSourcePath` reaches it through `isIdentifierObjectKey`. The foundation's
// `graphReadCall` and the band-free `dedupeModuleImports` and
// `asyncRunnerDependencyBinding` below stand in for them, with the same
// behavior.
//
// It is not yet the wired path. `emitAsyncComputedRunnerModule` stays the active
// emitter; `test/emit-async-runner.test.ts` runs both over the same inputs and
// records where the printed bytes differ from the spliced ones. Invariant 2
// makes the swap an owner-approved step, not a side effect of this unit.
// ---------------------------------------------------------------------------

export type AsyncComputedRunnerEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'async-computed-runner' }>;
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
	readonly omitAuthoredSource: boolean;
	/** The authored file the runner was extracted from; names the map. */
	readonly sourceFileName: string;
};

/**
 * Build the print input for an async-computed-runner module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildAsyncComputedRunnerEmission(
	input: AsyncComputedRunnerEmissionInput,
): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const projection = asyncRunnerProjection(input.symbol.source, input.sourceFileName);
	const imports = dedupeModuleImports(input.symbol.moduleImports ?? []);

	const body: EmissionNode[] = [
		...imports.map((moduleImport) =>
			moduleImportNode({
				kind: moduleImport.kind,
				localName: moduleImport.localName,
				importedName: moduleImport.importedName,
				source: moduleImport.source,
			}),
		),
		...(input.omitAuthoredSource
			? []
			: [
					exportNamedDeclarationNode(
						constDeclarationNode('authoredSource', literalNode(input.symbol.source)),
					),
				]),
		exportNamedDeclarationNode(
			functionDeclarationNode(
				exportName,
				['context'],
				[
					asyncRunnerReadBindingStatement(),
					...asyncRunnerDependencyStatements(
						input.symbol.dependencies ?? [],
						input.captureSlots,
					),
					constDeclarationNode('run', projection.runnerExpression),
					returnStatementNode(
						callNode(identifierNode('run'), [
							objectNode([
								propertyNode('key', memberChainNode('context.key')),
								propertyNode('signal', memberChainNode('context.signal')),
								shorthandPropertyNode('read'),
							]),
						]),
					),
				],
			),
		),
	];

	return {
		program: moduleProgramNode(body),
		source: projection.source,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed async-computed-runner module, with its source map (invariant 3). */
export function emitAsyncComputedRunnerModuleNodes(
	input: AsyncComputedRunnerEmissionInput,
): EmittedModule {
	return printEmittedModule(buildAsyncComputedRunnerEmission(input));
}

/**
 * `const read = context.graph?.read ? context.graph.read.bind(context.graph) : context.read;`
 *
 * The runner is handed a `read` that works against either shape of context: the
 * compiled graph exposes `context.graph.read`, which has to stay bound to the
 * graph, while a bare async context exposes `context.read` directly.
 */
function asyncRunnerReadBindingStatement(): EmissionNode {
	return constDeclarationNode(
		'read',
		conditionalNode(
			optionalMemberNode(memberChainNode('context.graph'), 'read'),
			callNode(memberChainNode('context.graph.read.bind'), [memberChainNode('context.graph')]),
			memberChainNode('context.read'),
		),
	);
}

/**
 * One `const <name> = ...;` per dependency the runner closes over, in dependency
 * order, first binding wins.
 *
 * The AST twin of `asyncRunnerDependencyDeclarations`. A dependency covered by a
 * capture slot reads through the capture table; every other one reads through
 * the bound `read` above.
 */
function asyncRunnerDependencyStatements(
	dependencies: ReadonlyArray<SemanticGraphDependency>,
	captureSlots: ReadonlyArray<CaptureSlot>,
): EmissionNode[] {
	const statements: EmissionNode[] = [];
	const seenNames = new Set<string>();

	for (const dependency of dependencies) {
		const binding = asyncRunnerDependencyBinding(dependency);
		if (!binding || seenNames.has(binding.name)) continue;

		seenNames.add(binding.name);
		const slot = captureSlots.find((candidate) => captureSlotMatchesRead(candidate, dependency));
		statements.push(
			constDeclarationNode(
				binding.name,
				slot
					? callNode(memberChainNode('context.capture.read'), [literalNode(slot.id)])
					: graphReadCall({
							callee: 'read',
							graphNodeId: binding.graphNodeId,
							path: binding.path,
						}),
			),
		);
	}

	return statements;
}

/** Matches `isIdentifierObjectKey`, which sits inside the scanner band. */
const ASYNC_RUNNER_IDENTIFIER = /^[$A-Z_a-z][$0-9A-Z_a-z]*$/;

/**
 * The local name a dependency binds and the graph path it reads, or `null` when
 * the dependency source is not a plain dotted name.
 *
 * The band-free twin of `asyncRunnerDependencyDeclaration`: same trailing-member
 * arithmetic, with the identifier test inlined so this site reaches no scanner.
 */
function asyncRunnerDependencyBinding(dependency: SemanticGraphDependency): {
	readonly name: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
} | null {
	const parts = dependency.source.split('.');
	if (parts.some((part) => !ASYNC_RUNNER_IDENTIFIER.test(part))) return null;

	const [name, ...memberPath] = parts;
	if (!name) return null;

	return {
		name,
		graphNodeId: dependency.graphNodeId,
		path: dependency.path.slice(0, Math.max(0, dependency.path.length - memberPath.length)),
	};
}

type AsyncRunnerProjection = {
	/** The one text every printed node carries an offset into. */
	readonly source: string;
	readonly runnerExpression: EmissionNode;
};

/**
 * Parse the runner expression, once.
 *
 * Only the runner carries authored spans — the imports, the `read` binding, the
 * dependency reads, and the call are all synthesized — so this is the whole of
 * the source the map points into. The runner is parenthesized so it parses as an
 * expression statement whatever its authored form; `preserveParens: false` drops
 * the wrapper and the printer re-derives whatever parentheses the expression
 * actually needs in initializer position.
 */
function asyncRunnerProjection(runnerSource: string, filename: string): AsyncRunnerProjection {
	const source = `(${runnerSource});`;
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) {
		throw new Error(
			`symbol-modules: async-computed-runner emission could not parse its projected source (${errors
				.map((error) => error.message)
				.join('; ')})`,
		);
	}

	const statements = asNodes((program as unknown as AnyNode).body);
	const last = statements.at(-1);
	if (!last || last.type !== 'ExpressionStatement' || !isNode(last.expression)) {
		throw new Error(
			'symbol-modules: async-computed-runner emission expected its projected source to be an expression statement',
		);
	}

	return { source, runnerExpression: last.expression as unknown as EmissionNode };
}

function symbolExportName(symbolId: string): string {
	const name = symbolId.replace(/[^$0-9A-Z_a-z]/g, '_');
	if (/^[$A-Z_a-z]/.test(name)) return name;
	return `_${name}`;
}

function supportedValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	return (
		literalValueSource(valueSource) ??
		eventFieldAssignmentSource(valueSource, eventParameters) ??
		graphReadSource(valueSource, graphReads) ??
		localValueSource(valueSource, localNames) ??
		arrayLiteralValueSource(
			valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		) ??
		objectLiteralValueSource(
			valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		) ??
		staticCallValueSource(
			valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		) ??
		parenthesizedValueSource(
			valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		) ??
		unaryValueSource(valueSource, eventParameters, graphReads, moduleImports, localNames) ??
		conditionalValueSource(
			valueSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		) ??
		binaryValueSource(valueSource, eventParameters, graphReads, moduleImports, localNames)
	);
}

function eventWriteValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const supported = supportedValueSource(
		valueSource,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (supported) return supported;

	const source = valueSource?.trim();
	if (!source) return null;

	return spliceGraphReadsAndLocals(source, graphReads, localNames);
}

function spliceGraphReadsAndLocals(
	source: string,
	graphReads: ReadonlyArray<LoweredStateRead>,
	localNames: ReadonlySet<string>,
): string {
	const replacements = [
		...graphReads.map((read) => ({
			source: read.source,
			replacement: graphReadCallSource('context.graph.read', read.graphNodeId, read.path),
		})),
		...Array.from(localNames).map((name) => ({
			source: name,
			replacement: `context.locals?.${name}`,
		})),
	].sort((left, right) => right.source.length - left.source.length);

	let emitted = source;
	for (const replacement of replacements) {
		emitted = replaceIdentifierPath(emitted, replacement.source, replacement.replacement);
	}

	return emitted;
}

function replaceIdentifierPath(source: string, target: string, replacement: string): string {
	let emitted = '';
	let cursor = 0;

	for (
		let index = source.indexOf(target);
		index !== -1;
		index = source.indexOf(target, index + target.length)
	) {
		const before = source[index - 1] ?? '';
		const after = source[index + target.length] ?? '';
		if (isIdentifierChar(before) || before === '.' || isIdentifierChar(after)) continue;

		emitted += source.slice(cursor, index) + replacement;
		cursor = index + target.length;
	}

	return emitted + source.slice(cursor);
}

function localValueSource(
	valueSource: string | undefined,
	localNames: ReadonlySet<string>,
): string | null {
	const source = valueSource?.trim();
	if (!source) return null;

	const path = staticSourcePath(source);
	if (!path || path.length < 2) return null;
	if (!localNames.has(path[0] ?? '')) return null;

	return `context.locals?.${path.join('?.')}`;
}

function arrayLiteralValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const innerSource = arrayLiteralInnerSource(valueSource);
	if (innerSource === null) return null;

	const elementSources = splitTopLevelArrayElementSources(innerSource);
	if (!elementSources) return null;

	const elements = elementSources.map((source) =>
		source === ''
			? ''
			: arrayLiteralElementSource(
					source,
					eventParameters,
					graphReads,
					moduleImports,
					localNames,
				),
	);
	if (elements.some((source) => source === null)) return null;

	return formatArrayLiteralElements(elements as string[]);
}

function arrayLiteralElementSource(
	elementSource: string,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const source = elementSource.trim();
	if (source.startsWith('...')) {
		const value = supportedValueSource(
			source.slice(3).trim(),
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (!value) return null;

		return `...${value}`;
	}

	return supportedValueSource(source, eventParameters, graphReads, moduleImports, localNames);
}

function objectLiteralValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const innerSource = objectLiteralInnerSource(valueSource);
	if (innerSource === null) return null;

	if (innerSource === '') return '{}';

	const propertySources = splitTopLevelCommaSeparatedSources(innerSource);
	if (!propertySources) return null;

	const properties = propertySources.map((source) =>
		objectLiteralPropertySource(source, eventParameters, graphReads, moduleImports, localNames),
	);
	if (properties.some((source) => source === null)) return null;

	return `{ ${(properties as string[]).join(', ')} }`;
}

function objectLiteralPropertySource(
	propertySource: string,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const source = propertySource.trim();
	if (!source) return null;
	if (source.startsWith('...')) {
		const spreadSource = source.slice(3).trim();
		if (!spreadSource) return null;

		const value = supportedValueSource(
			spreadSource,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (!value) return null;

		return `...${value}`;
	}

	const colonIndex = topLevelObjectPropertyColonIndex(source);
	if (colonIndex === -1) {
		if (!isIdentifierObjectKey(source)) return null;

		const value = supportedValueSource(
			source,
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (!value) return null;

		return `${source}: ${value}`;
	}

	const key = source.slice(0, colonIndex).trim();
	const valueSource = source.slice(colonIndex + 1).trim();
	if (!valueSource) return null;

	const emittedKey = objectLiteralKeySource(
		key,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!emittedKey) return null;

	const value = supportedValueSource(
		valueSource,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!value) return null;

	return `${emittedKey}: ${value}`;
}

function staticCallValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const call = staticCallSourceParts(valueSource);
	if (!call) return null;
	if (!canEmitStaticCallCallee(call.callee, moduleImports)) return null;

	if (call.argumentsSource === '') return `${call.callee}()`;

	const argumentSources = splitTopLevelCommaSeparatedSources(call.argumentsSource);
	if (!argumentSources) return null;

	const argumentsList = argumentSources.map((source) =>
		supportedValueSource(source, eventParameters, graphReads, moduleImports, localNames),
	);
	if (argumentsList.some((source) => source === null)) return null;

	return `${call.callee}(${(argumentsList as string[]).join(', ')})`;
}

type StaticCallSourceParts = {
	readonly callee: string;
	readonly argumentsSource: string;
};

function objectLiteralKeySource(
	keySource: string,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	if (isSupportedObjectLiteralKey(keySource)) return keySource;

	const computedKeySource = arrayLiteralInnerSource(keySource);
	if (computedKeySource === null || computedKeySource === '') return null;

	const value = supportedValueSource(
		computedKeySource,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!value) return null;

	return `[${value}]`;
}

function parenthesizedValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const innerSource = parenthesizedInnerSource(valueSource);
	if (!innerSource) return null;

	const inner = supportedValueSource(
		innerSource,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!inner) return null;

	return `(${inner})`;
}

function unaryValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const source = valueSource?.trim();
	if (!source) return null;

	const operator = unaryValueOperator(source);
	if (!operator) return null;

	const inner = supportedValueSource(
		source.slice(operator.length).trim(),
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!inner) return null;

	return `${operator}${inner}`;
}

function unaryValueOperator(source: string): '!' | '+' | '-' | '~' | null {
	const operator = source[0];
	const next = source[1];

	if (operator === '!' && next !== '=') return '!';
	if (operator === '+' && next !== '+') return '+';
	if (operator === '-' && next !== '-') return '-';
	if (operator === '~') return '~';

	return null;
}

function conditionalValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const conditional = splitTopLevelConditionalValueSource(valueSource);
	if (!conditional) return null;

	const test = supportedValueSource(
		conditional.test,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	const consequent = supportedValueSource(
		conditional.consequent,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	const alternate = supportedValueSource(
		conditional.alternate,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!test || !consequent || !alternate) return null;

	return `${test} ? ${consequent} : ${alternate}`;
}

type ConditionalValueSourceParts = {
	readonly test: string;
	readonly consequent: string;
	readonly alternate: string;
};

function binaryValueSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const binary = splitTopLevelBinaryValueSource(valueSource);
	if (!binary) return null;

	const left = supportedValueSource(
		binary.left,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	const right = supportedValueSource(
		binary.right,
		eventParameters,
		graphReads,
		moduleImports,
		localNames,
	);
	if (!left || !right) return null;

	return `${left} ${binary.operator} ${right}`;
}

type BinaryValueSourceParts = {
	readonly left: string;
	readonly operator: string;
	readonly right: string;
};

const binaryValueOperators = [
	'===',
	'!==',
	'>>>',
	'<<',
	'>>',
	'>=',
	'<=',
	'&&',
	'||',
	'??',
	'**',
	'==',
	'!=',
	'>',
	'<',
	'+',
	'-',
	'*',
	'/',
	'%',
	'&',
	'|',
	'^',
] as const;

function splitTopLevelBinaryValueSource(
	valueSource: string | undefined,
): BinaryValueSourceParts | null {
	const source = valueSource?.trim();
	if (!source) return null;

	const operators = topLevelBinaryOperators(source);
	if (operators.length === 0) return null;

	const operator = splitOperator(operators);
	const left = source.slice(0, operator.index).trim();
	const right = source.slice(operator.index + operator.operator.length).trim();
	if (!left || !right) return null;

	return { left, operator: operator.operator, right };
}

function splitTopLevelConditionalValueSource(
	valueSource: string | undefined,
): ConditionalValueSourceParts | null {
	const source = valueSource?.trim();
	if (!source) return null;

	const questionIndex = topLevelConditionalQuestionIndex(source);
	if (questionIndex === -1) return null;

	const colonIndex = topLevelConditionalColonIndex(source, questionIndex + 1);
	if (colonIndex === -1) return null;

	const test = source.slice(0, questionIndex).trim();
	const consequent = source.slice(questionIndex + 1, colonIndex).trim();
	const alternate = source.slice(colonIndex + 1).trim();
	if (!test || !consequent || !alternate) return null;

	return { test, consequent, alternate };
}

function splitOperator(
	operators: ReadonlyArray<{ readonly index: number; readonly operator: string }>,
): { readonly index: number; readonly operator: string } {
	return operators.reduce((selected, candidate) => {
		const selectedPrecedence = binaryValueOperatorPrecedence(selected.operator);
		const candidatePrecedence = binaryValueOperatorPrecedence(candidate.operator);
		if (candidatePrecedence < selectedPrecedence) return candidate;
		if (candidatePrecedence === selectedPrecedence && candidate.index > selected.index) {
			return candidate;
		}
		return selected;
	});
}

function binaryValueOperatorPrecedence(operator: string): number {
	if (operator === '||' || operator === '??') return 1;
	if (operator === '&&') return 2;
	if (operator === '|' || operator === '^' || operator === '&') return 3;
	if (operator === '==' || operator === '!=' || operator === '===' || operator === '!==') {
		return 4;
	}
	if (operator === '<' || operator === '<=' || operator === '>' || operator === '>=') {
		return 5;
	}
	if (operator === '<<' || operator === '>>' || operator === '>>>') return 6;
	if (operator === '+' || operator === '-') return 7;
	if (operator === '*' || operator === '/' || operator === '%') return 8;
	if (operator === '**') return 9;
	return 10;
}

function topLevelBinaryOperators(
	source: string,
): ReadonlyArray<{ readonly index: number; readonly operator: string }> {
	const operators: { index: number; operator: string }[] = [];
	let quote: string | null = null;
	let escaped = false;
	let depth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth !== 0) continue;

		const operator = binaryValueOperators.find((item) => source.startsWith(item, index));
		if (!operator) continue;
		if (isUnaryBoundary(source, index)) continue;

		operators.push({ index, operator });
		index += operator.length - 1;
	}

	return operators;
}

function topLevelConditionalQuestionIndex(source: string): number {
	return topLevelConditionalTokenIndex(source, 0, '?');
}

function topLevelConditionalColonIndex(source: string, startIndex: number): number {
	return topLevelConditionalTokenIndex(source, startIndex, ':');
}

function topLevelConditionalTokenIndex(
	source: string,
	startIndex: number,
	token: '?' | ':',
): number {
	let quote: string | null = null;
	let escaped = false;
	let depth = 0;
	let nestedConditionals = 0;

	for (let index = startIndex; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth !== 0) continue;
		if (char === '?' && (source[index - 1] === '?' || source[index + 1] === '?')) {
			continue;
		}
		if (token === '?' && char === '?') return index;
		if (token === ':' && char === '?') {
			nestedConditionals++;
			continue;
		}
		if (token === ':' && char === ':') {
			if (nestedConditionals === 0) return index;
			nestedConditionals--;
		}
	}

	return -1;
}

function isUnaryBoundary(source: string, index: number): boolean {
	const operator = source[index];
	if (operator !== '+' && operator !== '-') return false;
	if (index === 0) return true;

	const previous = previousNonWhitespace(source, index);
	return (
		previous === undefined ||
		previous === '(' ||
		binaryValueOperators.includes(previous as never)
	);
}

function previousNonWhitespace(source: string, index: number): string | undefined {
	for (let previousIndex = index - 1; previousIndex >= 0; previousIndex--) {
		const char = source[previousIndex];
		if (!/\s/.test(char)) return char;
	}

	return undefined;
}

function arrayLiteralInnerSource(valueSource: string | undefined): string | null {
	const source = valueSource?.trim();
	if (!source?.startsWith('[') || !source.endsWith(']')) return null;

	let quote: string | null = null;
	let escaped = false;
	let depth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '[') depth++;
		if (char === ']') depth--;
		if (depth === 0 && index < source.length - 1) return null;
	}

	if (depth !== 0) return null;
	return source.slice(1, -1).trim();
}

function objectLiteralInnerSource(valueSource: string | undefined): string | null {
	const source = valueSource?.trim();
	if (!source?.startsWith('{') || !source.endsWith('}')) return null;

	let quote: string | null = null;
	let escaped = false;
	let depth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '{') depth++;
		if (char === '}') depth--;
		if (depth === 0 && index < source.length - 1) return null;
	}

	if (depth !== 0) return null;
	return source.slice(1, -1).trim();
}

function staticCallSourceParts(valueSource: string | undefined): StaticCallSourceParts | null {
	const source = valueSource?.trim();
	if (!source?.endsWith(')')) return null;

	let quote: string | null = null;
	let escaped = false;
	let depth = 0;
	let callStart = -1;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			if (depth === 0 && char === '(' && callStart === -1) {
				callStart = index;
			}
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth--;
			if (depth < 0) return null;
			if (depth === 0 && callStart !== -1) {
				if (char !== ')' || index !== source.length - 1) return null;
				break;
			}
			continue;
		}
	}

	if (depth !== 0 || callStart === -1) return null;

	const callee = source.slice(0, callStart).trim();
	if (!isSupportedStaticCallCallee(callee)) return null;

	return {
		callee,
		argumentsSource: source.slice(callStart + 1, -1).trim(),
	};
}

function topLevelObjectPropertyColonIndex(source: string): number {
	let quote: string | null = null;
	let escaped = false;
	let depth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth === 0 && char === ':') return index;
	}

	return -1;
}

function isSupportedObjectLiteralKey(source: string): boolean {
	return (
		isIdentifierObjectKey(source) ||
		/^(['"])(?:\\.|(?!\1).)*\1$/.test(source) ||
		/^(?:\d+|\d*\.\d+)$/.test(source)
	);
}

function isIdentifierObjectKey(source: string): boolean {
	return /^[$A-Z_a-z][$0-9A-Z_a-z]*$/.test(source);
}

function isSupportedStaticCallCallee(source: string): boolean {
	return /^[$A-Z_a-z][$0-9A-Z_a-z]*(?:\.[$A-Z_a-z][$0-9A-Z_a-z]*)*$/.test(source);
}

function canEmitStaticCallCallee(
	callee: string,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): boolean {
	const [rootName] = callee.split('.');
	if (!rootName) return false;
	if (moduleImports.some((moduleImport) => moduleImport.localName === rootName)) return true;
	if (callee.includes('.')) return knownGlobalStaticCallRoots.has(rootName);

	return false;
}

const knownGlobalStaticCallRoots = new Set([
	'Array',
	'Boolean',
	'Date',
	'JSON',
	'Math',
	'Number',
	'Object',
	'String',
]);

function splitTopLevelCommaSeparatedSources(source: string): ReadonlyArray<string> | null {
	const elements: string[] = [];
	let quote: string | null = null;
	let escaped = false;
	let depth = 0;
	let startIndex = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth !== 0 || char !== ',') continue;

		const element = source.slice(startIndex, index).trim();
		if (!element) return null;
		elements.push(element);
		startIndex = index + 1;
	}

	const lastElement = source.slice(startIndex).trim();
	if (!lastElement) return null;
	elements.push(lastElement);

	return elements;
}

function splitTopLevelArrayElementSources(source: string): ReadonlyArray<string> | null {
	if (source === '') return [];

	const elements: string[] = [];
	let quote: string | null = null;
	let escaped = false;
	let depth = 0;
	let startIndex = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth++;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth !== 0 || char !== ',') continue;

		elements.push(source.slice(startIndex, index).trim());
		startIndex = index + 1;
	}

	const lastElement = source.slice(startIndex).trim();
	if (lastElement || !source.endsWith(',')) {
		elements.push(lastElement);
	}

	return elements;
}

function formatArrayLiteralElements(elements: ReadonlyArray<string>): string {
	if (elements.length === 0) return '[]';

	let source = '';
	for (let index = 0; index < elements.length; index++) {
		if (index > 0) source += ', ';
		source += elements[index];
	}

	if (elements[elements.length - 1] === '') source += ',';

	return `[${source}]`;
}

function parenthesizedInnerSource(valueSource: string | undefined): string | null {
	const source = valueSource?.trim();
	if (!source?.startsWith('(') || !source.endsWith(')')) return null;

	let quote: string | null = null;
	let escaped = false;
	let depth = 0;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(') depth++;
		if (char === ')') depth--;
		if (depth === 0 && index < source.length - 1) return null;
	}

	if (depth !== 0) return null;
	return source.slice(1, -1).trim() || null;
}

function eventFieldAssignmentSource(
	valueSource: string | undefined,
	eventParameters: ReadonlyArray<string>,
): string | null {
	const eventParameter = eventParameters[0];
	const source = valueSource?.trim();
	if (!eventParameter || !source) return null;
	if (source === eventParameter) return 'context.event';
	if (!source.startsWith(`${eventParameter}.`)) return null;

	const fields = source
		.slice(eventParameter.length + 1)
		.split('.')
		.filter(Boolean);
	if (fields.length === 0) return null;
	if (fields.some((field) => !/^[$A-Z_a-z][$0-9A-Z_a-z]*$/.test(field))) return null;
	if (fields[0] === 'currentTarget') {
		const currentTargetFields = fields.slice(1);
		return currentTargetFields.length === 0
			? 'context.element'
			: `context.element?.${currentTargetFields.join('?.')}`;
	}

	return `context.event?.${fields.join('?.')}`;
}

function supportedArgumentSources(
	argumentSources: ReadonlyArray<string>,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): ReadonlyArray<string> | null {
	const supported = argumentSources.map((source) =>
		supportedArgumentSource(source, eventParameters, graphReads, moduleImports, localNames),
	);
	if (supported.some((source) => source === null)) return null;

	return supported as string[];
}

function supportedArgumentSource(
	source: string,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string | null {
	const trimmedSource = source.trim();
	if (trimmedSource.startsWith('...')) {
		const spreadValue = supportedValueSource(
			trimmedSource.slice(3).trim(),
			eventParameters,
			graphReads,
			moduleImports,
			localNames,
		);
		if (!spreadValue) return null;

		return `...${spreadValue}`;
	}

	return supportedValueSource(source, eventParameters, graphReads, moduleImports, localNames);
}

function compoundAssignmentOperator(assignmentOperator: string): string | null {
	if (assignmentOperator === '**=') return '**';
	if (assignmentOperator === '&&=') return '&&';
	if (assignmentOperator === '||=') return '||';
	if (assignmentOperator === '??=') return '??';
	if (/^(?:[+\-*/%&|^]|<<|>>|>>>)=$/.test(assignmentOperator)) {
		return assignmentOperator.slice(0, -1);
	}
	return null;
}

function graphReadSource(
	valueSource: string | undefined,
	graphReads: ReadonlyArray<LoweredStateRead>,
): string | null {
	const source = valueSource?.trim();
	if (!source) return null;

	const graphRead = graphReads.find((read) => read.source === source);
	if (!graphRead) return null;

	return graphReadCallSource('context.graph.read', graphRead.graphNodeId, graphRead.path);
}

function literalValueSource(valueSource: string | undefined): string | null {
	const source = valueSource?.trim();
	if (!source) return null;

	if (/^(?:true|false|null|undefined)$/.test(source)) return source;
	if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(source)) return source;
	if (/^(['"])(?:\\.|(?!\1).)*\1$/.test(source)) return source;

	return null;
}

function graphReadCallSource(
	callee: string,
	graphNodeId: string,
	path: ReadonlyArray<string>,
): string {
	return path.length === 0
		? `${callee}(${JSON.stringify(graphNodeId)})`
		: `${callee}(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`;
}

function uniqueModuleImports(
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): ReadonlyArray<SemanticModuleImport> {
	const seen = new Set<string>();
	const unique: SemanticModuleImport[] = [];

	for (const moduleImport of moduleImports) {
		const key = [
			moduleImport.kind,
			moduleImport.localName,
			moduleImport.importedName ?? '',
			moduleImport.source,
		].join('\0');
		if (seen.has(key)) continue;

		seen.add(key);
		unique.push(moduleImport);
	}

	return unique;
}

function sourceReferencesIdentifier(source: string, name: string): boolean {
	for (
		let index = source.indexOf(name);
		index !== -1;
		index = source.indexOf(name, index + name.length)
	) {
		const before = source[index - 1] ?? '';
		const after = source[index + name.length] ?? '';
		if (isIdentifierChar(before)) continue;
		if (before === '.' && source.slice(index - 3, index) !== '...') continue;
		if (isIdentifierChar(after)) continue;

		return true;
	}

	return false;
}

function isIdentifierChar(char: string): boolean {
	return /[$0-9A-Z_a-z]/.test(char);
}

function emitModuleImport(moduleImport: SemanticModuleImport): string {
	const source = JSON.stringify(moduleImport.source);
	if (moduleImport.kind === 'default') {
		return `import ${moduleImport.localName} from ${source};`;
	}
	if (moduleImport.kind === 'namespace') {
		return `import * as ${moduleImport.localName} from ${source};`;
	}
	if (moduleImport.importedName === moduleImport.localName) {
		return `import { ${moduleImport.localName} } from ${source};`;
	}
	return `import { ${moduleImport.importedName} as ${moduleImport.localName} } from ${source};`;
}

// Element-handle method calls run against the runtime-resolved host element.
// Arguments stay restricted to literals and event parameters; anything richer
// keeps the current unsupported behavior until capture analysis owns it.
function emitElementHandleCall(
	call: {
		readonly handleName: string;
		readonly method: string;
		readonly argumentSources: ReadonlyArray<string>;
	},
	parameters: ReadonlyArray<string>,
): string[] {
	const literalPattern =
		/^(?:'[^']*'|"[^"]*"|`[^`]*`|-?\d+(?:\.\d+)?|true|false|null|undefined)$/;
	const supported = call.argumentSources.every(
		(argument) => literalPattern.test(argument) || parameters.includes(argument),
	);
	if (!supported) return [];
	return [
		`\tcontext.getElementHandle(${JSON.stringify(call.handleName)})?.${call.method}(${call.argumentSources.join(', ')});`,
	];
}

// ---------------------------------------------------------------------------
// Arm emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 3 —
// the two arm emitters, taken together because they emit the same module shape
// over different arm data. This band builds nodes and prints them through
// `emit-codegen.ts`; it calls nothing in the string-scanner band
// (`topLevelBinaryOperators` through `sourceReferencesIdentifier`), which
// invariant 5 keeps alive until the stage's final unit but which a migrated site
// may not reach. Neither arm emitter reached that band on the text path either:
// their only inputs are render data and `JSON.stringify`.
//
// It is not yet the wired path. `emitBranchUpdateModule` and
// `emitAsyncBoundaryUpdateModule` above still produce the bytes the compiler
// ships; `test/emit-arm-modules.test.ts` runs both paths over the same arms and
// records where the printed bytes differ from the assembled ones. Invariant 2
// makes the swap an owner-approved step, not a side effect of this unit.
//
// These two sites are assembled, not extracted: unlike every emitter migrated
// before them, not one character of their output comes from authored text. The
// arm HTML is render data, the selector and escaper helpers are the emitter's
// own fixed code, and the graph reads are built from ids. Two consequences the
// spec's map invariant does not anticipate, recorded here rather than papered
// over:
//
//   - No printed node carries a span, so the emitted map has no segments. The
//     DOM-binding band above reached the same state for the same reason; here it
//     is total rather than near-total, since there is no authored expression
//     behind the module at all.
//   - `source` is therefore not recoverable from the symbol. `branch-update`
//     carries `testSource`, but that text is not what the module emits — the
//     emitted test is rebuilt from `testRead` ids — and `async-boundary-update`
//     carries no source field whatsoever. Rather than pass a misleading
//     substitute, both inputs take `authoredSource` explicitly: the authored
//     module's own text, which is what `sourceFileName` already names and what
//     the map's `sourcesContent` should therefore hold.
//
// The non-null-map guard (invariant 3) still runs, and still passes, but at
// these two sites it proves less than it reads as: `yuku-codegen@0.9.0` returns
// a non-null map for an empty `source` too, so the guard cannot distinguish a
// module whose source was threaded through from one whose source is absent. The
// guard is kept because invariant 3 requires it and because it does catch a
// print site that forgot `sourceMap` entirely.
// ---------------------------------------------------------------------------

export type BranchUpdateEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'branch-update' }>;
	readonly arms: PublicRenderPlanBranchArms;
	/** The authored file the branch site was compiled from; names the map. */
	readonly sourceFileName: string;
	/**
	 * The authored module's text, for the map's `sourcesContent`.
	 *
	 * Passed rather than derived: this site assembles its whole module, so no
	 * field on the symbol holds text the emitted module is made of.
	 */
	readonly authoredSource: string;
};

/**
 * Build the print input for a branch-update module.
 *
 * Split from the print so a test can run the determinism helper (invariant 7)
 * over the same tree the emitter would print, without emission paying for three
 * prints and two reparses per symbol in a real build.
 */
export function buildBranchUpdateEmission(input: BranchUpdateEmissionInput): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const arms = input.arms;
	const testExpression = arms.testRead
		? graphReadCall({
				callee: 'context.graph.read',
				graphNodeId: arms.testRead.graphNodeId,
				path: arms.testRead.path,
			})
		: identifierNode('undefined');

	// Switch sites select by case value; if-sites select by truthiness. The text
	// path parenthesizes the truthiness test by hand; the printer derives the
	// parentheses `??` over a conditional actually needs.
	const armSelector = arms.armTests
		? callNode(identifierNode('marklessSelectSwitchArm'), [
				testExpression,
				jsonValueNode(arms.armTests),
			])
		: conditionalNode(testExpression, literalNode(0), literalNode(1));

	// Arm-scoped flips may carry repeat parts: rows rebuild from a live graph
	// read of the collection at flip time (still no component execution).
	const hasRepeatParts = arms.arms.some((arm) => arm.some((part) => 'repeat' in part));

	const body: EmissionNode[] = [
		constDeclarationNode('marklessBranchArms', jsonValueNode(arms.arms)),
		...(arms.armTests ? [switchArmSelectorFunctionNode()] : []),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				constDeclarationNode(
					'arm',
					logicalNode('??', memberChainNode('context.arm'), armSelector),
				),
				constDeclarationNode(
					'parts',
					logicalNode(
						'??',
						computedMemberNode(identifierNode('marklessBranchArms'), identifierNode('arm')),
						arrayNode([]),
					),
				),
				constDeclarationNode(
					'html',
					armPartsHtmlExpression('marklessBranchText', hasRepeatParts),
				),
				returnStatementNode(
					objectNode([shorthandPropertyNode('arm'), shorthandPropertyNode('html')]),
				),
			]),
		),
		armTextEscaperFunctionNode('marklessBranchText'),
		...(hasRepeatParts ? [branchRowsFunctionNode()] : []),
	];

	return {
		program: moduleProgramNode(body),
		source: input.authoredSource,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed branch-update module, with its source map (invariant 3). */
export function emitBranchUpdateModuleNodes(input: BranchUpdateEmissionInput): EmittedModule {
	return printEmittedModule(buildBranchUpdateEmission(input));
}

export type AsyncBoundaryUpdateEmissionInput = {
	readonly symbol: Extract<PlannedSymbol, { readonly kind: 'async-boundary-update' }>;
	readonly arms: PublicRenderPlanAsyncBoundaryArms;
	/** The authored file the boundary was compiled from; names the map. */
	readonly sourceFileName: string;
	/** The authored module's text, for the map's `sourcesContent`. */
	readonly authoredSource: string;
};

/**
 * Build the print input for an async-boundary-update module.
 *
 * Split from the print for the same reason `buildBranchUpdateEmission` is: the
 * determinism helper (invariant 7) needs the tree, and a real build must not pay
 * for three prints and two reparses per symbol.
 */
export function buildAsyncBoundaryUpdateEmission(
	input: AsyncBoundaryUpdateEmissionInput,
): EmissionPrintInput {
	const exportName = symbolExportName(input.symbol.id);
	const site: EmissionSite = {
		phase: 'payload',
		passId: 'symbol-modules',
		sourceFileName: input.sourceFileName,
		symbolId: input.symbol.id,
	};

	const body: EmissionNode[] = [
		constDeclarationNode('marklessBoundaryArms', jsonValueNode(input.arms.arms)),
		exportNamedDeclarationNode(
			functionDeclarationNode(exportName, ['context'], [
				// The runtime passes the settled status; arm 1 is @catch, arm 0 is @try.
				constDeclarationNode(
					'arm',
					conditionalNode(
						binaryNode('===', memberChainNode('context.status'), literalNode('rejected')),
						literalNode(1),
						literalNode(0),
					),
				),
				constDeclarationNode(
					'parts',
					logicalNode(
						'??',
						computedMemberNode(identifierNode('marklessBoundaryArms'), identifierNode('arm')),
						arrayNode([]),
					),
				),
				constDeclarationNode('html', armPartsHtmlExpression('marklessBoundaryText', false)),
				returnStatementNode(
					objectNode([shorthandPropertyNode('arm'), shorthandPropertyNode('html')]),
				),
			]),
		),
		armTextEscaperFunctionNode('marklessBoundaryText'),
	];

	return {
		program: moduleProgramNode(body),
		source: input.authoredSource,
		outputFileName: `${exportName}.js`,
		site,
	};
}

/** The printed async-boundary-update module, with its source map (invariant 3). */
export function emitAsyncBoundaryUpdateModuleNodes(
	input: AsyncBoundaryUpdateEmissionInput,
): EmittedModule {
	return printEmittedModule(buildAsyncBoundaryUpdateEmission(input));
}

/**
 * `parts.map((part) => ...).join("")` — the arm-to-HTML expression both arm
 * emitters build, differing only in which escaper they call and whether they
 * handle repeat parts.
 *
 * Shared between the two bands rather than written twice because the two text
 * paths are already character-identical apart from the escaper name; a shared
 * builder means a future change cannot drift them apart silently.
 */
function armPartsHtmlExpression(escaperName: string, hasRepeatParts: boolean): EmissionNode {
	const escapedRead = callNode(identifierNode(escaperName), [
		callNode(memberChainNode('context.graph.read'), [
			memberChainNode('part.read.graphNodeId'),
			memberChainNode('part.read.path'),
		]),
	]);

	const nonTextPart = hasRepeatParts
		? conditionalNode(
				binaryNode('!==', memberChainNode('part.repeat'), identifierNode('undefined')),
				callNode(identifierNode('marklessBranchRows'), [
					memberChainNode('part.repeat'),
					memberChainNode('context.graph'),
				]),
				escapedRead,
			)
		: escapedRead;

	return callNode(
		memberNode(
			callNode(memberChainNode('parts.map'), [
				arrowFunctionNode(
					['part'],
					conditionalNode(
						binaryNode('!==', memberChainNode('part.text'), identifierNode('undefined')),
						memberChainNode('part.text'),
						nonTextPart,
					),
				),
			]),
			'join',
		),
		[literalNode('')],
	);
}

/**
 * The three HTML replacements the arm escapers apply, in the order the text path
 * chains them. Order is emitted bytes, so it is data rather than three literal
 * call sites.
 */
const ARM_TEXT_ESCAPES: ReadonlyArray<readonly [string, string]> = [
	['&', '&amp;'],
	['<', '&lt;'],
	['>', '&gt;'],
];

/**
 * `function <name>(value) { return String(value == null ? "" : value).replaceAll(...)...; }`
 *
 * The two emitters give this function two different names —
 * `marklessBranchText` and `marklessBoundaryText` — with identical bodies, so
 * the name is a parameter and the body is built once.
 */
function armTextEscaperFunctionNode(name: string): EmissionNode {
	const coerced: EmissionNode = callNode(identifierNode('String'), [
		conditionalNode(
			binaryNode('==', identifierNode('value'), literalNode(null)),
			literalNode(''),
			identifierNode('value'),
		),
	]);
	const escaped = ARM_TEXT_ESCAPES.reduce<EmissionNode>(
		(node, [from, to]) =>
			callNode(memberNode(node, 'replaceAll'), [literalNode(from), literalNode(to)]),
		coerced,
	);

	return functionDeclarationNode(name, ['value'], [returnStatementNode(escaped)]);
}

/**
 * `function marklessSelectSwitchArm(value, tests) { ... }` — the switch-site arm
 * picker, emitted only when the site carries `armTests`.
 *
 * `tests[index]` is built twice rather than once and shared: a node reused at
 * two positions is one object in two places in the tree, which the printer
 * happens to tolerate but which makes any later per-node bookkeeping (spans,
 * comments, map segments) ambiguous.
 */
function switchArmSelectorFunctionNode(): EmissionNode {
	const testAtIndex = (): EmissionNode =>
		computedMemberNode(identifierNode('tests'), identifierNode('index'));

	return functionDeclarationNode('marklessSelectSwitchArm', ['value', 'tests'], [
		forStatementNode(
			letDeclarationNode('index', literalNode(0)),
			binaryNode('<', identifierNode('index'), memberChainNode('tests.length')),
			postfixUpdateNode('++', identifierNode('index')),
			[
				ifStatementNode(
					logicalNode(
						'&&',
						binaryNode('!==', testAtIndex(), literalNode(null)),
						binaryNode('===', identifierNode('value'), testAtIndex()),
					),
					returnStatementNode(identifierNode('index')),
				),
			],
		),
		returnStatementNode(callNode(memberChainNode('tests.indexOf'), [literalNode(null)])),
	]);
}

/**
 * `function marklessBranchRows(repeat, graph) { ... }` — the row rebuilder,
 * emitted only when an arm carries repeat parts.
 *
 * A row part is one of three shapes: static text, an item-relative path walked
 * against the row's own item, or a graph read. The walk is a `reduce` that
 * short-circuits on a nullish intermediate, exactly as the text path writes it.
 */
function branchRowsFunctionNode(): EmissionNode {
	const rowExpression = conditionalNode(
		binaryNode('!==', memberChainNode('row.text'), identifierNode('undefined')),
		memberChainNode('row.text'),
		conditionalNode(
			binaryNode('!==', memberChainNode('row.itemPath'), identifierNode('undefined')),
			callNode(identifierNode('marklessBranchText'), [
				callNode(memberChainNode('row.itemPath.reduce'), [
					arrowFunctionNode(
						['value', 'key'],
						conditionalNode(
							binaryNode('==', identifierNode('value'), literalNode(null)),
							identifierNode('value'),
							computedMemberNode(identifierNode('value'), identifierNode('key')),
						),
					),
					identifierNode('item'),
				]),
			]),
			callNode(identifierNode('marklessBranchText'), [
				callNode(memberChainNode('graph.read'), [
					memberChainNode('row.read.graphNodeId'),
					memberChainNode('row.read.path'),
				]),
			]),
		),
	);

	const rowHtml = callNode(
		memberNode(
			callNode(memberChainNode('repeat.rowParts.map'), [
				arrowFunctionNode(['row'], rowExpression),
			]),
			'join',
		),
		[literalNode('')],
	);

	return functionDeclarationNode('marklessBranchRows', ['repeat', 'graph'], [
		constDeclarationNode(
			'items',
			callNode(memberChainNode('graph.read'), [
				memberChainNode('repeat.read.graphNodeId'),
				memberChainNode('repeat.read.path'),
			]),
		),
		ifStatementNode(
			unaryNode('!', callNode(memberChainNode('Array.isArray'), [identifierNode('items')])),
			returnStatementNode(literalNode('')),
		),
		returnStatementNode(
			callNode(
				memberNode(
					callNode(memberChainNode('items.map'), [arrowFunctionNode(['item'], rowHtml)]),
					'join',
				),
				[literalNode('')],
			),
		),
	]);
}

// ---------------------------------------------------------------------------
// Value-expression emission through the AST printer.
//
// `specs/framework/14-emission-codegen-migration.md`, stage 1, sketch item 4 —
// `emitSymbolModule`, the general path, together with the value-source cluster
// it reaches: `supportedValueSource` through `binaryValueOperatorPrecedence`
// (the spec measures that cluster at lines 1552-2107 of the 2,789-line
// baseline; it sits at `supportedValueSource` .. `binaryValueOperatorPrecedence`
// in this file today).
//
// The cluster's whole job is to re-derive, from characters, facts a parser
// already knows: where a top-level operator is, which colon separates an object
// key from its value, which comma is a real separator and which one is inside a
// nested literal or a string. This band asks the parser instead. One parse of
// the authored value source, one recursive walk that keeps the same support
// envelope, and the printer supplies precedence, parentheses, and quoting.
//
// It is not the wired path. `supportedValueSource` and `eventWriteValueSource`
// above still produce the bytes the compiler ships;
// `test/emit-symbol-module.test.ts` runs both over the same value sources and
// records exactly where the printed text differs from the spliced text.
// Invariant 5 keeps the scanners alive until stage 1's final unit, and this band
// calls none of them: the four predicates it needs (`isIdentifierObjectKey`'s
// regex, `isSupportedObjectLiteralKey`'s three regexes,
// `isSupportedStaticCallCallee`'s dotted-path regex, and the
// `knownGlobalStaticCallRoots` set) are re-expressed inside the band rather
// than shared, exactly as the async-runner band re-expresses its two.
// ---------------------------------------------------------------------------

/** `foo` — the identifier shape `isIdentifierObjectKey` tests for. */
const VALUE_IDENTIFIER_PATTERN = /^[$A-Z_a-z][$0-9A-Z_a-z]*$/;

/** `a.b.c` — the callee shape `isSupportedStaticCallCallee` tests for. */
const VALUE_STATIC_CALLEE_PATTERN = /^[$A-Z_a-z][$0-9A-Z_a-z]*(?:\.[$A-Z_a-z][$0-9A-Z_a-z]*)*$/;

/** The band-local twin of `knownGlobalStaticCallRoots`. */
const VALUE_GLOBAL_CALL_ROOTS: ReadonlySet<string> = new Set([
	'Array',
	'Boolean',
	'Date',
	'JSON',
	'Math',
	'Number',
	'Object',
	'String',
]);

/**
 * The operators `binaryValueOperators` lists, as a set.
 *
 * Membership is the whole of what the AST path needs from that table: the
 * precedence half (`binaryValueOperatorPrecedence`, `splitOperator`) exists only
 * to find the split point in a flat string, which a parse already gives, and the
 * re-parenthesization half is the printer's job under `preserveParens: false`.
 */
const VALUE_BINARY_OPERATORS: ReadonlySet<string> = new Set([
	'===',
	'!==',
	'>>>',
	'<<',
	'>>',
	'>=',
	'<=',
	'&&',
	'||',
	'??',
	'**',
	'==',
	'!=',
	'>',
	'<',
	'+',
	'-',
	'*',
	'/',
	'%',
	'&',
	'|',
	'^',
]);

/** The prefix operators `unaryValueOperator` accepts. */
const VALUE_UNARY_OPERATORS: ReadonlySet<string> = new Set(['!', '+', '-', '~']);

export type ValueExpressionEmissionInput = {
	/** The authored expression text, as the lowering recorded it. */
	readonly valueSource: string | undefined;
	readonly eventParameters: ReadonlyArray<string>;
	readonly graphReads: ReadonlyArray<LoweredStateRead>;
	readonly moduleImports: ReadonlyArray<SemanticModuleImport>;
	readonly localNames: ReadonlySet<string>;
	/** The authored file the value came from; names the map at the print site. */
	readonly sourceFileName: string;
};

export type ValueExpressionEmission = {
	readonly node: EmissionNode;
	/**
	 * The projected text every node in `node` carries an offset into.
	 *
	 * A print site has to hand this to `printEmittedModule` as its `source`, or
	 * the map attributes the value's positions to a different string.
	 */
	readonly source: string;
};

/**
 * The AST twin of `supportedValueSource`.
 *
 * Same envelope, decided from a tree instead of from characters: `null` for any
 * shape the string path also refuses, so a caller's supported/unsupported
 * branch does not move when the swap lands.
 */
export function buildValueExpressionEmission(
	input: ValueExpressionEmissionInput,
): ValueExpressionEmission | null {
	const projection = valueExpressionProjection(input.valueSource, input.sourceFileName);
	if (!projection) return null;

	const node = valueExpressionNode(projection.expression, projection.source, input);
	return node ? { node, source: projection.source } : null;
}

/**
 * The AST twin of `eventWriteValueSource`: the supported envelope first, then
 * the identifier-rewrite fallback for everything else.
 *
 * The fallback is where the text path is least defensible. `replaceIdentifierPath`
 * matches on characters with only identifier-boundary guards, so it rewrites a
 * graph-read name that happens to appear inside a string literal, and it turns
 * an authored shorthand property `{ count }` into the syntactically invalid
 * `{ context.locals?.count }`. Rewriting by node identity (invariant 6) cannot do
 * either: a string literal is not an identifier node, and a shorthand property
 * is expanded to `count: <rewritten>` because that is what the tree says it is.
 * Both divergences are recorded in the parity test rather than hidden here.
 */
export function buildEventWriteValueEmission(
	input: ValueExpressionEmissionInput,
): ValueExpressionEmission | null {
	const supported = buildValueExpressionEmission(input);
	if (supported) return supported;

	const projection = valueExpressionProjection(input.valueSource, input.sourceFileName);
	if (!projection) return null;

	return {
		node: rewriteGraphReadsAndLocals(projection.expression, projection.source, input),
		source: projection.source,
	};
}

type ValueExpressionProjection = {
	/** The one text every node parsed here carries an offset into. */
	readonly source: string;
	readonly expression: AnyNode;
};

/**
 * Parse one authored value expression, once.
 *
 * The expression is parenthesized so it parses as an expression statement in
 * every authored form — an object literal at statement start would otherwise be
 * a block, and a string literal would be a directive. `preserveParens: false`
 * then drops the wrapper, and the printer re-derives whatever parentheses the
 * expression actually needs in the position it lands in.
 */
function valueExpressionProjection(
	valueSource: string | undefined,
	filename: string,
): ValueExpressionProjection | null {
	const trimmed = valueSource?.trim();
	if (!trimmed) return null;

	const source = `(${trimmed});`;
	const { program, errors } = parseEmissionSource(source, filename, 'ts');
	if (errors.length > 0) return null;

	const statements = asNodes((program as unknown as AnyNode).body);
	if (statements.length !== 1) return null;

	const only = statements[0];
	if (!only || only.type !== 'ExpressionStatement' || !isNode(only.expression)) return null;

	return { source, expression: only.expression };
}

/** The authored text a node spans, trimmed — the string the scanners compared. */
function valueNodeText(node: AnyNode, source: string): string {
	const { start, end } = node;
	if (typeof start !== 'number' || typeof end !== 'number') return '';

	return source.slice(start, end).trim();
}

/**
 * One node of `supportedValueSource`, in the same order it tries its cases.
 *
 * The four leaf cases run first and on the node's own authored text, because
 * that is what the string path matches on: a graph read is recognized by its
 * recorded `source` string, not by its shape. Only when all four miss does the
 * walk descend into the node's structure.
 */
function valueExpressionNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const text = valueNodeText(node, source);
	if (!text) return null;

	const leaf =
		literalValueNode(node, text) ??
		eventFieldValueNode(text, input.eventParameters) ??
		graphReadValueNode(text, input.graphReads) ??
		localValueNode(text, input.localNames);
	if (leaf) return leaf;

	if (node.type === 'ArrayExpression') return arrayLiteralValueNode(node, source, input);
	if (node.type === 'ObjectExpression') return objectLiteralValueNode(node, source, input);
	if (node.type === 'CallExpression') return staticCallValueNode(node, source, input);
	if (node.type === 'UnaryExpression') return unaryValueNode(node, source, input);
	if (node.type === 'ConditionalExpression') return conditionalValueNode(node, source, input);
	if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
		return binaryValueNode(node, source, input);
	}

	return null;
}

/**
 * `literalValueSource`, node-shaped.
 *
 * The parsed node is returned as it stands rather than rebuilt: it carries its
 * authored `raw`, so the quote the author wrote survives under
 * `quotes: 'preserve'`, and it carries its span, so the map points at the
 * literal the author typed. `-1` is a unary node here and a matched literal in
 * the string path; returning the node verbatim keeps both readings the same
 * bytes.
 */
function literalValueNode(node: AnyNode, text: string): EmissionNode | null {
	if (/^(?:true|false|null|undefined)$/.test(text)) return node as unknown as EmissionNode;
	if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return node as unknown as EmissionNode;
	if (/^(['"])(?:\\.|(?!\1).)*\1$/.test(text)) return node as unknown as EmissionNode;

	return null;
}

/** `eventFieldAssignmentSource`, node-shaped. */
function eventFieldValueNode(
	text: string,
	eventParameters: ReadonlyArray<string>,
): EmissionNode | null {
	const eventParameter = eventParameters[0];
	if (!eventParameter) return null;
	if (text === eventParameter) return memberChainNode('context.event');
	if (!text.startsWith(`${eventParameter}.`)) return null;

	const fields = text
		.slice(eventParameter.length + 1)
		.split('.')
		.filter(Boolean);
	if (fields.length === 0) return null;
	if (fields.some((field) => !VALUE_IDENTIFIER_PATTERN.test(field))) return null;

	if (fields[0] === 'currentTarget') {
		const currentTargetFields = fields.slice(1);
		return currentTargetFields.length === 0
			? memberChainNode('context.element')
			: optionalPathNode(memberChainNode('context.element'), currentTargetFields);
	}

	return optionalPathNode(memberChainNode('context.event'), fields);
}

/** `graphReadSource`, node-shaped. */
function graphReadValueNode(
	text: string,
	graphReads: ReadonlyArray<LoweredStateRead>,
): EmissionNode | null {
	const graphRead = graphReads.find((read) => read.source === text);
	if (!graphRead) return null;

	return graphReadCall({
		callee: 'context.graph.read',
		graphNodeId: graphRead.graphNodeId,
		path: graphRead.path,
	});
}

/** `localValueSource`, node-shaped. */
function localValueNode(text: string, localNames: ReadonlySet<string>): EmissionNode | null {
	const path = staticDottedPath(text);
	if (!path || path.length < 2) return null;
	if (!localNames.has(path[0] ?? '')) return null;

	return optionalPathNode(memberChainNode('context.locals'), path);
}

/** The band-local twin of `staticSourcePath`, which reaches the scanner band. */
function staticDottedPath(text: string): ReadonlyArray<string> | null {
	const parts = text.split('.');
	if (parts.length === 0) return null;
	if (parts.some((part) => !VALUE_IDENTIFIER_PATTERN.test(part))) return null;

	return parts;
}

/**
 * `<base>?.<a>?.<b>` as one `ChainExpression`.
 *
 * ESTree puts a single `ChainExpression` around the whole optional chain rather
 * than one per link, so the links nest inside and only the outermost is wrapped.
 * `optionalMemberNode` in the foundation builds a one-link chain, which cannot
 * express the multi-field paths this band emits for `context.event?.a?.b`.
 */
function optionalPathNode(base: EmissionNode, path: ReadonlyArray<string>): EmissionNode {
	let expression = base;
	for (const part of path) {
		expression = {
			type: 'MemberExpression',
			object: expression,
			property: identifierNode(part),
			computed: false,
			optional: true,
		};
	}

	return { type: 'ChainExpression', expression };
}

/**
 * `arrayLiteralValueSource`, node-shaped.
 *
 * `splitTopLevelArrayElementSources` and `formatArrayLiteralElements` exist to
 * keep holes and a trailing comma straight while splitting characters; the
 * parser reports a hole as a `null` element, which is the same fact without the
 * bookkeeping.
 */
function arrayLiteralValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const elements: (EmissionNode | null)[] = [];

	for (const element of Array.isArray(node.elements) ? node.elements : []) {
		if (element === null || element === undefined) {
			elements.push(null);
			continue;
		}
		if (!isNode(element)) return null;

		if (element.type === 'SpreadElement') {
			if (!isNode(element.argument)) return null;
			const spread = valueExpressionNode(element.argument, source, input);
			if (!spread) return null;
			elements.push(spreadNode(spread));
			continue;
		}

		const value = valueExpressionNode(element, source, input);
		if (!value) return null;
		elements.push(value);
	}

	return { type: 'ArrayExpression', elements };
}

/** `objectLiteralValueSource` and `objectLiteralPropertySource`, node-shaped. */
function objectLiteralValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const properties: EmissionNode[] = [];

	for (const property of asNodes(node.properties)) {
		if (property.type === 'SpreadElement') {
			if (!isNode(property.argument)) return null;
			const spread = valueExpressionNode(property.argument, source, input);
			if (!spread) return null;
			properties.push(spreadNode(spread));
			continue;
		}

		if (property.type !== 'Property') return null;
		if (property.kind !== 'init' || property.method === true) return null;
		if (!isNode(property.key) || !isNode(property.value)) return null;

		const value = valueExpressionNode(property.value, source, input);
		if (!value) return null;

		const key = objectLiteralKeyNode(property, source, input);
		if (!key) return null;

		properties.push({
			type: 'Property',
			kind: 'init',
			method: false,
			shorthand: false,
			computed: property.computed === true,
			key,
			value,
		});
	}

	return { type: 'ObjectExpression', properties };
}

/**
 * `objectLiteralKeySource`, node-shaped.
 *
 * A computed key is a value in its own right and goes back through the walk. A
 * plain key is returned verbatim, and gated on the same three shapes
 * `isSupportedObjectLiteralKey` accepts, so a key form the string path refuses
 * (`1e3:`, `0x10:`) is still refused here.
 */
function objectLiteralKeyNode(
	property: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const key = property.key;
	if (!isNode(key)) return null;

	if (property.computed === true) return valueExpressionNode(key, source, input);

	const text = valueNodeText(key, source);
	if (!isSupportedObjectLiteralKeyText(text)) return null;

	return key as unknown as EmissionNode;
}

/** The band-local twin of `isSupportedObjectLiteralKey`. */
function isSupportedObjectLiteralKeyText(text: string): boolean {
	return (
		VALUE_IDENTIFIER_PATTERN.test(text) ||
		/^(['"])(?:\\.|(?!\1).)*\1$/.test(text) ||
		/^(?:\d+|\d*\.\d+)$/.test(text)
	);
}

/** `staticCallValueSource`, node-shaped. */
function staticCallValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	if (node.optional === true) return null;
	if (!isNode(node.callee)) return null;

	const calleeText = valueNodeText(node.callee, source);
	if (!VALUE_STATIC_CALLEE_PATTERN.test(calleeText)) return null;
	if (!canEmitStaticCalleeText(calleeText, input.moduleImports)) return null;

	const args: EmissionNode[] = [];
	for (const argument of Array.isArray(node.arguments) ? node.arguments : []) {
		if (!isNode(argument)) return null;
		// The string path splits arguments on top-level commas and hands each one
		// to `supportedValueSource`, which refuses a leading `...`. A spread
		// argument is therefore unsupported on both paths.
		if (argument.type === 'SpreadElement') return null;

		const value = valueExpressionNode(argument, source, input);
		if (!value) return null;
		args.push(value);
	}

	return callNode(node.callee as unknown as EmissionNode, args);
}

/** The band-local twin of `canEmitStaticCallCallee`. */
function canEmitStaticCalleeText(
	callee: string,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
): boolean {
	const [rootName] = callee.split('.');
	if (!rootName) return false;
	if (moduleImports.some((moduleImport) => moduleImport.localName === rootName)) return true;
	if (callee.includes('.')) return VALUE_GLOBAL_CALL_ROOTS.has(rootName);

	return false;
}

/** `unaryValueSource`, node-shaped. */
function unaryValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const operator = typeof node.operator === 'string' ? node.operator : '';
	if (node.prefix !== true || !VALUE_UNARY_OPERATORS.has(operator)) return null;
	if (!isNode(node.argument)) return null;

	const argument = valueExpressionNode(node.argument, source, input);
	if (!argument) return null;

	return { type: 'UnaryExpression', operator, prefix: true, argument };
}

/** `conditionalValueSource`, node-shaped. */
function conditionalValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	if (!isNode(node.test) || !isNode(node.consequent) || !isNode(node.alternate)) return null;

	const test = valueExpressionNode(node.test, source, input);
	const consequent = valueExpressionNode(node.consequent, source, input);
	const alternate = valueExpressionNode(node.alternate, source, input);
	if (!test || !consequent || !alternate) return null;

	return conditionalNode(test, consequent, alternate);
}

/** `binaryValueSource`, node-shaped, for both the binary and logical forms. */
function binaryValueNode(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode | null {
	const operator = typeof node.operator === 'string' ? node.operator : '';
	if (!VALUE_BINARY_OPERATORS.has(operator)) return null;
	if (!isNode(node.left) || !isNode(node.right)) return null;

	const left = valueExpressionNode(node.left, source, input);
	const right = valueExpressionNode(node.right, source, input);
	if (!left || !right) return null;

	if (operator === '&&' || operator === '||' || operator === '??') {
		return logicalNode(operator, left, right);
	}

	return binaryNode(operator, left, right);
}

/**
 * The AST twin of `spliceGraphReadsAndLocals` — rewriting by node identity
 * rather than by character search (invariant 6).
 *
 * A node is rewritten when its own authored text is a recorded graph read's
 * source, outermost first, which is what the string path's longest-source-first
 * sort approximates. A bare identifier that names a row local becomes
 * `context.locals?.<name>`. Everything else is cloned through unchanged.
 *
 * Two positions are never rewritten, because they are not value positions: the
 * property of a non-computed member access, and the key of a non-computed
 * property. A shorthand property is expanded to `key: <rewritten>` rather than
 * left shorthand, since a rewritten value can no longer be spelled by its key.
 */
function rewriteGraphReadsAndLocals(
	node: AnyNode,
	source: string,
	input: ValueExpressionEmissionInput,
): EmissionNode {
	// A property is checked before its own text is, because a shorthand
	// property's text is its key's text: matching there would replace the whole
	// property with a bare expression, which is what the string path does and
	// what makes its output unparseable.
	if (node.type === 'Property') {
		const key = isNode(node.key) ? node.key : null;
		const value = isNode(node.value) ? node.value : null;
		if (!key || !value) return node as unknown as EmissionNode;

		return {
			...(node as unknown as EmissionNode),
			shorthand: false,
			key:
				node.computed === true
					? rewriteGraphReadsAndLocals(key, source, input)
					: (key as unknown as EmissionNode),
			value: rewriteGraphReadsAndLocals(value, source, input),
		};
	}

	const text = valueNodeText(node, source);
	const graphRead = text
		? input.graphReads.find((read) => read.source === text)
		: undefined;
	if (graphRead) {
		return graphReadCall({
			callee: 'context.graph.read',
			graphNodeId: graphRead.graphNodeId,
			path: graphRead.path,
		});
	}

	if (node.type === 'Identifier' && typeof node.name === 'string' && input.localNames.has(node.name)) {
		return optionalPathNode(memberChainNode('context.locals'), [node.name]);
	}

	if (node.type === 'MemberExpression' && node.computed !== true && isNode(node.object)) {
		return {
			...(node as unknown as EmissionNode),
			object: rewriteGraphReadsAndLocals(node.object, source, input),
		};
	}

	const rewritten: Record<string, unknown> = { ...(node as Record<string, unknown>) };
	for (const [key, child] of Object.entries(node)) {
		if (key === 'parent' || key === 'loc' || key === 'range') continue;

		if (Array.isArray(child)) {
			rewritten[key] = child.map((item) =>
				isNode(item) ? rewriteGraphReadsAndLocals(item, source, input) : item,
			);
			continue;
		}
		if (isNode(child)) {
			rewritten[key] = rewriteGraphReadsAndLocals(child, source, input);
		}
	}

	return rewritten as unknown as EmissionNode;
}

// ---------------------------------------------------------------------------
// The general symbol-module path through the AST printer.
//
// `emitSymbolModule` is a dispatcher: it reads a planned symbol's kind and hands
// the symbol to the emitter that owns it. Its AST twin is the same dispatch over
// the sibling builders this file already carries, so a caller can ask for one
// symbol's printed module without knowing which band answers.
//
// Two kinds have no AST path to dispatch to yet, and this band says so by name
// rather than by silently emitting nothing: `SYMBOL_MODULE_UNMIGRATED_KINDS`
// records which unit owns each. The branch-update and async-boundary-update
// kinds never reach `emitSymbolModule` at all — `emitSymbolModules` routes them
// before this dispatcher would see them — so they are listed there too.
// ---------------------------------------------------------------------------

export type SymbolModuleEmissionInput = {
	readonly symbol: PlannedSymbol;
	readonly moduleDeclarations: readonly string[];
	readonly moduleImports: readonly SemanticModuleImport[];
	readonly captureSlots: ReadonlyArray<CaptureSlot>;
	readonly semanticGraph: SymbolModulesInput['semanticGraph'];
	readonly renderData: SymbolModulesInput['renderData'];
	readonly omitAuthoredSource: boolean;
	/** The authored file the symbol was extracted from; names the map. */
	readonly sourceFileName: string;
};

/** The symbol kinds `buildSymbolModuleEmission` can print from nodes today. */
export const SYMBOL_MODULE_AST_KINDS: ReadonlySet<PlannedSymbol['kind']> = new Set([
	'state-initializer',
	'behavior',
	'async-computed-runner',
	'dom-update',
]);

/** The kinds with no AST path yet, and the unit that owes each one. */
export const SYMBOL_MODULE_UNMIGRATED_KINDS: ReadonlyMap<PlannedSymbol['kind'], string> = new Map([
	['event-handler', 'sketch item 5 - emitEventHandlerModule'],
	['callback-prop', 'sketch item 5 - emitEventHandlerModule'],
	['sync-computed-derive', 'sketch item 2 - the last unmigrated low-risk emitter'],
	['branch-update', 'sketch item 3 - routed by emitSymbolModules, never by emitSymbolModule'],
	[
		'async-boundary-update',
		'sketch item 3 - routed by emitSymbolModules, never by emitSymbolModule',
	],
]);

/**
 * Build the print input for one planned symbol, whichever kind it is.
 *
 * `null` means one of two things, and they are distinguished by
 * `SYMBOL_MODULE_AST_KINDS`: either the symbol produces no module at all (a
 * behavior whose function source is not callable, which the string path also
 * drops), or its kind's emitter has not been migrated yet.
 */
export function buildSymbolModuleEmission(
	input: SymbolModuleEmissionInput,
): EmissionPrintInput | null {
	const { symbol } = input;

	if (symbol.kind === 'state-initializer') {
		return buildStateInitializerEmission({
			symbol,
			moduleDeclarations: input.moduleDeclarations,
			moduleImports: input.moduleImports,
			propReads: stateInitializerPropReads(
				symbol,
				input.semanticGraph,
				input.renderData,
				input.sourceFileName,
			),
			omitAuthoredSource: input.omitAuthoredSource,
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'behavior') {
		if (!canEmitBehaviorModule(symbol)) return null;

		return buildBehaviorEmission({
			symbol,
			omitAuthoredSource: input.omitAuthoredSource,
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'async-computed-runner') {
		return buildAsyncComputedRunnerEmission({
			symbol,
			captureSlots: input.captureSlots,
			omitAuthoredSource: input.omitAuthoredSource,
			sourceFileName: input.sourceFileName,
		});
	}

	if (symbol.kind === 'dom-update') {
		return buildDomBindingEmission({ symbol, sourceFileName: input.sourceFileName });
	}

	return null;
}

/** The printed module for one planned symbol, with its source map (invariant 3). */
export function emitSymbolModuleNodes(input: SymbolModuleEmissionInput): EmittedModule | null {
	const emission = buildSymbolModuleEmission(input);
	return emission ? printEmittedModule(emission) : null;
}

// ---------------------------------------------------------------------------
// Test seams.
//
// The string path's value emitters are module-private, and the parity test has
// to run them against the AST path on the same inputs. Exporting them through
// thin wrappers rather than by widening their declarations keeps the swap unit's
// deletion mechanical: these two functions go when the cluster goes, and no
// existing declaration was edited to add them.
// ---------------------------------------------------------------------------

/** The string path's `supportedValueSource`, for parity measurement only. */
export function supportedValueSourceForParity(
	input: Omit<ValueExpressionEmissionInput, 'sourceFileName'>,
): string | null {
	return supportedValueSource(
		input.valueSource,
		input.eventParameters,
		input.graphReads,
		input.moduleImports,
		input.localNames,
	);
}

/** The string path's `eventWriteValueSource`, for parity measurement only. */
export function eventWriteValueSourceForParity(
	input: Omit<ValueExpressionEmissionInput, 'sourceFileName'>,
): string | null {
	return eventWriteValueSource(
		input.valueSource,
		input.eventParameters,
		input.graphReads,
		input.moduleImports,
		input.localNames,
	);
}

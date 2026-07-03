import type {
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	SemanticModuleImport,
	SourceSpan,
	SymbolResolverInput,
	SymbolResolverPlan,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../artifact-helpers/graph-paths.ts';

export function planSymbolResolver(input: SymbolResolverInput): SymbolResolverPlan {
	const symbols: PlannedSymbol[] = [];
	let nextSymbolId = 0;

	for (const event of input.payloadArena.view.events) {
		for (let order = 0; order < event.handlerCount; order++) {
			const source = event.handlerSources[order] ?? '';
			const sourceSpan = event.handlerSpans[order];
			const moduleImports = referencedModuleImports(
				input.semanticGraph.moduleImports,
				source,
			);

			symbols.push({
				id: `symbol:${nextSymbolId++}`,
				kind: 'event-handler',
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				source,
				parameters: event.handlerParameters[order] ?? [],
				...(moduleImports.length > 0 ? { moduleImports } : {}),
				order,
				reads: eventReads(source, input.stateLowering?.reads),
				writes: eventWrites(source, input.stateLowering?.writes, sourceSpan),
				elementHandleCalls: collectElementHandleCalls(
					source,
					input.payloadArena.view.elementHandles,
				),
			});
		}
	}

	for (const edge of input.semanticGraph.componentEdges) {
		for (const prop of edge.props) {
			if (prop.kind !== 'callback') continue;
			const moduleImports = referencedModuleImports(
				input.semanticGraph.moduleImports,
				prop.source,
			);
			symbols.push({
				id: `symbol:${nextSymbolId++}`,
				kind: 'callback-prop',
				componentEdgeId: edge.id,
				propName: prop.name,
				source: prop.source,
				...(moduleImports.length > 0 ? { moduleImports } : {}),
				reads: eventReads(prop.source, input.stateLowering?.reads),
				writes: eventWrites(prop.source, input.stateLowering?.writes, prop.sourceSpan),
			});
		}
	}

	for (const domUpdate of input.payloadArena.view.domUpdates) {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'dom-update',
			hostNodeId: domUpdate.hostNodeId,
			source: domUpdate.source,
			graphNodeId: domUpdate.graphNodeId,
			target: domUpdate.target,
		});
	}

	input.payloadArena.view.behaviors.forEach((behavior, order) => {
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'behavior',
			hostNodeId: behavior.hostNodeId,
			source: behavior.source,
			functionSource: behavior.functionSource,
			inputSources: behavior.inputSources,
			moduleImport: findModuleImport(
				input.semanticGraph.moduleImports,
				behavior.functionSource,
			),
			order,
		});
	});

	for (const computed of input.payloadArena.state.computed) {
		const source = computed.functionSource ?? '';
		const moduleImports = referencedModuleImports(input.semanticGraph.moduleImports, source);

		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'async-computed-runner',
			graphNodeId: computed.graphNodeId,
			name: computed.name,
			source,
			...(computed.dependencies && computed.dependencies.length > 0
				? { dependencies: computed.dependencies }
				: {}),
			...(moduleImports.length > 0 ? { moduleImports } : {}),
		});
	}

	// Boundary settle symbols (gate-blind; protocol-view wires only boundaries
	// with a plan arms entry).
	for (const boundary of input.payloadArena.view.asyncBoundaries) {
		const read = boundary.asyncReads[0];
		if (!read) continue;
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'async-boundary-update',
			boundaryId: boundary.id,
			graphNodeId: read.graphNodeId,
		});
	}

	// Branch flip symbols (gate-blind like the arena; protocol-view wires only
	// gate-supported ones onto branch records).
	const branchBindings = graphBindingMap(input.semanticGraph);
	const branchAliases = semanticAliasMap(input.semanticGraph);
	for (const site of input.semanticGraph.branchSites) {
		const resolved = resolveGraphPath(site.testSource, branchBindings, branchAliases);
		symbols.push({
			id: `symbol:${nextSymbolId++}`,
			kind: 'branch-update',
			branchSiteId: site.id,
			testSource: site.testSource,
			testReads: resolved
				? [
						{
							source: site.testSource,
							graphNodeId: resolved.binding.id,
							path: resolved.path,
						},
					]
				: [],
		});
	}

	return {
		passId: 'symbol-resolver',
		dynamicImportOwner: 'generated-symbol-resolver',
		symbols,
		syncPolicies: input.semanticGraph.events
			.filter((event) => event.hasSyncPolicyCandidate)
			.map((event) => ({
				eventId: event.id,
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				syncPolicy: event.syncPolicy,
			})),
		diagnostics: input.payloadArena.diagnostics,
	};
}

function eventWrites(
	handlerSource: string,
	writes: ReadonlyArray<LoweredStateWrite> | undefined,
	handlerSpan: SourceSpan | undefined,
): ReadonlyArray<LoweredStateWrite> {
	if (!handlerSource || !writes?.length) return [];

	return writes.filter((write) => {
		if (handlerSpan && write.sourceSpan) return spanContains(handlerSpan, write.sourceSpan);
		return handlerContainsWrite(handlerSource, write);
	});
}

function eventReads(
	handlerSource: string,
	reads: ReadonlyArray<LoweredStateRead> | undefined,
): ReadonlyArray<LoweredStateRead> {
	if (!handlerSource || !reads?.length) return [];

	return reads.filter((read) => handlerSource.includes(read.source));
}

function spanContains(container: SourceSpan, child: SourceSpan): boolean {
	return (
		container.filename === child.filename &&
		child.start >= container.start &&
		child.end <= container.end
	);
}

function handlerContainsWrite(handlerSource: string, write: LoweredStateWrite): boolean {
	if (write.operation === 'assign' && write.valueSource) {
		return handlerContainsAssignment(handlerSource, write);
	}

	if (write.operation === 'update' && write.updateOperator) {
		const source = escapeRegExp(write.source);
		const operator = escapeRegExp(write.updateOperator);
		return (
			new RegExp(`(?:^|[^$0-9A-Z_a-z])${source}\\s*${operator}`).test(handlerSource) ||
			new RegExp(`${operator}\\s*${source}(?:$|[^$0-9A-Z_a-z])`).test(handlerSource)
		);
	}

	if (write.operation === 'delete') {
		return new RegExp(`delete\\s+${escapeRegExp(write.source)}(?:$|[^$0-9A-Z_a-z])`).test(
			handlerSource,
		);
	}

	if (write.operation === 'call' && write.method) {
		return (
			handlerSource.includes(write.source) &&
			handlerSource.includes(`.${write.method}`) &&
			(write.argumentSources ?? []).every((argument) => handlerSource.includes(argument))
		);
	}

	return handlerSource.includes(write.source);
}

function handlerContainsAssignment(handlerSource: string, write: LoweredStateWrite): boolean {
	if (!write.valueSource) return false;

	const source = escapeRegExp(write.source);
	const operator = escapeRegExp(write.assignmentOperator ?? '=');
	const valueSource = escapeRegExp(write.valueSource);

	return new RegExp(
		`(?:^|[^$0-9A-Z_a-z])${source}\\s*${operator}\\s*${valueSource}(?:$|[^$0-9A-Z_a-z])`,
	).test(handlerSource);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function referencedModuleImports(
	imports: ReadonlyArray<SemanticModuleImport>,
	source: string,
): ReadonlyArray<SemanticModuleImport> {
	if (!source || imports.length === 0) return [];

	const searchableSource = sourceWithoutStringOrCommentText(source);
	return imports.filter((item) => sourceReferencesIdentifier(searchableSource, item.localName));
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

function sourceWithoutStringOrCommentText(source: string): string {
	let result = '';
	let quote: string | null = null;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;

	for (let index = 0; index < source.length; index++) {
		const char = source[index] ?? '';
		const next = source[index + 1] ?? '';

		if (lineComment) {
			if (char === '\n') {
				lineComment = false;
				result += char;
			} else {
				result += ' ';
			}
			continue;
		}

		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				result += '  ';
				index++;
			} else {
				result += char === '\n' ? char : ' ';
			}
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				quote = null;
			}
			result += ' ';
			continue;
		}

		if (char === '/' && next === '/') {
			lineComment = true;
			result += '  ';
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			blockComment = true;
			result += '  ';
			index++;
			continue;
		}

		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			result += ' ';
			continue;
		}

		result += char;
	}

	return result;
}

function findModuleImport(
	imports: SymbolResolverInput['semanticGraph']['moduleImports'],
	functionSource: string,
) {
	const [rootName] = functionSource.split('.');
	if (!rootName) return undefined;

	return imports.find((item) => item.localName === rootName);
}

// Handler statements like box.focus() reference element() handles; they must
// survive into the emitted symbol (the runtime resolves the handle by name).
// Matches direct method calls on a known handle name and records the offset
// so emission can interleave them with lowered writes in authored order.
function collectElementHandleCalls(
	source: string,
	elementHandles: ReadonlyArray<{ readonly name: string }>,
): ReadonlyArray<{
	readonly handleName: string;
	readonly method: string;
	readonly argumentSources: ReadonlyArray<string>;
	readonly offset: number;
}> {
	if (elementHandles.length === 0) return [];
	const names = new Set(elementHandles.map((handle) => handle.name));
	const calls: Array<{
		handleName: string;
		method: string;
		argumentSources: string[];
		offset: number;
	}> = [];
	const callPattern = /(?<![\w$.])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\(([^()]*)\)/g;
	for (const match of source.matchAll(callPattern)) {
		const [, handleName, method, argsSource] = match;
		if (!handleName || !method || !names.has(handleName)) continue;
		const argumentSources = argsSource!.trim()
			? argsSource!.split(',').map((argument) => argument.trim())
			: [];
		calls.push({ handleName, method, argumentSources, offset: match.index ?? 0 });
	}
	return calls;
}

import type {
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	SemanticModuleImport,
	SymbolResolverInput,
	SymbolResolverPlan,
} from '../artifacts.ts';
import {
	compilerEventAssignmentWriteMatcher,
	compilerEventDeleteWriteMatcher,
	compilerEventPostfixUpdateWriteMatcher,
	compilerEventPrefixUpdateWriteMatcher,
	compilerIdentifierPartPattern,
} from '../source-patterns.ts';

export function planSymbolResolver(input: SymbolResolverInput): SymbolResolverPlan {
	const symbols: PlannedSymbol[] = [];
	let nextSymbolId = 0;

	for (const event of input.payloadArena.view.events) {
		for (let order = 0; order < event.handlerCount; order++) {
			const source = event.handlerSources[order] ?? '';
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
				writes: eventWrites(source, input.stateLowering?.writes),
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
		if (computed.async !== true) continue;

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
): ReadonlyArray<LoweredStateWrite> {
	if (!handlerSource || !writes?.length) return [];

	return writes.filter((write) => handlerContainsWrite(handlerSource, write));
}

function eventReads(
	handlerSource: string,
	reads: ReadonlyArray<LoweredStateRead> | undefined,
): ReadonlyArray<LoweredStateRead> {
	if (!handlerSource || !reads?.length) return [];

	return reads.filter((read) => handlerSource.includes(read.source));
}

function handlerContainsWrite(handlerSource: string, write: LoweredStateWrite): boolean {
	if (write.operation === 'assign' && write.valueSource) {
		return handlerContainsAssignment(handlerSource, write);
	}

	if (write.operation === 'update' && write.updateOperator) {
		return (
			compilerEventPostfixUpdateWriteMatcher(write.source, write.updateOperator).test(
				handlerSource,
			) ||
			compilerEventPrefixUpdateWriteMatcher(write.source, write.updateOperator).test(
				handlerSource,
			)
		);
	}

	if (write.operation === 'delete') {
		return compilerEventDeleteWriteMatcher(write.source).test(handlerSource);
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

	return compilerEventAssignmentWriteMatcher(
		write.source,
		write.assignmentOperator ?? '=',
		write.valueSource,
	).test(handlerSource);
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
		if (isIdentifierChar(before) || before === '.') continue;
		if (isIdentifierChar(after)) continue;

		return true;
	}

	return false;
}

function isIdentifierChar(char: string): boolean {
	return compilerIdentifierPartPattern.test(char);
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

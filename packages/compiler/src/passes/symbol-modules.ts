import type {
	GeneratedSymbolModule,
	PublicRenderPlanAsyncBoundaryArmRender,
	PublicRenderPlanAsyncBoundaryArms,
	PublicRenderPlanBranchArms,
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	SemanticGraphDependency,
	SemanticModuleImport,
	SymbolModulesArtifact,
	SymbolModulesInput,
} from '../artifacts.ts';
import { walkNode, type AnyNode } from '../ast/nodes.ts';
import { parseJavaScriptModule } from '../js-ast.ts';

export function emitSymbolModules(input: SymbolModulesInput): SymbolModulesArtifact {
	const localNamesBySymbol = publicRenderLocalNamesBySymbol(input.publicRenderPlan);

	const branchArmsBySite = new Map(
		(input.publicRenderPlan?.branchArms ?? []).map((entry) => [entry.branchSiteId, entry]),
	);
	const boundaryArmsById = new Map(
		(input.publicRenderPlan?.asyncBoundaryArms ?? []).map((entry) => [entry.boundaryId, entry]),
	);
	const boundaryArmRendersById = new Map(
		(input.publicRenderPlan?.asyncBoundaryArmRenders ?? []).map((entry) => [
			entry.boundaryId,
			entry,
		]),
	);

	return {
		passId: 'symbol-modules',
		modules: input.symbolResolver.symbols.flatMap((symbol) => {
			if (symbol.kind === 'branch-update') {
				const arms = branchArmsBySite.get(symbol.branchSiteId);
				return arms ? [emitBranchUpdateModule(symbol, arms)] : [];
			}
			if (symbol.kind === 'async-boundary-update') {
				const arms = boundaryArmsById.get(symbol.boundaryId);
				if (arms) return [emitAsyncBoundaryUpdateModule(symbol, arms)];
				const armRender = boundaryArmRendersById.get(symbol.boundaryId);
				return armRender ? [emitAsyncBoundaryArmRenderModule(symbol, armRender)] : [];
			}
			return emitSymbolModule(symbol, localNamesBySymbol.get(symbol.id) ?? emptyLocalNames);
		}),
		diagnostics: input.captureAnalysis.diagnostics,
	};
}

// A branch flip module: evaluate the compiled test through graph reads, pick
// the arm, and rebuild that arm's HTML from static parts plus graph-read
// slots. Whole-range replacement only — no diffing, no component execution.
function emitBranchUpdateModule(
	symbol: Extract<PlannedSymbol, { kind: 'branch-update' }>,
	arms: PublicRenderPlanBranchArms,
): GeneratedSymbolModule {
	const exportName = symbolExportName(symbol.id);
	const testExpression = arms.testRead
		? `context.graph.read(${JSON.stringify(arms.testRead.graphNodeId)}${arms.testRead.path.length > 0 ? `, ${JSON.stringify(arms.testRead.path)}` : ''})`
		: 'undefined';
	const armSelector = arms.armTests
		? `marklessSelectSwitchArm(${testExpression}, ${JSON.stringify(arms.armTests)})`
		: `(${testExpression}) ? 0 : 1`;
	const selectorHelper = arms.armTests
		? 'function marklessSelectSwitchArm(value, tests) { for (let index = 0; index < tests.length; index++) { if (tests[index] !== null && value === tests[index]) return index; } return tests.indexOf(null); }'
		: null;
	// Arm-scoped flips may carry repeat parts: rows rebuild from a live graph
	// read of the collection at flip time (still no component execution).
	const hasRepeatParts = arms.arms.some((arm) => arm.some((part) => 'repeat' in part));
	const partExpression = hasRepeatParts
		? 'parts.map((part) => part.text !== undefined ? part.text : part.repeat !== undefined ? marklessBranchRows(part.repeat, context.graph) : marklessBranchText(context.graph.read(part.read.graphNodeId, part.read.path))).join("")'
		: 'parts.map((part) => part.text !== undefined ? part.text : marklessBranchText(context.graph.read(part.read.graphNodeId, part.read.path))).join("")';
	const rowsHelper = hasRepeatParts
		? 'function marklessBranchRows(repeat, graph) { const items = graph.read(repeat.read.graphNodeId, repeat.read.path); if (!Array.isArray(items)) return ""; return items.map((item) => repeat.rowParts.map((row) => row.text !== undefined ? row.text : row.itemPath !== undefined ? marklessBranchText(row.itemPath.reduce((value, key) => value == null ? value : value[key], item)) : marklessBranchText(graph.read(row.read.graphNodeId, row.read.path))).join("")).join(""); }'
		: null;
	const source = [
		`const marklessBranchArms = ${JSON.stringify(arms.arms)};`,
		...(selectorHelper ? [selectorHelper] : []),
		`export function ${exportName}(context) {`,
		`	const arm = context.arm ?? (${armSelector});`,
		'	const parts = marklessBranchArms[arm] ?? [];',
		`	const html = ${partExpression};`,
		'	return { arm, html };',
		'}',
		'function marklessBranchText(value) { return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }',
		...(rowsHelper ? [rowsHelper] : []),
	].join('\n');
	return {
		symbolId: symbol.id,
		kind: symbol.kind,
		exportName,
		source,
	};
}

const emptyLocalNames = new Set<string>();

function publicRenderLocalNamesBySymbol(
	publicRenderPlan: PublicRenderPlanArtifact | undefined,
): ReadonlyMap<string, ReadonlySet<string>> {
	const localNamesBySymbol = new Map<string, Set<string>>();
	for (const repeat of publicRenderPlan?.keyedRepeats ?? []) {
		for (const eventControl of repeat.eventControls) {
			let localNames = localNamesBySymbol.get(eventControl.symbolId);
			if (!localNames) {
				localNames = new Set();
				localNamesBySymbol.set(eventControl.symbolId, localNames);
			}
			localNames.add(eventControl.itemContext.itemName);
		}
	}
	return localNamesBySymbol;
}

function emitSymbolModule(
	symbol: PlannedSymbol,
	localNames: ReadonlySet<string>,
): GeneratedSymbolModule[] {
	if (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitEventHandlerModule(symbol, localNames),
			},
		];
	}

	if (symbol.kind === 'behavior' && canEmitBehaviorModule(symbol)) {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitBehaviorModule(symbol),
			},
		];
	}

	if (symbol.kind === 'async-computed-runner') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitAsyncComputedRunnerModule(symbol),
			},
		];
	}

	if (symbol.kind === 'sync-computed-derive') {
		return [
			{
				symbolId: symbol.id,
				kind: symbol.kind,
				exportName: symbolExportName(symbol.id),
				source: emitSyncComputedDeriveModule(symbol),
			},
		];
	}

	if (symbol.kind !== 'dom-update') return [];

	return [
		{
			symbolId: symbol.id,
			kind: symbol.kind,
			exportName: symbolExportName(symbol.id),
			source: emitDomBindingModule(symbol),
		},
	];
}

function emitEventHandlerModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	localNames: ReadonlySet<string>,
): string {
	const exportName = symbolExportName(symbol.id);
	const scalarWriteLeaf = scalarWriteLeafSource(symbol, localNames);
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
	const parameters = symbol.kind === 'event-handler' ? symbol.parameters : [];
	const importedReference = importedHandlerReference(symbol);
	const body = importedReference
		? `return ${symbol.source.trim()}(context.event);`
		: eventHandlerAuthoredBody(symbol, localNames);
	const imports = eventModuleImports(symbol, body);
	const asyncKeyword = !importedReference && eventHandlerIsAsync(symbol.source) ? 'async ' : '';
	const parameterDeclarations =
		!importedReference && parameters.length > 0
			? parameters.map((parameter) => `	const ${parameter} = context.event;`)
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
): string {
	const body = eventHandlerBodySource(symbol.source);
	if (!body) return 'void context;';

	return spliceEventHandlerBody(
		body.source,
		body.sourceStart,
		symbol,
		symbol.kind === 'event-handler' ? symbol.parameters : [],
		localNames,
	);
}

function eventHandlerBodySource(
	source: string,
): { readonly source: string; readonly sourceStart: number } | null {
	const arrowIndex = source.indexOf('=>');
	if (arrowIndex === -1) return null;

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

function eventHandlerIsAsync(source: string): boolean {
	return source.trimStart().startsWith('async ');
}

function spliceEventHandlerBody(
	bodySource: string,
	bodyStartInHandlerSource: number,
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' | 'callback-prop' }>,
	eventParameters: ReadonlyArray<string>,
	localNames: ReadonlySet<string>,
): string {
	const replacements = [
		...(symbol.reads ?? []).flatMap((read) =>
			readBodySpans(bodySource, read).map((span) => ({
				...span,
				replacement: graphReadCallSource('context.graph.read', read.graphNodeId, read.path),
			})),
		),
		...(symbol.writes ?? []).flatMap((write) => {
			const replacement = emitEventWriteExpression(
				write,
				eventParameters,
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
	read: LoweredStateRead,
): ReadonlyArray<{ readonly start: number; readonly end: number }> {
	const prefix = 'async function* __marklessBody() {\n';
	const source = `${prefix}${bodySource}\n}`;
	let ast: AnyNode;
	try {
		ast = parseJavaScriptModule(source);
	} catch {
		return [];
	}

	const spans = new Map<number, { readonly start: number; readonly end: number }>();
	walkNode(ast, (node) => {
		if (!isGraphReadExpression(node)) return;
		if (typeof node.start !== 'number' || typeof node.end !== 'number') return;
		if (source.slice(node.start, node.end) !== read.source) return;

		const start = node.start - prefix.length;
		const end = node.end - prefix.length;
		if (start < 0 || end > bodySource.length) return;
		spans.set(start, { start, end });
	});
	return [...spans.values()];
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
	for (const parameter of symbol.parameters) {
		remainder = remainder.replaceAll(`${parameter}.preventDefault();`, '');
		remainder = remainder.replaceAll(`${parameter}.stopPropagation();`, '');
	}
	remainder = remainder.replace(/\breturn\b/g, '');
	return remainder.replace(/[;\s]/g, '') === '';
}

function emitDomBindingModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
): string {
	const exportName = symbolExportName(symbol.id);
	if (
		symbol.target.kind === 'text' &&
		symbol.target.prefix === undefined &&
		symbol.target.suffix === undefined &&
		symbol.target.trueValue === undefined &&
		symbol.target.falseValue === undefined
	) {
		return [
			"import { marklessUpdateText } from '@markless/web/fns/update-text';",
			'',
			'/* text update leaf marker: type: "setText" */',
			`export function ${exportName}(context) {`,
			`	return marklessUpdateText(context, ${JSON.stringify(symbol.hostNodeId)});`,
			'}',
			'',
		].join('\n');
	}
	const entryProperties = domJournalEntryProperties(symbol);

	return [
		`export function ${exportName}(context) {`,
		'	return {',
		...entryProperties,
		'	};',
		'}',
		'',
	].join('\n');
}

function domJournalEntryProperties(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
): string[] {
	const locator = `context.domUpdate?.hostNodeId ?? ${JSON.stringify(symbol.hostNodeId)}`;
	const value = 'context.value';

	if (symbol.target.kind === 'text') {
		return [
			`		type: ${JSON.stringify('setText')},`,
			`		locator: ${locator},`,
			`		value: ${textDomUpdateValueSource(symbol.target, value)},`,
		];
	}

	if (symbol.target.kind === 'property') {
		return [
			`		type: ${JSON.stringify('setProp')},`,
			`		locator: ${locator},`,
			`		name: ${JSON.stringify(symbol.target.name)},`,
			`		value: ${value},`,
		];
	}

	if (symbol.target.kind === 'class') {
		return [
			`		type: ${JSON.stringify('setAttr')},`,
			`		locator: ${locator},`,
			`		name: ${JSON.stringify('class')},`,
			symbol.target.trueValue !== undefined && symbol.target.falseValue !== undefined
				? `		value: ${value} ? ${JSON.stringify(symbol.target.trueValue)} : ${JSON.stringify(symbol.target.falseValue)},`
				: `		value: ${value},`,
		];
	}

	if (symbol.target.kind === 'style') {
		return [
			`		type: ${JSON.stringify('setAttr')},`,
			`		locator: ${locator},`,
			`		name: ${JSON.stringify('style')},`,
			`		value: ${value},`,
		];
	}

	return [
		`		type: ${JSON.stringify('setAttr')},`,
		`		locator: ${locator},`,
		`		name: ${JSON.stringify(symbol.target.name)},`,
		`		value: ${value},`,
	];
}

function textDomUpdateValueSource(
	target: Extract<
		Extract<PlannedSymbol, { readonly kind: 'dom-update' }>['target'],
		{ readonly kind: 'text' }
	>,
	value: string,
): string {
	const conditional =
		target.trueValue !== undefined && target.falseValue !== undefined
			? `${value} ? ${JSON.stringify(target.trueValue)} : ${JSON.stringify(target.falseValue)}`
			: null;
	if (target.prefix === undefined && target.suffix === undefined) return conditional ?? value;

	const base = conditional ? `(${conditional})` : value;
	return `${JSON.stringify(target.prefix ?? '')} + (${base} == null ? "" : String(${base})) + ${JSON.stringify(target.suffix ?? '')}`;
}

function emitBehaviorModule(symbol: Extract<PlannedSymbol, { readonly kind: 'behavior' }>): string {
	const exportName = symbolExportName(symbol.id);
	const inputCount = symbol.inputSources.length;
	const imports = symbol.moduleImport ? [emitModuleImport(symbol.moduleImport), ''] : [];
	const functionSource =
		inputCount > 0 ? callableBehaviorFunctionSource(symbol) : symbol.functionSource;

	return [
		...imports,
		`export const authoredSource = ${JSON.stringify(symbol.source)};`,
		`export const behaviorFunctionSource = ${JSON.stringify(symbol.functionSource)};`,
		`export const behaviorInputSources = ${JSON.stringify(symbol.inputSources)};`,
		'',
		`export function ${exportName}(context) {`,
		inputCount > 0
			? `	const inputs = context.behaviorInputs ?? new Array(${inputCount}).fill(undefined);`
			: '	const inputs = [];',
		inputCount > 0
			? `	const behavior = ${functionSource}(...inputs);`
			: `	const behavior = ${functionSource};`,
		'	return behavior(context.element);',
		'}',
		'',
	].join('\n');
}

function callableBehaviorFunctionSource(
	symbol: Extract<PlannedSymbol, { readonly kind: 'behavior' }>,
): string {
	if (symbol.moduleImport) return symbol.functionSource;
	if (!isInlineFunctionSource(symbol.functionSource)) return symbol.functionSource;

	return `(${symbol.functionSource})`;
}

function canEmitBehaviorModule(
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

function emitAsyncComputedRunnerModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'async-computed-runner' }>,
): string {
	const exportName = symbolExportName(symbol.id);
	const imports = uniqueModuleImports(symbol.moduleImports ?? []);
	const dependencyDeclarations = asyncRunnerDependencyDeclarations(symbol.dependencies ?? []);

	return [
		...imports.map(emitModuleImport),
		...(imports.length > 0 ? [''] : []),
		`export const authoredSource = ${JSON.stringify(symbol.source)};`,
		'',
		`export function ${exportName}(context) {`,
		'	const read = context.graph?.read ? context.graph.read.bind(context.graph) : context.read;',
		...dependencyDeclarations,
		`	const run = ${symbol.source};`,
		'	return run({ key: context.key, signal: context.signal, read });',
		'}',
		'',
	].join('\n');
}

function emitSyncComputedDeriveModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
): string {
	const exportName = symbolExportName(symbol.id);
	const body = syncComputedDeriveBody(symbol);
	const imports = uniqueModuleImports(
		(symbol.moduleImports ?? []).filter((moduleImport) =>
			sourceReferencesIdentifier(body, moduleImport.localName),
		),
	);

	return [
		...imports.map(emitModuleImport),
		...(imports.length > 0 ? [''] : []),
		`export const authoredSource = ${JSON.stringify(symbol.source)};`,
		'',
		`export function ${exportName}(context) {`,
		...indentBody(body),
		'}',
		'',
	].join('\n');
}

function syncComputedDeriveBody(
	symbol: Extract<PlannedSymbol, { readonly kind: 'sync-computed-derive' }>,
): string {
	const body = eventHandlerBodySource(symbol.source);
	if (!body) return 'return undefined;';

	let emitted = body.source;
	const replacements = (symbol.dependencies ?? [])
		.flatMap((dependency) =>
			readBodySpans(body.source, dependency).map((span) => ({
				...span,
				replacement: graphReadCallSource(
					'context.graph.read',
					dependency.graphNodeId,
					dependency.path,
				),
			})),
		)
		.sort((left, right) => right.start - left.start || right.end - left.end);

	for (const replacement of replacements) {
		emitted =
			emitted.slice(0, replacement.start) +
			replacement.replacement +
			emitted.slice(replacement.end);
	}

	return emitted.trim() || 'return undefined;';
}

function asyncRunnerDependencyDeclarations(
	dependencies: ReadonlyArray<SemanticGraphDependency>,
): string[] {
	const declarations: string[] = [];
	const seenNames = new Set<string>();

	for (const dependency of dependencies) {
		const declaration = asyncRunnerDependencyDeclaration(dependency);
		if (!declaration || seenNames.has(declaration.name)) continue;

		seenNames.add(declaration.name);
		declarations.push(
			`	const ${declaration.name} = ${graphReadCallSource('read', declaration.graphNodeId, declaration.path)};`,
		);
	}

	return declarations;
}

function asyncRunnerDependencyDeclaration(dependency: SemanticGraphDependency): {
	readonly name: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
} | null {
	const sourcePath = staticSourcePath(dependency.source);
	if (!sourcePath) return null;

	const [name, ...memberPath] = sourcePath;
	if (!name) return null;

	const path = dependency.path.slice(0, Math.max(0, dependency.path.length - memberPath.length));

	return {
		name,
		graphNodeId: dependency.graphNodeId,
		path,
	};
}

function staticSourcePath(source: string): ReadonlyArray<string> | null {
	const parts = source.split('.');
	if (parts.length === 0) return null;
	if (parts.some((part) => !isIdentifierObjectKey(part))) return null;

	return parts;
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

// A boundary settle module: the runtime passes the settled status; the module
// picks the @try or @catch arm and rebuilds its HTML from static parts plus
// graph reads (the settled value already lives in the graph).
function emitAsyncBoundaryUpdateModule(
	symbol: Extract<PlannedSymbol, { kind: 'async-boundary-update' }>,
	arms: PublicRenderPlanAsyncBoundaryArms,
): GeneratedSymbolModule {
	const exportName = symbolExportName(symbol.id);
	const source = [
		`const marklessBoundaryArms = ${JSON.stringify(arms.arms)};`,
		`export function ${exportName}(context) {`,
		'	const arm = context.status === "rejected" ? 1 : 0;',
		'	const parts = marklessBoundaryArms[arm] ?? [];',
		'	const html = parts.map((part) => part.text !== undefined ? part.text : marklessBoundaryText(context.graph.read(part.read.graphNodeId, part.read.path))).join("");',
		'	return { arm, html };',
		'}',
		'function marklessBoundaryText(value) { return String(value == null ? "" : value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }',
	].join('\n');
	return { symbolId: symbol.id, kind: symbol.kind, exportName, source };
}

// Tier-4 arm renderer (D1): the public-render plan owns the emission pieces
// (component imports, planned records, render body); this pass only names the
// export the generated resolver dispatches to. Same callable contract as the
// parts-based module, extended with arm-relative armRecords in the return.
function emitAsyncBoundaryArmRenderModule(
	symbol: Extract<PlannedSymbol, { kind: 'async-boundary-update' }>,
	armRender: PublicRenderPlanAsyncBoundaryArmRender,
): GeneratedSymbolModule {
	const exportName = symbolExportName(symbol.id);
	const source = [
		...armRender.imports,
		...armRender.moduleLines,
		`export function ${exportName}(context) {`,
		...armRender.bodyLines,
		'}',
	].join('\n');
	return { symbolId: symbol.id, kind: symbol.kind, exportName, source };
}

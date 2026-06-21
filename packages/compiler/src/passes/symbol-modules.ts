import type {
	GeneratedSymbolModule,
	LoweredStateRead,
	LoweredStateWrite,
	PlannedSymbol,
	PublicRenderPlanArtifact,
	SemanticGraphDependency,
	SemanticModuleImport,
	SymbolModulesArtifact,
	SymbolModulesInput,
} from '../artifacts.ts';

export function emitSymbolModules(input: SymbolModulesInput): SymbolModulesArtifact {
	const localNamesBySymbol = publicRenderLocalNamesBySymbol(input.publicRenderPlan);

	return {
		passId: 'symbol-modules',
		modules: input.symbolResolver.symbols.flatMap((symbol) =>
			emitSymbolModule(symbol, localNamesBySymbol.get(symbol.id) ?? emptyLocalNames),
		),
		diagnostics: input.captureAnalysis.diagnostics,
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
	if (symbol.kind === 'event-handler') {
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
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
	localNames: ReadonlySet<string>,
): string {
	const exportName = symbolExportName(symbol.id);
	const writes = (symbol.writes ?? []).flatMap((write) =>
		emitEventWrite(
			write,
			symbol.parameters,
			symbol.reads ?? [],
			symbol.moduleImports ?? [],
			localNames,
		),
	);
	const imports = eventModuleImports(symbol, writes);

	return [
		...imports.map(emitModuleImport),
		...(imports.length > 0 ? [''] : []),
		`export function ${exportName}(context) {`,
		...(writes.length > 0 ? writes : ['	void context;']),
		'}',
		'',
	].join('\n');
}

function eventModuleImports(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
	emittedWrites: ReadonlyArray<string>,
): ReadonlyArray<SemanticModuleImport> {
	if (emittedWrites.length === 0) return [];

	const emittedSource = emittedWrites.join('\n');
	return uniqueModuleImports(
		(symbol.moduleImports ?? []).filter((moduleImport) =>
			sourceReferencesIdentifier(emittedSource, moduleImport.localName),
		),
	);
}

function emitEventWrite(
	write: LoweredStateWrite,
	eventParameters: ReadonlyArray<string>,
	graphReads: ReadonlyArray<LoweredStateRead>,
	moduleImports: ReadonlyArray<SemanticModuleImport>,
	localNames: ReadonlySet<string>,
): string[] {
	if (write.operation === 'assign' && !write.assignmentOperator) {
		const valueSource = supportedValueSource(
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
		const valueSource = supportedValueSource(
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

function emitDomBindingModule(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
): string {
	const exportName = symbolExportName(symbol.id);
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
			`		value: ${value},`,
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
			`		value: ${value},`,
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
			`	const ${declaration.name} = read(${JSON.stringify(declaration.graphNodeId)}, ${JSON.stringify(declaration.path)});`,
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

	return `context.graph.read(${JSON.stringify(graphRead.graphNodeId)}, ${JSON.stringify(graphRead.path)})`;
}

function literalValueSource(valueSource: string | undefined): string | null {
	const source = valueSource?.trim();
	if (!source) return null;

	if (/^(?:true|false|null|undefined)$/.test(source)) return source;
	if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(source)) return source;
	if (/^(['"])(?:\\.|(?!\1).)*\1$/.test(source)) return source;

	return null;
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
		if (isIdentifierChar(before) || before === '.') continue;
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

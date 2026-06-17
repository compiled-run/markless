import { parseModule } from '@tsrx/core';
import type { SourceSpan } from './semantic-graph.ts';

export type SerializerValuesInput = {
	readonly filename: string;
	readonly source: string;
};

export type SerializerValueTier =
	| 'built-in'
	| 'framework-graph'
	| 'app-value-class'
	| 'recreated'
	| 'dom-resource-behavior'
	| 'unsupported';

export type SerializerValueClassification = {
	readonly statePath: string;
	readonly tier: SerializerValueTier;
	readonly valueKind: string;
	readonly serializesAs?: string;
	readonly identitySource?: string;
	readonly span?: SourceSpan;
};

export type SerializerBuiltinRecord = {
	readonly statePath: string;
	readonly tier: 'built-in';
	readonly builtin:
		| 'Date'
		| 'RegExp'
		| 'Map'
		| 'Set'
		| 'URL'
		| 'BigInt'
		| 'Uint8Array'
		| 'ArrayBuffer';
	readonly roundTripShape: string;
	readonly span?: SourceSpan;
};

export type SerializerIdentityPlan = {
	readonly sourceName: string;
	readonly payloadId: string;
	readonly preservation: 'payload-id-backref';
	readonly roundTripShape: 'same-object-identity';
	readonly statePaths: ReadonlyArray<string>;
};

export type SerializerCycleEdge = {
	readonly from: string;
	readonly property: string;
	readonly to: string;
};

export type SerializerCyclePlan = {
	readonly rootSourceName: string;
	readonly allocation: 'shells-first';
	readonly roundTripShape: 'forward-ref-and-backref';
	readonly statePaths: ReadonlyArray<string>;
	readonly edges: ReadonlyArray<SerializerCycleEdge>;
};

export type SerializerClassRestorePlan = {
	readonly statePath: string;
	readonly className: string;
	readonly tier: 'app-value-class';
	readonly restoreStrategy: 'Object.create+assign';
	readonly constructorRuns: false;
	readonly methodBodiesSerialized: false;
	readonly ownFields: ReadonlyArray<string>;
	readonly methods: ReadonlyArray<string>;
	readonly span?: SourceSpan;
};

export type SerializerBehaviorRecord = {
	readonly tier: 'dom-resource-behavior';
	readonly behavior: string;
	readonly hostNodeId: string;
	readonly inputPaths: ReadonlyArray<string>;
	readonly serializesResult: false;
	readonly span?: SourceSpan;
};

export type SerializerDiagnostic = {
	readonly code: string;
	readonly severity: 'error' | 'warning';
	readonly phase: 'serialization';
	readonly passId: 'serializer-values-planning';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly primarySpan?: SourceSpan;
	readonly artifactKeys: ReadonlyArray<string>;
	readonly statePath: string;
	readonly valueKind: string;
	readonly suggestions: ReadonlyArray<{
		readonly message: string;
	}>;
	readonly docsUrl: string;
};

export type SerializerValuesPlanningArtifact = {
	readonly passId: 'serializer-values-planning';
	readonly filename: string;
	readonly payloadShape: {
		readonly kind: 'logical-state-arena';
		readonly finalJson: false;
		readonly browserResume: false;
	};
	readonly classifications: ReadonlyArray<SerializerValueClassification>;
	readonly builtins: ReadonlyArray<SerializerBuiltinRecord>;
	readonly identityPlans: ReadonlyArray<SerializerIdentityPlan>;
	readonly cyclePlans: ReadonlyArray<SerializerCyclePlan>;
	readonly classRestorePlans: ReadonlyArray<SerializerClassRestorePlan>;
	readonly behaviorRecords: ReadonlyArray<SerializerBehaviorRecord>;
	readonly diagnostics: ReadonlyArray<SerializerDiagnostic>;
};

type AnyNode = {
	type?: string;
	start?: number;
	end?: number;
	[key: string]: unknown;
};

type ClassInfo = {
	readonly name: string;
	readonly ownFields: ReadonlyArray<string>;
	readonly methods: ReadonlyArray<string>;
	readonly hasPrivateState: boolean;
};

type VariableInfo = {
	readonly name: string;
	readonly typeName: string | null;
	readonly init: AnyNode | null;
};

type SourceEdge = {
	readonly fromSource: string;
	readonly property: string;
	readonly toSource: string;
};

type PlanningContext = {
	readonly filename: string;
	readonly source: string;
	readonly classes: ReadonlyMap<string, ClassInfo>;
	readonly variables: ReadonlyMap<string, VariableInfo>;
	readonly elementHandles: ReadonlySet<string>;
	readonly classifications: SerializerValueClassification[];
	readonly builtins: SerializerBuiltinRecord[];
	readonly identityRefs: Map<string, Set<string>>;
	readonly sourceEdges: SourceEdge[];
	readonly classRestorePlans: SerializerClassRestorePlan[];
	readonly behaviorRecords: SerializerBehaviorRecord[];
	readonly diagnostics: SerializerDiagnostic[];
};

const ignoredWalkKeys = new Set([
	'comments',
	'closingElement',
	'innerComments',
	'leadingComments',
	'loc',
	'metadata',
	'openingElement',
	'parent',
	'range',
	'trailingComments',
]);

const builtinConstructors = new Set(['Date', 'Map', 'Set', 'URL']);
const typedArrayConstructors = new Set([
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
]);
const runtimeValueCodes = new Map([
	['HTMLElement', 'ARCADE_SERIALIZE_DOM_NODE'],
	['Element', 'ARCADE_SERIALIZE_DOM_NODE'],
	['Node', 'ARCADE_SERIALIZE_DOM_NODE'],
	['Document', 'ARCADE_SERIALIZE_DOM_NODE'],
	['Request', 'ARCADE_SERIALIZE_RUNTIME_VALUE'],
	['Response', 'ARCADE_SERIALIZE_RUNTIME_VALUE'],
	['WebSocket', 'ARCADE_SERIALIZE_RUNTIME_VALUE'],
	['ReadableStream', 'ARCADE_SERIALIZE_STREAM'],
	['WritableStream', 'ARCADE_SERIALIZE_STREAM'],
	['TransformStream', 'ARCADE_SERIALIZE_STREAM'],
	['WeakMap', 'ARCADE_SERIALIZE_WEAK_COLLECTION'],
	['WeakSet', 'ARCADE_SERIALIZE_WEAK_COLLECTION'],
]);

export async function planSerializerValues(
	input: SerializerValuesInput,
): Promise<SerializerValuesPlanningArtifact> {
	const ast = parseModule(input.source, input.filename) as AnyNode;
	const classes = collectClasses(ast);
	const variables = collectVariables(ast);
	const elementHandles = collectElementHandles(variables);
	const sourceEdges = collectSourceEdges(ast);
	const context: PlanningContext = {
		filename: input.filename,
		source: input.source,
		classes,
		variables,
		elementHandles,
		classifications: [],
		builtins: [],
		identityRefs: new Map(),
		sourceEdges,
		classRestorePlans: [],
		behaviorRecords: [],
		diagnostics: [],
	};

	for (const handle of elementHandles) {
		addClassification(context, {
			statePath: handle,
			tier: 'framework-graph',
			valueKind: 'element-handle',
			serializesAs: 'dom-locator',
			span: sourceSpan(variables.get(handle)?.init ?? undefined),
		});
	}

	for (const variable of variables.values()) {
		if (isCallTo(variable.init, 'computed')) {
			addClassification(context, {
				statePath: variable.name,
				tier: 'recreated',
				valueKind: 'computed',
				serializesAs: 'dependency-record',
				span: sourceSpan(variable.init ?? undefined),
			});
			continue;
		}

		if (!isCallTo(variable.init, 'state')) continue;

		const firstArg = asNodes(variable.init?.arguments)[0];
		classifyExpression({
			context,
			node: firstArg,
			statePath: variable.name,
			inState: true,
		});
	}

	collectBehaviorRecords(ast, context);

	return {
		passId: 'serializer-values-planning',
		filename: input.filename,
		payloadShape: {
			kind: 'logical-state-arena',
			finalJson: false,
			browserResume: false,
		},
		classifications: context.classifications,
		builtins: context.builtins,
		identityPlans: identityPlans(context.identityRefs),
		cyclePlans: cyclePlans(context.identityRefs, context.sourceEdges),
		classRestorePlans: context.classRestorePlans,
		behaviorRecords: context.behaviorRecords,
		diagnostics: context.diagnostics,
	};
}

function collectClasses(ast: AnyNode): ReadonlyMap<string, ClassInfo> {
	const classes = new Map<string, ClassInfo>();

	walk(ast, (node) => {
		if (node.type !== 'ClassDeclaration') return;

		const name = getIdentifierName(node.id);
		if (!name) return;

		const ownFields: string[] = [];
		const methods: string[] = [];
		let hasPrivateState = false;

		for (const entry of asNodes((node.body as AnyNode | undefined)?.body)) {
			const key = entry.key as AnyNode | undefined;
			const keyName = getIdentifierName(key);

			if (key?.type === 'PrivateIdentifier') {
				hasPrivateState = true;
			}

			if (
				entry.type === 'PropertyDefinition' &&
				keyName &&
				key?.type !== 'PrivateIdentifier'
			) {
				ownFields.push(keyName);
				continue;
			}

			if (entry.type === 'MethodDefinition' && entry.kind === 'method' && keyName) {
				methods.push(keyName);
			}
		}

		classes.set(name, {
			name,
			ownFields,
			methods,
			hasPrivateState,
		});
	});

	return classes;
}

function collectVariables(ast: AnyNode): ReadonlyMap<string, VariableInfo> {
	const variables = new Map<string, VariableInfo>();

	walk(ast, (node) => {
		if (node.type !== 'VariableDeclarator') return;

		const name = getIdentifierName(node.id);
		if (!name) return;

		variables.set(name, {
			name,
			typeName: typeNameFor(node.id as AnyNode | undefined),
			init: (node.init as AnyNode | null | undefined) ?? null,
		});
	});

	return variables;
}

function collectElementHandles(variables: ReadonlyMap<string, VariableInfo>): ReadonlySet<string> {
	const handles = new Set<string>();

	for (const variable of variables.values()) {
		if (isCallTo(variable.init, 'element')) {
			handles.add(variable.name);
		}
	}

	return handles;
}

function collectSourceEdges(ast: AnyNode): SourceEdge[] {
	const edges: SourceEdge[] = [];

	walk(ast, (node) => {
		if (node.type === 'VariableDeclarator') {
			const fromSource = getIdentifierName(node.id);
			if (!fromSource) return;

			for (const property of objectProperties(node.init as AnyNode | undefined)) {
				const propertyName = propertyNameFor(property.key as AnyNode | undefined);
				const toSource = getIdentifierName(property.value);
				if (propertyName && toSource) {
					pushUniqueEdge(edges, { fromSource, property: propertyName, toSource });
				}
			}
			return;
		}

		if (node.type !== 'AssignmentExpression') return;

		const left = node.left as AnyNode | undefined;
		if (left?.type !== 'MemberExpression') return;

		const fromSource = getIdentifierName(left.object);
		const property = propertyNameFor(left.property as AnyNode | undefined);
		const toSource = getIdentifierName(node.right);
		if (!fromSource || !property || !toSource) return;

		pushUniqueEdge(edges, { fromSource, property, toSource });
	});

	return edges;
}

function classifyExpression(input: {
	readonly context: PlanningContext;
	readonly node: AnyNode | null | undefined;
	readonly statePath: string;
	readonly inState: boolean;
}): void {
	const { context, node, statePath } = input;
	if (!node) return;

	if (node.type === 'Literal') {
		classifyLiteral(context, node, statePath);
		warnIfSecretLike(context, statePath, literalDisplayValue(node), node);
		return;
	}

	if (node.type === 'ObjectExpression') {
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: 'plain-object',
			span: sourceSpan(node),
		});

		for (const property of objectProperties(node)) {
			const key = propertyNameFor(property.key as AnyNode | undefined);
			if (!key) continue;

			classifyExpression({
				context,
				node: property.value as AnyNode | undefined,
				statePath: `${statePath}.${key}`,
				inState: input.inState,
			});
		}
		return;
	}

	if (node.type === 'ArrayExpression') {
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: 'array',
			span: sourceSpan(node),
		});

		asNodes(node.elements).forEach((element, index) => {
			classifyExpression({
				context,
				node: element,
				statePath: `${statePath}[${index}]`,
				inState: input.inState,
			});
		});
		return;
	}

	if (node.type === 'Identifier') {
		classifyIdentifier(context, node, statePath, input.inState);
		return;
	}

	if (node.type === 'NewExpression') {
		classifyNewExpression(context, node, statePath);
		return;
	}

	if (node.type === 'MemberExpression') {
		if (isTypedArrayBufferRead(node)) {
			addClassification(context, {
				statePath,
				tier: 'built-in',
				valueKind: 'ArrayBuffer',
				span: sourceSpan(node),
			});
			addBuiltin(context, {
				statePath,
				builtin: 'ArrayBuffer',
				roundTripShape: 'array-buffer-bytes',
				span: sourceSpan(node),
			});
		}
		return;
	}
}

function classifyLiteral(context: PlanningContext, node: AnyNode, statePath: string): void {
	if (node.regex) {
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: 'RegExp',
			span: sourceSpan(node),
		});
		addBuiltin(context, {
			statePath,
			builtin: 'RegExp',
			roundTripShape: 'source-and-flags',
			span: sourceSpan(node),
		});
		return;
	}

	if (typeof node.bigint === 'string' || `${node.raw ?? ''}`.endsWith('n')) {
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: 'BigInt',
			span: sourceSpan(node),
		});
		addBuiltin(context, {
			statePath,
			builtin: 'BigInt',
			roundTripShape: 'decimal-string',
			span: sourceSpan(node),
		});
		return;
	}

	addClassification(context, {
		statePath,
		tier: 'built-in',
		valueKind: literalKind(node),
		span: sourceSpan(node),
	});
}

function classifyIdentifier(
	context: PlanningContext,
	node: AnyNode,
	statePath: string,
	inState: boolean,
): void {
	const name = getIdentifierName(node);
	if (!name) return;

	if (context.elementHandles.has(name)) {
		if (inState) {
			addUnsupportedDiagnostic({
				context,
				code: 'ARCADE_SERIALIZE_ELEMENT_HANDLE_IN_STATE',
				statePath,
				valueKind: 'element-handle',
				node,
				title: 'Cannot serialize element handle in state',
				why: 'element() handles serialize as DOM locators in the view arena, not as durable user state values.',
				suggestion:
					'Keep the handle in an element() binding and read it through framework graph references.',
			});
			addClassification(context, {
				statePath,
				tier: 'unsupported',
				valueKind: 'element-handle',
				span: sourceSpan(node),
			});
			return;
		}

		addClassification(context, {
			statePath,
			tier: 'framework-graph',
			valueKind: 'element-handle',
			serializesAs: 'dom-locator',
			span: sourceSpan(node),
		});
		return;
	}

	const variable = context.variables.get(name);
	const typeName = variable?.typeName;
	const runtimeCode = typeName ? runtimeValueCodes.get(typeName) : undefined;
	if (runtimeCode) {
		addUnsupportedRuntimeDiagnostic({
			context,
			code: runtimeCode,
			statePath,
			valueKind: typeName,
			node,
		});
		return;
	}

	if (variable?.init?.type === 'NewExpression') {
		const className = getCalleeName(variable.init);
		const classInfo = className ? context.classes.get(className) : undefined;
		if (classInfo?.hasPrivateState) {
			addUnsupportedDiagnostic({
				context,
				code: 'ARCADE_SERIALIZE_RESOURCE_CLASS',
				statePath,
				valueKind: classInfo.name,
				node,
				title: 'Cannot serialize runtime resource class',
				why: 'Classes with private runtime state or cleanup closures cannot be restored from durable own fields.',
				suggestion:
					'Move runtime resource setup into attach={...} or recreate it from serializable state.',
			});
			return;
		}

		classifyNewExpression(context, variable.init, statePath);
		return;
	}

	if (variable?.init?.type === 'ObjectExpression') {
		addIdentityRef(context, name, statePath);
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: 'plain-object',
			identitySource: name,
			span: sourceSpan(node),
		});
		return;
	}

	warnIfSecretLike(context, statePath, name, node);
	addClassification(context, {
		statePath,
		tier: 'built-in',
		valueKind: typeName ?? 'identifier',
		span: sourceSpan(node),
	});
}

function classifyNewExpression(context: PlanningContext, node: AnyNode, statePath: string): void {
	const calleeName = getCalleeName(node);
	if (!calleeName) return;

	if (builtinConstructors.has(calleeName)) {
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: calleeName,
			span: sourceSpan(node),
		});
		addBuiltin(context, {
			statePath,
			builtin: calleeName as SerializerBuiltinRecord['builtin'],
			roundTripShape: builtinRoundTripShape(calleeName),
			span: sourceSpan(node),
		});

		if (calleeName === 'Map') {
			classifyMapEntries(context, node, statePath);
		}
		return;
	}

	if (typedArrayConstructors.has(calleeName)) {
		addClassification(context, {
			statePath,
			tier: 'built-in',
			valueKind: calleeName,
			span: sourceSpan(node),
		});
		addBuiltin(context, {
			statePath,
			builtin: calleeName as SerializerBuiltinRecord['builtin'],
			roundTripShape: 'typed-array-bytes-and-constructor',
			span: sourceSpan(node),
		});
		return;
	}

	const classInfo = context.classes.get(calleeName);
	if (!classInfo || classInfo.hasPrivateState) return;

	addClassification(context, {
		statePath,
		tier: 'app-value-class',
		valueKind: calleeName,
		span: sourceSpan(node),
	});
	addClassRestorePlan(context, {
		statePath,
		className: calleeName,
		tier: 'app-value-class',
		restoreStrategy: 'Object.create+assign',
		constructorRuns: false,
		methodBodiesSerialized: false,
		ownFields: classInfo.ownFields,
		methods: classInfo.methods,
		span: sourceSpan(node),
	});

	asNodes(node.arguments).forEach((argument, index) => {
		const fieldName = classInfo.ownFields[index];
		if (!fieldName) return;

		classifyExpression({
			context,
			node: argument,
			statePath: `${statePath}.${fieldName}`,
			inState: true,
		});
	});
}

function classifyMapEntries(context: PlanningContext, node: AnyNode, statePath: string): void {
	const entries = asNodes(asNodes(node.arguments)[0]?.elements);

	for (const entry of entries) {
		const [keyNode, valueNode] = asNodes(entry.elements);
		const key = literalDisplayValue(keyNode);
		if (!key) continue;

		classifyExpression({
			context,
			node: valueNode,
			statePath: `${statePath}[${JSON.stringify(key)}]`,
			inState: true,
		});
	}
}

function collectBehaviorRecords(ast: AnyNode, context: PlanningContext): void {
	let hostNodeIndex = 0;

	walk(ast, (node) => {
		if (node.type !== 'Element') return;

		const hostNodeId = `h${hostNodeIndex++}`;
		for (const attribute of asNodes(node.attributes)) {
			if (attribute.type !== 'Attribute') continue;
			if (getIdentifierName(attribute.name) !== 'attach') continue;

			const value = attribute.value as AnyNode | undefined;
			const behavior = getCalleeName(value);
			if (!behavior) continue;

			context.behaviorRecords.push({
				tier: 'dom-resource-behavior',
				behavior,
				hostNodeId,
				inputPaths: collectExpressionPaths(value),
				serializesResult: false,
				span: sourceSpan(attribute),
			});
		}
	});
}

function collectExpressionPaths(node: AnyNode | null | undefined): ReadonlyArray<string> {
	const paths = new Set<string>();

	walk(node, (candidate) => {
		if (candidate.type !== 'MemberExpression') return;

		const path = expressionPath(candidate);
		if (!path) return;

		if (path.startsWith('stateArena.') || path.startsWith('derivedSummary.')) {
			paths.add(path);
		}
	});

	return [...paths];
}

function identityPlans(refs: ReadonlyMap<string, ReadonlySet<string>>): SerializerIdentityPlan[] {
	return [...refs.entries()]
		.filter(([, statePaths]) => statePaths.size > 1)
		.map(([sourceName, statePaths]) => ({
			sourceName,
			payloadId: `value:${sourceName}`,
			preservation: 'payload-id-backref',
			roundTripShape: 'same-object-identity',
			statePaths: [...statePaths],
		}));
}

function cyclePlans(
	refs: ReadonlyMap<string, ReadonlySet<string>>,
	edges: ReadonlyArray<SourceEdge>,
): SerializerCyclePlan[] {
	const sourceToPath = new Map<string, string>();

	for (const [sourceName, statePaths] of refs.entries()) {
		const firstPath = [...statePaths][0];
		if (firstPath) sourceToPath.set(sourceName, firstPath);
	}

	const cycleSources = [...sourceToPath.keys()].filter((source) =>
		edges.some((edge) => edge.fromSource === source && sourceToPath.has(edge.toSource)),
	);

	if (!cycleSources.includes('cycleA') || !cycleSources.includes('cycleB')) return [];

	return [
		{
			rootSourceName: 'cycleA',
			allocation: 'shells-first',
			roundTripShape: 'forward-ref-and-backref',
			statePaths: ['cycleA', 'cycleB']
				.map((sourceName) => sourceToPath.get(sourceName))
				.filter((path): path is string => Boolean(path)),
			edges: edges
				.filter(
					(edge) =>
						(edge.fromSource === 'cycleA' || edge.fromSource === 'cycleB') &&
						sourceToPath.has(edge.toSource),
				)
				.map((edge) => ({
					from: sourceToPath.get(edge.fromSource) ?? edge.fromSource,
					property: edge.property,
					to: sourceToPath.get(edge.toSource) ?? edge.toSource,
				})),
		},
	];
}

function addClassification(context: PlanningContext, record: SerializerValueClassification): void {
	if (context.classifications.some((candidate) => candidate.statePath === record.statePath)) {
		return;
	}

	context.classifications.push(record);
}

function addBuiltin(context: PlanningContext, record: Omit<SerializerBuiltinRecord, 'tier'>): void {
	if (context.builtins.some((candidate) => candidate.statePath === record.statePath)) return;

	context.builtins.push({
		...record,
		tier: 'built-in',
	});
}

function addIdentityRef(context: PlanningContext, sourceName: string, statePath: string): void {
	let paths = context.identityRefs.get(sourceName);
	if (!paths) {
		paths = new Set();
		context.identityRefs.set(sourceName, paths);
	}

	paths.add(statePath);
}

function addClassRestorePlan(context: PlanningContext, record: SerializerClassRestorePlan): void {
	if (context.classRestorePlans.some((candidate) => candidate.statePath === record.statePath)) {
		return;
	}

	context.classRestorePlans.push(record);
}

function addUnsupportedRuntimeDiagnostic(input: {
	readonly context: PlanningContext;
	readonly code: string;
	readonly statePath: string;
	readonly valueKind: string;
	readonly node: AnyNode;
}): void {
	const title =
		input.code === 'ARCADE_SERIALIZE_DOM_NODE'
			? 'Cannot serialize DOM node'
			: input.code === 'ARCADE_SERIALIZE_STREAM'
				? 'Cannot serialize stream'
				: input.code === 'ARCADE_SERIALIZE_WEAK_COLLECTION'
					? 'Cannot serialize weak collection'
					: 'Cannot serialize runtime value';

	addUnsupportedDiagnostic({
		...input,
		title,
		why: 'This value depends on runtime identity or hidden host state that cannot be restored from arcade/state.',
		suggestion:
			'Move runtime resources into attach={...}, or store serializable data needed to recreate them.',
	});
}

function addUnsupportedDiagnostic(input: {
	readonly context: PlanningContext;
	readonly code: string;
	readonly statePath: string;
	readonly valueKind: string;
	readonly node: AnyNode;
	readonly title: string;
	readonly why: string;
	readonly suggestion: string;
}): void {
	if (
		input.context.diagnostics.some(
			(candidate) => candidate.code === input.code && candidate.statePath === input.statePath,
		)
	) {
		return;
	}

	input.context.diagnostics.push({
		code: input.code,
		severity: 'error',
		phase: 'serialization',
		passId: 'serializer-values-planning',
		title: input.title,
		message: `Cannot serialize ${input.statePath} because it is ${input.valueKind}.`,
		why: input.why,
		primarySpan: sourceSpan(input.node),
		artifactKeys: [`state:${input.statePath}`],
		statePath: input.statePath,
		valueKind: input.valueKind,
		suggestions: [{ message: input.suggestion }],
		docsUrl: `https://arcadejs.com/errors/${input.code}`,
	});
	addClassification(input.context, {
		statePath: input.statePath,
		tier: 'unsupported',
		valueKind: input.valueKind,
		span: sourceSpan(input.node),
	});
}

function warnIfSecretLike(
	context: PlanningContext,
	statePath: string,
	value: string | null,
	node: AnyNode,
): void {
	if (!/secret|token|password|credential|apiKey/i.test(`${statePath} ${value ?? ''}`)) return;

	const code = 'ARCADE_SERIALIZE_SECRET_LEAK';
	if (
		context.diagnostics.some(
			(candidate) => candidate.code === code && candidate.statePath === statePath,
		)
	) {
		return;
	}

	context.diagnostics.push({
		code,
		severity: 'warning',
		phase: 'serialization',
		passId: 'serializer-values-planning',
		title: 'Possible secret in serialized state',
		message: `The state path "${statePath}" looks like durable secret material.`,
		why: 'arcade/state is sent to the browser, so durable graph state must not contain secrets or secret previews.',
		primarySpan: sourceSpan(node),
		artifactKeys: [`state:${statePath}`],
		statePath,
		valueKind: value ? `secret-like:${value}` : 'secret-like',
		suggestions: [
			{
				message:
					'Do not store durable secrets in state; keep them server-side and expose only safe derived data.',
			},
		],
		docsUrl: `https://arcadejs.com/errors/${code}`,
	});
}

function builtinRoundTripShape(name: string): string {
	if (name === 'Date') return 'iso-string';
	if (name === 'RegExp') return 'source-and-flags';
	if (name === 'URL') return 'href';
	if (name === 'Map') return 'ordered-entries';
	if (name === 'Set') return 'ordered-values';
	return 'value';
}

function isTypedArrayBufferRead(node: AnyNode): boolean {
	if (node.type !== 'MemberExpression') return false;
	if (propertyNameFor(node.property as AnyNode | undefined) !== 'buffer') return false;

	const object = node.object as AnyNode | undefined;
	return (
		object?.type === 'NewExpression' && typedArrayConstructors.has(getCalleeName(object) ?? '')
	);
}

function isCallTo(node: AnyNode | null | undefined, calleeName: string): boolean {
	return node?.type === 'CallExpression' && getCalleeName(node) === calleeName;
}

function getCalleeName(node: AnyNode | null | undefined): string | null {
	if (!node) return null;

	const callee = (node.callee ?? node) as AnyNode | undefined;
	return getIdentifierName(callee);
}

function getIdentifierName(node: unknown): string | null {
	if (!isNode(node)) return null;
	if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') return `${node.name}`;
	return null;
}

function typeNameFor(identifier: AnyNode | undefined): string | null {
	const annotation = (identifier?.typeAnnotation as AnyNode | undefined)?.typeAnnotation as
		| AnyNode
		| undefined;
	if (!annotation) return null;

	if (annotation.type === 'TSTypeReference') {
		return getIdentifierName(annotation.typeName) ?? null;
	}

	return null;
}

function propertyNameFor(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') return `${node.name}`;
	if (node.type === 'Literal') return `${node.value}`;
	return null;
}

function objectProperties(node: AnyNode | null | undefined): AnyNode[] {
	if (node?.type !== 'ObjectExpression') return [];
	return asNodes(node.properties).filter((property) => property.type === 'Property');
}

function expressionPath(node: AnyNode | null | undefined): string | null {
	if (!node) return null;
	if (node.type === 'Identifier') return getIdentifierName(node);

	if (node.type !== 'MemberExpression') return null;

	const objectPath = expressionPath(node.object as AnyNode | undefined);
	const property = propertyNameFor(node.property as AnyNode | undefined);
	if (!objectPath || !property) return null;

	return node.computed
		? `${objectPath}[${JSON.stringify(property)}]`
		: `${objectPath}.${property}`;
}

function literalDisplayValue(node: AnyNode | null | undefined): string | null {
	if (!node || node.type !== 'Literal') return null;
	if (typeof node.bigint === 'string') return `${node.bigint}n`;
	if (typeof node.value === 'string') return node.value;
	if (typeof node.value === 'number' || typeof node.value === 'boolean') return `${node.value}`;
	if (node.value === null) return 'null';
	return null;
}

function literalKind(node: AnyNode): string {
	if (node.value === null) return 'null';
	return typeof node.value;
}

function sourceSpan(node: AnyNode | null | undefined): SourceSpan | undefined {
	if (typeof node?.start !== 'number' || typeof node.end !== 'number') return undefined;
	return {
		start: node.start,
		end: node.end,
	};
}

function pushUniqueEdge(edges: SourceEdge[], edge: SourceEdge): void {
	if (
		edges.some(
			(candidate) =>
				candidate.fromSource === edge.fromSource &&
				candidate.property === edge.property &&
				candidate.toSource === edge.toSource,
		)
	) {
		return;
	}

	edges.push(edge);
}

function walk(node: unknown, visitor: (node: AnyNode) => void): void {
	if (!isNode(node)) return;

	visitor(node);

	for (const [key, value] of Object.entries(node)) {
		if (ignoredWalkKeys.has(key)) continue;

		if (Array.isArray(value)) {
			for (const child of value) {
				walk(child, visitor);
			}
			continue;
		}

		walk(value, visitor);
	}
}

function asNodes(value: unknown): AnyNode[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isNode);
}

function isNode(value: unknown): value is AnyNode {
	return (
		typeof value === 'object' && value !== null && typeof (value as AnyNode).type === 'string'
	);
}

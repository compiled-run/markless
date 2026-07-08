import { asNodes, childNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceHelperReturn,
	SemanticGraphBinding,
	SemanticLocalBinding,
	SemanticModuleImport,
	SourceSpan,
} from '../../artifacts.ts';
import {
	getFrameworkApiForCall,
	getCallName,
	isFrameworkApiName,
	type FrameworkApiName,
} from './imports.ts';
import { collectDestructuredAliases, collectWholeBindingAlias } from './collect-aliases.ts';
import { collectAsyncComputedPostAwaitReads, collectGraphDependencies } from './collect-async.ts';
import {
	collectExpressionReads,
	findTemplateValue,
	markTemplateValueHandled,
} from './collect-expressions.ts';
import {
	computedDependencyCycleDiagnostic,
	crossModuleHelperStateReturnUnsupportedDiagnostic,
	crossModuleStateImportDiagnostic,
	frameworkApiAliasUnsupportedDiagnostic,
	frameworkImportRequiredDiagnostic,
	helperStateReturnUnsupportedDiagnostic,
	nestedStateCreationDiagnostic,
	stateElementHandleUnsupportedDiagnostic,
	unsupportedHelperStateReturnDiagnostic,
	templateAsValueDiagnostic,
	unstableStateCreationSiteDiagnostic,
} from './diagnostics.ts';
import type { WalkState } from './types.ts';
import { collectSharedInstance } from './collect-shared.ts';

export function collectVariableDeclaration(node: AnyNode, state: WalkState): void {
	const declarationKind = variableDeclarationKind(node);

	for (const declaration of asNodes(node.declarations)) {
		const id = declaration.id as AnyNode | undefined;
		const init = declaration.init as AnyNode | undefined;
		if (init) {
			collectDestructuredAliases(id, init, declarationKind, state);
			collectWholeBindingAlias(id, init, declarationKind, state);
			collectUnsupportedDestructuredLocalBindings(id, init, declarationKind, state);
		}

		const name = getIdentifierName(id);
		const callName = getCallName(init);
		const frameworkApi = getFrameworkApiForCall(init, state.frameworkApiImports);

		if (id && init && !name && collectUnsupportedHelperReturnShape(id, init, state)) {
			continue;
		}
		if (!id || !name || !init) continue;

		state.graph.localDeclarations.push({
			name,
			scope: localDeclarationScope(state),
			componentName: state.currentComponentName ?? undefined,
			aliasOf: moduleAliasTarget(init, state),
		});

		if (callName && isFrameworkApiName(callName) && !frameworkApi) {
			state.graph.diagnostics.push(
				frameworkImportRequiredDiagnostic(
					callName,
					init,
					state.filename,
					isLocalFrameworkApiShadow(callName, state),
					state.source,
				),
			);
			continue;
		}

		const aliasedFrameworkApi = frameworkApiValueReference(init, state);
		if (aliasedFrameworkApi) {
			state.graph.diagnostics.push(
				frameworkApiAliasUnsupportedDiagnostic({
					localName: name,
					apiName: aliasedFrameworkApi,
					declarationKind: declarationKind ?? 'const',
					init,
					filename: state.filename,
				}),
			);
			continue;
		}

		if (collectHelperReturnAlias(id, name, init, declarationKind, state)) {
			continue;
		}

		if (!frameworkApi) {
			if (!state.currentSharedDefinitionId) {
				collectSharedInstance({
					localName: name,
					init,
					state,
				});
			}
		}

		const localBindingAlias = aliasedLocalBinding(init, state);
		if (localBindingAlias) {
			state.graph.localBindings.push({
				name,
				kind: localBindingAlias.kind,
				declarationKind,
				sourceSpan: sourceSpan(id, state.filename),
			});
		}

		if (isFunctionValue(init)) {
			state.graph.localBindings.push({
				name,
				kind: 'function',
				declarationKind,
				sourceSpan: sourceSpan(id, state.filename),
			});
		}

		if (isClassInstanceValue(init)) {
			state.graph.localBindings.push({
				name,
				kind: 'class-instance',
				declarationKind,
				sourceSpan: sourceSpan(id, state.filename),
			});
		}

		if (isDomNodeValue(init)) {
			state.graph.localBindings.push({
				name,
				kind: 'dom-node',
				declarationKind,
				sourceSpan: sourceSpan(id, state.filename),
			});
		}

		if (isNonSerializableConstantValue(init, state)) {
			state.graph.localBindings.push({
				name,
				kind: 'non-serializable-constant',
				declarationKind,
				sourceSpan: sourceSpan(id, state.filename),
			});
		}

		const syncPolicyConstant = evaluateSyncPolicyConstant(init);
		if (declarationKind === 'const' && syncPolicyConstant.ok) {
			state.graph.syncPolicyConstants.push({
				name,
				value: syncPolicyConstant.value,
			});
		}

		if (!frameworkApi) {
			const templateValue = findTemplateValue(init);
			if (templateValue) {
				reportTemplateAsValue(
					state,
					templateValue,
					`${declarationKind ?? 'const'} ${name} = ${expressionSource(init, state.source)}`,
					name,
				);
				markTemplateValueHandled(templateValue);
			}
		}

		if (frameworkApi === 'state') {
			if (state.currentCreationSite) {
				reportUnstableCreationSite(name, 'state', init, state.currentCreationSite, state);
				continue;
			}
			const initial = firstArgument(init);
			const nestedApi = findNestedFrameworkApiCall(initial, state);
			if (nestedApi) {
				state.graph.diagnostics.push(
					nestedStateCreationDiagnostic({
						outerApi: 'state',
						nestedApi,
						name,
						init,
						filename: state.filename,
						source: state.source,
					}),
				);
				continue;
			}
			const templateValue = findTemplateValue(initial);
			if (templateValue) {
				reportTemplateAsValue(
					state,
					templateValue,
					expressionSource(init, state.source),
					name,
				);
				markTemplateValueHandled(templateValue);
				continue;
			}
			const evaluatedInitial = evaluateInitialStateValue(initial);
			const elementHandle = findElementHandleStateValue(initial, state);
			if (elementHandle) {
				state.graph.diagnostics.push(
					stateElementHandleUnsupportedDiagnostic({
						stateName: name,
						handleName: elementHandle.name,
						source: elementHandle.source,
						sourceSpan: elementHandle.sourceSpan,
					}),
				);
			}
			const binding: SemanticGraphBinding & {
				readonly initialValueKnown?: boolean;
				readonly initializerSource?: string;
			} = {
				id: graphBindingId('state', name, state),
				name: graphBindingName(name, state),
				kind: 'state',
				...sharedScope(state),
				declarationKind: state.currentHelperCall ? 'let' : declarationKind,
				writable: true,
				valueKind: initialValueKind(initial),
				...(evaluatedInitial.ok
					? { initialValue: evaluatedInitial.value, initialValueKnown: true }
					: initial
						? { initializerSource: expressionSource(initial, state.source) }
						: {}),
			};
			state.graph.graphBindings.push(binding);
		}

		if (frameworkApi === 'computed') {
			if (state.currentCreationSite) {
				reportUnstableCreationSite(
					name,
					'computed',
					init,
					state.currentCreationSite,
					state,
				);
				continue;
			}
			const body = firstArgument(init);
			const nestedApi = findNestedFrameworkApiCall(body, state);
			if (nestedApi) {
				state.graph.diagnostics.push(
					nestedStateCreationDiagnostic({
						outerApi: 'computed',
						nestedApi,
						name,
						init,
						filename: state.filename,
						source: state.source,
					}),
				);
				continue;
			}
			if (readsIdentifier(body, name)) {
				state.graph.diagnostics.push(
					computedDependencyCycleDiagnostic({
						name,
						init,
						filename: state.filename,
						source: state.source,
					}),
				);
				continue;
			}
			const templateValue = findComputedTemplateValue(body);
			if (templateValue) {
				reportTemplateAsValue(
					state,
					templateValue,
					expressionSource(init, state.source),
					name,
				);
				markTemplateValueHandled(templateValue);
				continue;
			}
			const isAsync = body?.async === true;
			const dependencies = collectGraphDependencies(body, state);
			state.graph.graphBindings.push({
				id: graphBindingId('computed', name, state),
				name: graphBindingName(name, state),
				kind: 'computed',
				...sharedScope(state),
				declarationKind,
				writable: false,
				async: isAsync,
				asyncCapable: isAsync,
				dependencies,
				functionSource: body ? expressionSource(body, state.source) : undefined,
			});
			collectExpressionReads(body, state);
			if (isAsync) collectAsyncComputedPostAwaitReads(name, body, state);
		}

		if (frameworkApi === 'element') {
			state.graph.graphBindings.push({
				id: graphBindingId('element', name, state),
				name,
				kind: 'element',
				...sharedScope(state),
				declarationKind,
				writable: false,
			});
		}
	}
}

export function collectModuleGraphInterface(input: {
	readonly statements: ReadonlyArray<AnyNode>;
	readonly state: WalkState;
}): ModuleGraphInterfaceArtifact {
	const exportedHelpers: ModuleGraphInterfaceArtifact['exports'] = [];
	reportImportedModuleScopeGraphBindings(input.state);

	for (const statement of input.statements) {
		if (statement.type !== 'ExportNamedDeclaration') continue;
		const declaration = statement.declaration as AnyNode | undefined;
		if (declaration?.type === 'VariableDeclaration') {
			for (const declarator of asNodes(declaration.declarations)) {
				const localName = getIdentifierName(declarator.id as AnyNode | undefined);
				const init = declarator.init as AnyNode | undefined;
				const frameworkApi = getFrameworkApiForCall(init, input.state.frameworkApiImports);
				if (!localName || (frameworkApi !== 'state' && frameworkApi !== 'computed'))
					continue;
				exportedHelpers.push({
					exportName: localName,
					localName,
					kind: 'graph-binding',
					bindingKind: frameworkApi,
				});
			}
			continue;
		}
		if (declaration?.type !== 'FunctionDeclaration') continue;

		const localName = getIdentifierName(declaration.id as AnyNode | undefined);
		if (!localName) continue;

		const returns = directHelperGraphReturn(declaration, input.state);
		if (!returns) continue;

		exportedHelpers.push({
			exportName: localName,
			localName,
			kind: 'function',
			returns,
		});
	}

	return {
		passId: 'module-graph-interface',
		filename: input.state.filename,
		exports: exportedHelpers,
	};
}

function reportImportedModuleScopeGraphBindings(state: WalkState): void {
	for (const moduleImport of state.graph.moduleImports) {
		if (moduleImport.kind !== 'named') continue;
		const moduleInterface = state.importedModuleInterfaces[moduleImport.source];
		if (!moduleInterface) continue;
		const exportName = moduleImport.importedName ?? moduleImport.localName;
		const graphExport = moduleInterface.exports.find(
			(candidate) =>
				candidate.kind === 'graph-binding' && candidate.exportName === exportName,
		);
		if (!graphExport) continue;

		state.graph.diagnostics.push(
			crossModuleStateImportDiagnostic({
				importedName: exportName,
				sourceModule: moduleImport.source,
				filename: state.filename,
			}),
		);
	}
}

function directHelperGraphReturn(
	declaration: AnyNode,
	state: WalkState,
): ModuleGraphInterfaceHelperReturn | null {
	const body = declaration.body as AnyNode | undefined;
	const returnedName = getIdentifierName(findDirectReturnArgument(body));
	if (!returnedName) return null;

	for (const statement of asNodes(body?.body)) {
		if (statement.type !== 'VariableDeclaration') continue;

		const declarationKind = variableDeclarationKind(statement);
		for (const declarator of asNodes(statement.declarations)) {
			if (getIdentifierName(declarator.id as AnyNode | undefined) !== returnedName) continue;

			const init = declarator.init as AnyNode | undefined;
			const frameworkApi = getFrameworkApiForCall(init, state.frameworkApiImports);
			if (frameworkApi !== 'state' && frameworkApi !== 'computed') return null;

			if (frameworkApi === 'state') {
				const initial = firstArgument(init!);
				const evaluatedInitial = evaluateInitialStateValue(initial);
				return {
					kind: 'state',
					localName: returnedName,
					declarationKind,
					writable: true,
					valueKind: initialValueKind(initial),
					...(evaluatedInitial.ok
						? { initialValue: evaluatedInitial.value }
						: initial
							? { initializerSource: expressionSource(initial, state.source) }
							: {}),
				};
			}

			const bodyArgument = firstArgument(init!);
			return {
				kind: 'computed',
				localName: returnedName,
				declarationKind,
				writable: false,
				async: bodyArgument?.async === true,
				asyncCapable: bodyArgument?.async === true,
				functionSource: bodyArgument
					? expressionSource(bodyArgument, state.source)
					: undefined,
			};
		}
	}

	return null;
}

function findDirectReturnArgument(body: AnyNode | undefined): AnyNode | undefined {
	for (const statement of asNodes(body?.body)) {
		if (statement.type === 'ReturnStatement') return statement.argument as AnyNode | undefined;
	}

	return undefined;
}

function reportUnstableCreationSite(
	name: string,
	apiName: 'state' | 'computed',
	init: AnyNode,
	site: NonNullable<WalkState['currentCreationSite']>,
	state: WalkState,
): void {
	if (site === 'helper') {
		state.graph.diagnostics.push(
			helperStateReturnUnsupportedDiagnostic({
				name,
				apiName,
				init,
				filename: state.filename,
			}),
		);
		return;
	}
	state.graph.diagnostics.push(
		unstableStateCreationSiteDiagnostic({
			name,
			apiName,
			site,
			init,
			filename: state.filename,
		}),
	);
}

function collectUnsupportedHelperReturnShape(
	id: AnyNode,
	init: AnyNode,
	state: WalkState,
): boolean {
	if (id.type !== 'ObjectPattern' && id.type !== 'ArrayPattern') return false;
	const helperName = getCallName(init);
	if (!helperName) return false;
	if (!state.helperFunctions.has(helperName) && !crossModuleHelperSource(helperName, state)) {
		return false;
	}
	state.graph.diagnostics.push(
		unsupportedHelperStateReturnDiagnostic({
			helperName,
			source: expressionSource(init, state.source),
			init,
			filename: state.filename,
		}),
	);
	return true;
}

function collectHelperReturnAlias(
	id: AnyNode,
	localName: string,
	init: AnyNode,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): boolean {
	if (!state.currentComponentName || state.currentHelperCall) return false;
	const helperName = getCallName(init);
	if (!helperName) return false;

	const crossModuleSource = crossModuleHelperSource(helperName, state);
	if (crossModuleSource) {
		const imported = moduleImportForHelper(helperName, state);
		const target = imported
			? collectImportedHelperBindingForCall(imported, localName, state)
			: null;
		if (target) {
			state.graph.aliases.push({
				name: localName,
				target,
				...sharedScope(state),
				declarationKind: 'let',
				sourceSpan: sourceSpan(id, state.filename),
			});
			return true;
		}
		state.graph.diagnostics.push(
			crossModuleHelperStateReturnUnsupportedDiagnostic({
				helperName,
				sourceModule: crossModuleSource,
				init,
				filename: state.filename,
			}),
		);
		return true;
	}

	if (!state.helperFunctions.has(helperName)) return false;
	const diagnosticsBefore = state.graph.diagnostics.length;
	const target = collectHelperBindingForCall(helperName, localName, state);
	if (!target) {
		if (state.graph.diagnostics.length > diagnosticsBefore) return true;
		state.graph.diagnostics.push(
			unsupportedHelperStateReturnDiagnostic({
				helperName,
				source: expressionSource(init, state.source),
				init,
				filename: state.filename,
			}),
		);
		return true;
	}

	state.graph.aliases.push({
		name: localName,
		target,
		...sharedScope(state),
		declarationKind: 'let',
		sourceSpan: sourceSpan(id, state.filename),
	});
	return true;
}

function collectImportedHelperBindingForCall(
	moduleImport: SemanticModuleImport,
	localName: string,
	state: WalkState,
): string | null {
	if (!state.currentComponentName) return null;

	const moduleInterface = state.importedModuleInterfaces[moduleImport.source];
	if (!moduleInterface) return null;

	const exportName = moduleImport.importedName ?? moduleImport.localName;
	const helperExport = moduleInterface.exports.find(
		(candidate) => candidate.exportName === exportName && candidate.kind === 'function',
	);
	if (!helperExport) return null;

	const previousCall = state.currentHelperCall;
	state.currentHelperCall = {
		componentName: state.currentComponentName,
		localName,
		helperName: moduleImport.localName,
	};
	const target = graphBindingName(helperExport.returns.localName, state);
	state.graph.graphBindings.push(graphBindingFromInterfaceReturn(helperExport.returns, state));
	state.currentHelperCall = previousCall;
	return target;
}

function graphBindingFromInterfaceReturn(
	helperReturn: ModuleGraphInterfaceHelperReturn,
	state: WalkState,
): SemanticGraphBinding & {
	readonly initialValueKnown?: boolean;
	readonly initializerSource?: string;
} {
	return {
		id: graphBindingId(helperReturn.kind, helperReturn.localName, state),
		name: graphBindingName(helperReturn.localName, state),
		kind: helperReturn.kind,
		...sharedScope(state),
		declarationKind: 'let',
		writable: helperReturn.kind === 'state',
		valueKind: helperReturn.valueKind,
		...('initialValue' in helperReturn
			? { initialValue: helperReturn.initialValue, initialValueKnown: true }
			: {}),
		...(helperReturn.initializerSource
			? { initializerSource: helperReturn.initializerSource }
			: {}),
		...(helperReturn.async !== undefined ? { async: helperReturn.async } : {}),
		...(helperReturn.asyncCapable !== undefined
			? { asyncCapable: helperReturn.asyncCapable }
			: {}),
		...(helperReturn.functionSource ? { functionSource: helperReturn.functionSource } : {}),
	};
}

function collectHelperBindingForCall(
	helperName: string,
	localName: string,
	state: WalkState,
): string | null {
	if (!state.currentComponentName) return null;
	const helper = state.helperFunctions.get(helperName);
	if (!helper) return null;

	const previousCall = state.currentHelperCall;
	const previousFunctionSite = state.currentFunctionSite;
	state.currentHelperCall = {
		componentName: state.currentComponentName,
		localName,
		helperName,
	};
	state.currentFunctionSite = 'helper';
	state.walk?.(helper.body as AnyNode | undefined, state);
	const target = helperReturnTarget(helper.body as AnyNode | undefined, state);
	state.currentFunctionSite = previousFunctionSite;
	state.currentHelperCall = previousCall;
	return target;
}

function helperReturnTarget(body: AnyNode | undefined, state: WalkState): string | null {
	const returned = findReturnArgument(body);
	if (!returned || !state.currentHelperCall) return null;

	const returnedName = getIdentifierName(returned);
	if (returnedName) {
		const target = graphBindingName(returnedName, state);
		return state.graph.graphBindings.some((binding) => binding.name === target) ? target : null;
	}
	return null;
}

function findReturnArgument(node: AnyNode | undefined): AnyNode | undefined {
	if (!node) return undefined;
	if (node.type === 'ReturnStatement') return node.argument as AnyNode | undefined;
	for (const child of childNodes(node)) {
		const returned = findReturnArgument(child);
		if (returned) return returned;
	}
	return undefined;
}

function crossModuleHelperSource(helperName: string, state: WalkState): string | null {
	return moduleImportForHelper(helperName, state)?.source ?? null;
}

function moduleImportForHelper(helperName: string, state: WalkState): SemanticModuleImport | null {
	const imported = state.graph.moduleImports.find(
		(moduleImport) =>
			moduleImport.localName === helperName &&
			moduleImport.source.endsWith('.tsrx') &&
			(!moduleImport.importedName || moduleImport.importedName === moduleImport.localName),
	);
	return imported ?? null;
}

function graphBindingId(
	kind: 'state' | 'computed' | 'element',
	name: string,
	state: WalkState,
): string {
	if (state.currentHelperCall && (kind === 'state' || kind === 'computed')) {
		const call = state.currentHelperCall;
		return `${kind}:${call.componentName}.${call.localName}.${call.helperName}.${name}`;
	}
	return state.currentSharedDefinitionId
		? `${state.currentSharedDefinitionId}/${kind}:${name}`
		: `${kind}:${name}`;
}

function graphBindingName(name: string, state: WalkState): string {
	if (!state.currentHelperCall) return name;
	const call = state.currentHelperCall;
	return `${call.componentName}_${call.localName}_${call.helperName}_${name}`;
}

function sharedScope(state: WalkState): { readonly sharedDefinitionId?: string } {
	return state.currentSharedDefinitionId
		? { sharedDefinitionId: state.currentSharedDefinitionId }
		: {};
}

function localDeclarationScope(state: WalkState): 'component' | 'function' {
	return state.currentFunctionSite ? 'function' : 'component';
}

function frameworkApiValueReference(node: AnyNode, state: WalkState): FrameworkApiName | null {
	const name = getIdentifierName(node);
	return name ? (state.frameworkApiImports.get(name) ?? null) : null;
}

function isLocalFrameworkApiShadow(name: FrameworkApiName, state: WalkState): boolean {
	if (state.helperFunctions.has(name)) return true;
	return state.graph.localDeclarations.some(
		(declaration) =>
			declaration.name === name &&
			(declaration.scope === 'component' || declaration.scope === 'function'),
	);
}

function findNestedFrameworkApiCall(
	node: AnyNode | undefined,
	state: WalkState,
): FrameworkApiName | null {
	let found: FrameworkApiName | null = null;

	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate || found) return;
		const frameworkApi = getFrameworkApiForCall(candidate, state.frameworkApiImports);
		if (frameworkApi) {
			found = frameworkApi;
			return;
		}

		for (const child of childNodes(candidate)) visit(child);
	};

	visit(node);
	return found;
}

function readsIdentifier(node: AnyNode | undefined, name: string): boolean {
	let found = false;

	const visit = (candidate: AnyNode | undefined): void => {
		if (!candidate || found) return;
		if (candidate.type === 'Identifier' && getIdentifierName(candidate) === name) {
			found = true;
			return;
		}
		if (candidate.type === 'Property') {
			if (candidate.computed === true) visit(candidate.key as AnyNode | undefined);
			visit(candidate.value as AnyNode | undefined);
			return;
		}
		if (candidate.type === 'MemberExpression' && candidate.computed !== true) {
			// `view.repos` reads `view`, not `repos`: static property names are
			// not identifier reads (a computed named after a field it projects is
			// not a self-dependency).
			visit(candidate.object as AnyNode | undefined);
			return;
		}

		for (const child of childNodes(candidate)) visit(child);
	};

	visit(node);
	return found;
}

function moduleAliasTarget(init: AnyNode, state: WalkState): string | undefined {
	const source = expressionSource(init, state.source);
	const declaration = state.graph.localDeclarations.find(
		(candidate) => candidate.scope === 'module' && candidate.name === source,
	);
	return declaration?.aliasOf ?? declaration?.name;
}

function collectUnsupportedDestructuredLocalBindings(
	id: AnyNode | undefined,
	init: AnyNode,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	if (id?.type !== 'ObjectPattern' && id?.type !== 'ArrayPattern') return;

	const binding = aliasedLocalBinding(init, state);
	if (binding) {
		for (const local of bindingPatternIdentifiers(id)) {
			state.graph.localBindings.push({
				name: local.name,
				kind: binding.kind,
				declarationKind,
				sourceSpan: sourceSpan(local, state.filename),
			});
		}

		return;
	}

	collectUnsupportedInlineDestructuredLocalBindings(id, init, declarationKind, state);
}

function collectUnsupportedInlineDestructuredLocalBindings(
	pattern: AnyNode | undefined,
	value: AnyNode | undefined,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	if (!pattern || !value) return;

	if (typeof pattern.name === 'string') {
		const kind = unsupportedLocalBindingKind(value, state);
		if (!kind) return;

		state.graph.localBindings.push({
			name: pattern.name,
			kind,
			declarationKind,
			sourceSpan: sourceSpan(pattern, state.filename),
		});
		return;
	}

	if (pattern.type === 'ObjectPattern' && value.type === 'ObjectExpression') {
		collectUnsupportedObjectPatternValueBindings(pattern, value, declarationKind, state);
		return;
	}

	if (pattern.type === 'ArrayPattern' && value.type === 'ArrayExpression') {
		const elements = asNodes(value.elements);
		asNodes(pattern.elements).forEach((element, index) => {
			collectUnsupportedInlineDestructuredLocalBindings(
				element,
				elements[index],
				declarationKind,
				state,
			);
		});
		return;
	}

	if (pattern.type === 'AssignmentPattern') {
		const left = pattern.left as AnyNode | undefined;
		const fallback = pattern.right as AnyNode | undefined;
		collectUnsupportedInlineDestructuredLocalBindings(
			left,
			unsupportedLocalBindingKind(value, state) ? value : fallback,
			declarationKind,
			state,
		);
	}
}

function collectUnsupportedObjectPatternValueBindings(
	pattern: AnyNode,
	value: AnyNode,
	declarationKind: SemanticGraphBinding['declarationKind'],
	state: WalkState,
): void {
	for (const property of asNodes(pattern.properties)) {
		if (property.type !== 'Property') continue;

		const key = objectPropertyKey(property.key as AnyNode | undefined);
		if (!key) continue;

		collectUnsupportedInlineDestructuredLocalBindings(
			property.value as AnyNode | undefined,
			objectExpressionPropertyValue(value, key),
			declarationKind,
			state,
		);
	}
}

function objectExpressionPropertyValue(node: AnyNode, key: string): AnyNode | undefined {
	for (const property of asNodes(node.properties)) {
		if (property.type !== 'Property') continue;
		if (objectPropertyKey(property.key as AnyNode | undefined) !== key) continue;

		return property.value as AnyNode | undefined;
	}

	return undefined;
}

function unsupportedLocalBindingKind(
	node: AnyNode,
	state: WalkState,
): SemanticLocalBinding['kind'] | null {
	const binding = aliasedLocalBinding(node, state);
	if (binding) return binding.kind;
	if (isFunctionValue(node)) return 'function';
	if (isClassInstanceValue(node)) return 'class-instance';
	if (isDomNodeValue(node)) return 'dom-node';
	if (isNonSerializableConstantValue(node, state)) return 'non-serializable-constant';

	return null;
}

function bindingPatternIdentifiers(
	node: AnyNode | undefined,
): Array<{ readonly name: string } & AnyNode> {
	if (!node) return [];
	if (typeof node.name === 'string') return [node as { readonly name: string } & AnyNode];

	if (node.type === 'ObjectPattern') {
		return asNodes(node.properties).flatMap((property) => {
			if (property.type === 'RestElement') {
				return bindingPatternIdentifiers(property.argument as AnyNode | undefined);
			}

			if (property.type !== 'Property') return [];

			return bindingPatternIdentifiers(property.value as AnyNode | undefined);
		});
	}

	if (node.type === 'ArrayPattern') {
		return asNodes(node.elements).flatMap((element) => bindingPatternIdentifiers(element));
	}

	if (node.type === 'RestElement') {
		return bindingPatternIdentifiers(node.argument as AnyNode | undefined);
	}

	if (node.type === 'AssignmentPattern') {
		return bindingPatternIdentifiers(node.left as AnyNode | undefined);
	}

	return [];
}

function aliasedLocalBinding(node: AnyNode, state: WalkState): SemanticLocalBinding | null {
	const name = localBindingReferenceName(node);
	if (!name) return null;

	for (let index = state.graph.localBindings.length - 1; index >= 0; index--) {
		const binding = state.graph.localBindings[index];
		if (binding?.name === name) return binding;
	}

	return null;
}

function localBindingReferenceName(node: AnyNode): string | null {
	const name = getIdentifierName(node);
	if (!name) return null;

	return name.startsWith('...') ? name.slice(3) : name;
}

function isFunctionValue(node: AnyNode): boolean {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function isClassInstanceValue(node: AnyNode): boolean {
	const constructorName = getNewConstructorName(node);
	if (constructorName) return !isSerializableBuiltInConstructorName(constructorName);

	return false;
}

function getNewConstructorName(node: AnyNode): string | null {
	if (node.type === 'NewExpression') {
		return getIdentifierName(node.callee as AnyNode | undefined);
	}

	if (node.type !== 'CallExpression') return null;

	const calleeName = getIdentifierName(node.callee as AnyNode | undefined);
	if (typeof calleeName !== 'string' || !calleeName.startsWith('new ')) return null;

	return calleeName.slice('new '.length);
}

function isSerializableBuiltInConstructorName(name: string | null): boolean {
	return (
		name === 'Date' ||
		name === 'RegExp' ||
		name === 'Map' ||
		name === 'Set' ||
		name === 'URL' ||
		name === 'ArrayBuffer' ||
		name === 'Int8Array' ||
		name === 'Uint8Array' ||
		name === 'Uint8ClampedArray' ||
		name === 'Int16Array' ||
		name === 'Uint16Array' ||
		name === 'Int32Array' ||
		name === 'Uint32Array' ||
		name === 'Float32Array' ||
		name === 'Float64Array' ||
		name === 'BigInt64Array' ||
		name === 'BigUint64Array'
	);
}

function isDomNodeValue(node: AnyNode): boolean {
	if (node.type !== 'CallExpression') return false;

	const callee = node.callee as AnyNode | undefined;
	if (callee?.type !== 'MemberExpression') return false;

	const objectName = getIdentifierName(callee.object as AnyNode | undefined);
	const propertyName = getIdentifierName(callee.property as AnyNode | undefined);

	return (
		objectName === 'document' &&
		(propertyName === 'querySelector' ||
			propertyName === 'getElementById' ||
			propertyName === 'createElement')
	);
}

function isNonSerializableConstantValue(node: AnyNode, state: WalkState): boolean {
	const constructorName = getNewConstructorName(node);
	if (isSerializableBuiltInConstructorName(constructorName)) {
		return asNodes(node.arguments).some((argument) =>
			containsNonSerializableConstantValue(argument, state),
		);
	}

	if (node.type === 'ObjectExpression') {
		return asNodes(node.properties).some((property) => {
			if (property.type === 'SpreadElement') {
				return containsNonSerializableConstantValue(
					property.argument as AnyNode | undefined,
					state,
				);
			}

			if (property.type !== 'Property') return false;

			return containsNonSerializableConstantValue(
				property.value as AnyNode | undefined,
				state,
			);
		});
	}

	if (node.type === 'ArrayExpression') {
		return asNodes(node.elements).some((element) =>
			containsNonSerializableConstantValue(element, state),
		);
	}

	return false;
}

function containsNonSerializableConstantValue(
	node: AnyNode | undefined,
	state: WalkState,
): boolean {
	if (!node) return false;
	if (node.type === 'SpreadElement') {
		return containsNonSerializableConstantValue(node.argument as AnyNode | undefined, state);
	}
	if (aliasedLocalBinding(node, state)) return true;
	if (isFunctionValue(node) || isClassInstanceValue(node) || isDomNodeValue(node)) return true;

	return isNonSerializableConstantValue(node, state);
}

function findElementHandleStateValue(
	node: AnyNode | undefined,
	state: WalkState,
): { readonly name: string; readonly source: string; readonly sourceSpan?: SourceSpan } | null {
	if (!node) return null;
	if (node.type === 'SpreadElement') {
		return findElementHandleStateValue(node.argument as AnyNode | undefined, state);
	}

	const handleName = elementHandleName(node, state);
	if (handleName) {
		return {
			name: handleName,
			source: expressionSource(node, state.source),
			sourceSpan: sourceSpan(node, state.filename),
		};
	}

	if (node.type === 'ObjectExpression') {
		for (const property of asNodes(node.properties)) {
			if (property.type === 'SpreadElement') {
				const spread = findElementHandleStateValue(
					property.argument as AnyNode | undefined,
					state,
				);
				if (spread) return spread;
				continue;
			}

			if (property.type !== 'Property') continue;

			const value = findElementHandleStateValue(property.value as AnyNode | undefined, state);
			if (value) return value;
		}
	}

	if (node.type === 'ArrayExpression') {
		for (const element of asNodes(node.elements)) {
			const value = findElementHandleStateValue(element, state);
			if (value) return value;
		}
	}

	return null;
}

function elementHandleName(node: AnyNode, state: WalkState): string | null {
	const name = getIdentifierName(node);
	if (!name) return null;

	const binding = state.graph.graphBindings.find(
		(binding) => binding.name === name && binding.kind === 'element',
	);
	return binding ? name : null;
}

function variableDeclarationKind(node: AnyNode): SemanticGraphBinding['declarationKind'] {
	if (node.kind === 'const' || node.kind === 'let' || node.kind === 'var') {
		return node.kind;
	}

	return undefined;
}

function firstArgument(node: AnyNode): AnyNode | undefined {
	return asNodes(node.arguments)[0];
}

function reportTemplateAsValue(
	state: WalkState,
	node: AnyNode,
	siteSource: string,
	name?: string,
): void {
	state.graph.diagnostics.push(
		templateAsValueDiagnostic({ siteSource, name, node, filename: state.filename }),
	);
}

function findComputedTemplateValue(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'ArrowFunctionExpression') {
		const body = node.body as AnyNode | undefined;
		const template = findTemplateValue(body);
		if (template) return template;
		return findReturnTemplateValue(body);
	}
	if (node.type === 'FunctionExpression') {
		return findReturnTemplateValue(node.body as AnyNode | undefined);
	}
	return null;
}

function findReturnTemplateValue(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'ReturnStatement') {
		const argument = node.argument as AnyNode | undefined;
		return findTemplateValue(argument);
	}
	for (const child of asNodes(node.body)) {
		const found = findReturnTemplateValue(child);
		if (found) return found;
	}
	return null;
}

function initialValueKind(node: AnyNode | undefined): SemanticGraphBinding['valueKind'] {
	if (!node) return 'unknown';

	if (node.type === 'ObjectExpression') return 'object';
	if (node.type === 'ArrayExpression') return 'array';
	if (node.type === 'Literal') return 'scalar';
	if (node.type === 'Identifier' && getIdentifierName(node) === 'undefined') return 'scalar';

	return 'unknown';
}

function evaluateInitialStateValue(
	node: AnyNode | undefined,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	if (!node) return { ok: false };

	if (node.type === 'Literal') return { ok: true, value: node.value };
	if (node.type === 'Identifier' && getIdentifierName(node) === 'undefined') {
		return { ok: true, value: undefined };
	}
	if (node.type === 'ObjectExpression') return evaluateObjectExpression(node);
	if (node.type === 'ArrayExpression') {
		const values: unknown[] = [];
		for (const element of asNodes(node.elements)) {
			const value = evaluateInitialStateValue(element);
			if (!value.ok) return { ok: false };
			values.push(value.value);
		}
		return { ok: true, value: values };
	}
	if (node.type === 'UnaryExpression') {
		const argument = evaluateInitialStateValue(node.argument as AnyNode | undefined);
		if (!argument.ok) return { ok: false };
		if (node.operator === '-') return { ok: true, value: -Number(argument.value) };
		if (node.operator === '+') return { ok: true, value: Number(argument.value) };
		if (node.operator === '!') return { ok: true, value: !argument.value };
	}

	return { ok: false };
}

export function evaluateSyncPolicyConstant(
	node: AnyNode | undefined,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	if (!node) return { ok: false };

	if (node.type === 'Literal') return { ok: true, value: node.value };
	if (node.type === 'ObjectExpression') return evaluateSyncPolicyConstantObjectExpression(node);
	if (node.type === 'ArrayExpression') return evaluateSyncPolicyConstantArrayExpression(node);
	if (node.type === 'UnaryExpression') {
		const argument = evaluateSyncPolicyConstant(node.argument as AnyNode | undefined);
		if (!argument.ok) return { ok: false };

		if (node.operator === '-') return { ok: true, value: -Number(argument.value) };
		if (node.operator === '+') return { ok: true, value: Number(argument.value) };
		if (node.operator === '!') return { ok: true, value: !argument.value };
	}
	if (node.type === 'LogicalExpression') {
		const left = evaluateSyncPolicyConstant(node.left as AnyNode | undefined);
		if (!left.ok) return { ok: false };

		if (node.operator === '&&') {
			if (!left.value) return { ok: true, value: left.value };
			return evaluateSyncPolicyConstant(node.right as AnyNode | undefined);
		}
		if (node.operator === '||') {
			if (left.value) return { ok: true, value: left.value };
			return evaluateSyncPolicyConstant(node.right as AnyNode | undefined);
		}
		if (node.operator === '??') {
			if (left.value !== null && left.value !== undefined) {
				return { ok: true, value: left.value };
			}
			return evaluateSyncPolicyConstant(node.right as AnyNode | undefined);
		}
	}
	if (node.type === 'BinaryExpression') {
		const left = evaluateSyncPolicyConstant(node.left as AnyNode | undefined);
		const right = evaluateSyncPolicyConstant(node.right as AnyNode | undefined);
		if (!left.ok || !right.ok) return { ok: false };

		return evaluateSyncPolicyBinaryConstant(node.operator, left.value, right.value);
	}
	if (node.type === 'ConditionalExpression') {
		const test = evaluateSyncPolicyConstant(node.test as AnyNode | undefined);
		if (!test.ok) return { ok: false };

		return evaluateSyncPolicyConstant(
			(test.value ? node.consequent : node.alternate) as AnyNode | undefined,
		);
	}

	return { ok: false };
}

function evaluateSyncPolicyConstantObjectExpression(
	node: AnyNode,
): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false } {
	const output: Record<string, unknown> = {};

	for (const property of asNodes(node.properties)) {
		if (property.type !== 'Property') return { ok: false };

		const key = objectPropertyKey(property.key as AnyNode | undefined);
		if (!key) return { ok: false };

		const value = evaluateSyncPolicyConstant(property.value as AnyNode | undefined);
		if (!value.ok) return { ok: false };

		output[key] = value.value;
	}

	return { ok: true, value: output };
}

function evaluateSyncPolicyConstantArrayExpression(
	node: AnyNode,
): { readonly ok: true; readonly value: unknown[] } | { readonly ok: false } {
	const output: unknown[] = [];

	for (const element of asNodes(node.elements)) {
		const value = evaluateSyncPolicyConstant(element);
		if (!value.ok) return { ok: false };

		output.push(value.value);
	}

	return { ok: true, value: output };
}

function evaluateSyncPolicyBinaryConstant(
	operator: unknown,
	left: unknown,
	right: unknown,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	if (typeof operator !== 'string') return { ok: false };

	if (operator === '===') return { ok: true, value: left === right };
	if (operator === '!==') return { ok: true, value: left !== right };
	if (operator === '==') return { ok: true, value: left === right };
	if (operator === '!=') return { ok: true, value: left !== right };
	if (operator === '<') return { ok: true, value: Number(left) < Number(right) };
	if (operator === '<=') return { ok: true, value: Number(left) <= Number(right) };
	if (operator === '>') return { ok: true, value: Number(left) > Number(right) };
	if (operator === '>=') return { ok: true, value: Number(left) >= Number(right) };
	if (operator === '+') return evaluateSyncPolicyAddConstant(left, right);
	if (operator === '-') return { ok: true, value: Number(left) - Number(right) };
	if (operator === '*') return { ok: true, value: Number(left) * Number(right) };
	if (operator === '/') return { ok: true, value: Number(left) / Number(right) };
	if (operator === '%') return { ok: true, value: Number(left) % Number(right) };

	return { ok: false };
}

function evaluateSyncPolicyAddConstant(
	left: unknown,
	right: unknown,
): { readonly ok: true; readonly value: unknown } {
	if (typeof left === 'string' || typeof right === 'string') {
		return { ok: true, value: `${left}${right}` };
	}

	return { ok: true, value: Number(left) + Number(right) };
}

function evaluateObjectExpression(
	node: AnyNode,
): { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false } {
	const output: Record<string, unknown> = {};

	for (const property of asNodes(node.properties)) {
		if (property.type !== 'Property') return { ok: false };

		const key = objectPropertyKey(property.key as AnyNode | undefined);
		if (!key) return { ok: false };

		const value = evaluateInitialStateValue(property.value as AnyNode | undefined);
		if (!value.ok) return { ok: false };
		output[key] = value.value;
	}

	return { ok: true, value: output };
}

function objectPropertyKey(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (typeof node.name === 'string') return node.name;
	if (typeof node.value === 'string' || typeof node.value === 'number') return String(node.value);
	return null;
}

import {
	childNodes,
	getIdentifierName,
	unwrapTypeAssertion,
	walkNode,
	type AnyNode,
} from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type { SourceSpan } from '../../diagnostics.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectExpressionReads, resolvedSymbolAt } from './collect-expressions.ts';
import { handlerReadsRenderLocalDiagnostic } from './diagnostics.ts';
import { findSharedInstance, resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { repeatRowBindsName } from './collect-repeat.ts';
import { getCallName, getFrameworkApiForCall, isFrameworkApiName } from './imports.ts';
import { ownedModuleAst } from './shared-ast.ts';
import type { WalkState } from './types.ts';

/**
 * An expression that reads component-body locals, rewritten so it reads none: each
 * `const` local recomputable from module values, props, and graph reads is replaced by
 * its own defining expression. A browser symbol has no component body to find the
 * local in, so this is the only form of the expression it can run.
 */
export type RenderLocalInline =
	| {
			readonly kind: 'inlined';
			readonly source: string;
			// The defining expressions spliced in; their graph reads are the expression's too.
			readonly definitions: ReadonlyArray<AnyNode>;
	  }
	| { readonly kind: 'row-item'; readonly name: string }
	| { readonly kind: 'render-local'; readonly name: string };

type Replacement = { readonly start: number; readonly end: number; readonly text: string };

export function inlineRenderLocals(
	node: AnyNode,
	state: WalkState,
	// A function, class instance, or DOM node local is the capture pass's to refuse, by name.
	options: { readonly leaveCaptureOwned?: boolean; readonly leaveRowItems?: boolean } = {},
): RenderLocalInline {
	const definitions: AnyNode[] = [];
	const result = inlineWithin(node, state, definitions, new Set(), {
		leaveCaptureOwned: options.leaveCaptureOwned === true,
		leaveRowItems: options.leaveRowItems === true,
	});
	return 'source' in result ? { kind: 'inlined', source: result.source, definitions } : result;
}

function inlineWithin(
	node: AnyNode,
	state: WalkState,
	definitions: AnyNode[],
	inlining: Set<number>,
	options: { readonly leaveCaptureOwned: boolean; readonly leaveRowItems: boolean },
):
	| { readonly source: string; readonly freeNames: ReadonlySet<string> }
	| Exclude<RenderLocalInline, { readonly kind: 'inlined' }> {
	const source = expressionSource(node, state.source);
	if (typeof node.start !== 'number' || typeof node.end !== 'number' || source === null)
		return { kind: 'render-local', name: source ?? '' };
	const region = { start: node.start, end: node.end };
	const semantic = state.semantic();
	const replacements: Replacement[] = [];
	const freeNames = new Set<string>();
	const splicedNames = new Set<string>();
	const boundInside = new Set<string>();
	let refusal: Exclude<RenderLocalInline, { readonly kind: 'inlined' }> | null = null;

	const visit = (candidate: AnyNode, parent: AnyNode | null): void => {
		if (refusal) return;
		if (candidate.type === 'Identifier' && typeof candidate.start === 'number') {
			const name = getIdentifierName(candidate);
			const symbolId = name ? resolvedSymbolAt(semantic, candidate.start) : null;
			if (name && symbolId !== null) {
				const scopeId = semantic.symbol.scopeId(symbolId);
				if (
					semantic.scope.start(scopeId) >= region.start &&
					semantic.scope.end(scopeId) <= region.end
				) {
					boundInside.add(name);
				} else if (repeatRowBindsName(name, state)) {
					if (options.leaveRowItems) freeNames.add(name);
					else refusal = { kind: 'row-item', name };
				} else if (semantic.scope.kind(scopeId) === 'module' || readsGraph(name, state)) {
					freeNames.add(name);
				} else {
					const local = classifyLocal(symbolId, name, state);
					if (
						local.kind === 'graph' ||
						(local.kind === 'capture-owned' && options.leaveCaptureOwned) ||
						(local.kind === 'row-binding' && options.leaveRowItems)
					) {
						freeNames.add(name);
					} else if (local.kind === 'row-binding') {
						refusal = { kind: 'row-item', name };
					} else if (local.kind !== 'definition' || inlining.has(symbolId)) {
						refusal = { kind: 'render-local', name };
					} else {
						const definition = local.init;
						definitions.push(definition);
						const inner = inlineWithin(
							definition,
							state,
							definitions,
							new Set([...inlining, symbolId]),
							options,
						);
						if (!('source' in inner)) {
							refusal = inner;
						} else {
							for (const free of inner.freeNames) {
								freeNames.add(free);
								splicedNames.add(free);
							}
							const shorthand =
								parent?.type === 'Property' &&
								parent.shorthand === true &&
								parent.value === candidate;
							replacements.push({
								start: candidate.start,
								end:
									typeof candidate.end === 'number'
										? candidate.end
										: candidate.start + name.length,
								text: shorthand
									? `${name}: (${inner.source})`
									: `(${inner.source})`,
							});
						}
					}
				}
			}
		}
		// A shorthand property's key and value are one identifier; only the value reads it.
		if (candidate.type === 'Property' && candidate.shorthand === true) {
			visit(candidate.value as AnyNode, candidate);
			return;
		}
		for (const child of childNodes(candidate)) visit(child, candidate);
	};
	visit(node, null);
	if (refusal) return refusal;
	// A spliced definition must not have its names captured by a binding inside this expression.
	for (const name of splicedNames)
		if (boundInside.has(name)) return { kind: 'render-local', name };

	let text = source;
	for (const replacement of [...replacements].sort((left, right) => right.start - left.start))
		text =
			text.slice(0, replacement.start - region.start) +
			replacement.text +
			text.slice(replacement.end - region.start);
	return { source: text, freeNames };
}

/**
 * A handler or callback runs as a browser symbol with no component body, so each body
 * local it reads is recomputed from its definition; any other local fails the build.
 */
export function inlineHandlerRenderLocals(
	node: AnyNode,
	state: WalkState,
	handlerLabel: string,
): { readonly source: string; readonly definitionSpans: ReadonlyArray<SourceSpan> } | null {
	if (state.currentSharedDefinitionId) return null;
	const inlined = inlineRenderLocals(node, state, {
		leaveCaptureOwned: true,
		leaveRowItems: true,
	});
	if (inlined.kind !== 'inlined') {
		state.graph.diagnostics.push(
			handlerReadsRenderLocalDiagnostic({
				handlerLabel,
				localName: inlined.name,
				handler: node,
				filename: state.filename,
			}),
		);
		return null;
	}
	for (const definition of inlined.definitions) collectDefinitionReads(definition, state);
	return {
		source: inlined.source,
		definitionSpans: inlined.definitions.flatMap(
			(definition) => sourceSpan(definition, state.filename) ?? [],
		),
	};
}

// The spliced definition's reads are lowered at its own span, once however many handlers splice it.
function collectDefinitionReads(definition: AnyNode, state: WalkState): void {
	const reads = state.graph.stateReads;
	const known = new Set(reads.map(readKey));
	const before = reads.length;
	collectExpressionReads(definition, state);
	const added = reads.splice(before).filter((read) => !known.has(readKey(read)));
	reads.push(...added);
}

function readKey(read: { readonly source: string; readonly sourceSpan?: SourceSpan }): string {
	return `${read.source}@${read.sourceSpan?.start ?? ''}:${read.sourceSpan?.end ?? ''}`;
}

function readsGraph(name: string, state: WalkState): boolean {
	return Boolean(
		resolveGraphPath(
			name,
			graphBindingMap(state.graph, state.currentSharedDefinitionId),
			semanticAliasMap(state.graph, state.currentSharedDefinitionId),
		) ??
		resolveSharedInstanceGraphPath(name, state.graph, state.currentComponentName) ??
		findSharedInstance(name, state.graph, state.currentComponentName),
	);
}

type LocalKind =
	| { readonly kind: 'graph' | 'capture-owned' | 'row-binding' | 'opaque' }
	| { readonly kind: 'definition'; readonly init: AnyNode };

// What a component-body local is, from its declaration: a graph cell declared later in the
// body, a value the capture pass owns, a @for row binding, a `const` definition to recompute,
// or none of these.
function classifyLocal(symbolId: number, name: string, state: WalkState): LocalKind {
	const semantic = state.semantic();
	if (semantic.symbol.declCount(symbolId) !== 1) return { kind: 'opaque' };
	if (state.graph.localBindings.some((binding) => binding.name === name))
		return { kind: 'capture-owned' };
	const declarationStart = semantic.symbol.declNode(symbolId, 0).start;
	let found: LocalKind | null = null;
	walkNode(ownedModuleAst(state, state.source, state.filename), (candidate) => {
		if (found) return;
		if (candidate.type === 'JSXForExpression') {
			if (
				declaredIn(candidate.left, declarationStart) ||
				declaredIn(candidate.index, declarationStart)
			)
				found = { kind: 'row-binding' };
			return;
		}
		if (candidate.type === 'FunctionDeclaration') {
			if ((candidate.id as AnyNode | undefined)?.start === declarationStart)
				found = { kind: 'capture-owned' };
			return;
		}
		if (candidate.type !== 'VariableDeclaration') return;
		for (const declarator of (candidate.declarations as AnyNode[] | undefined) ?? []) {
			const id = declarator.id as AnyNode | undefined;
			if (id?.start !== declarationStart) continue;
			const init = unwrapTypeAssertion(declarator.init as AnyNode | undefined);
			found =
				id.type !== 'Identifier' || !init
					? { kind: 'opaque' }
					: callsFrameworkApi(init, state)
						? { kind: 'graph' }
						: init.type === 'ArrowFunctionExpression' ||
							  init.type === 'FunctionExpression' ||
							  init.type === 'NewExpression'
							? { kind: 'capture-owned' }
							: candidate.kind === 'const'
								? { kind: 'definition', init: declarator.init as AnyNode }
								: { kind: 'opaque' };
		}
	});
	return found ?? { kind: 'opaque' };
}

function declaredIn(node: unknown, start: number): boolean {
	const header = node as AnyNode | undefined;
	return (
		typeof header?.start === 'number' &&
		typeof header.end === 'number' &&
		start >= header.start &&
		start < header.end
	);
}

// A framework call makes a graph cell or a handle, never a value to recompute; an unimported one is already an error.
function callsFrameworkApi(node: AnyNode, state: WalkState): boolean {
	if (getFrameworkApiForCall(node, state.frameworkApiImports)) return true;
	const name = node.type === 'CallExpression' ? getCallName(node) : null;
	return Boolean(
		name &&
		(isFrameworkApiName(name) ||
			state.graph.sharedDefinitions.some((definition) => definition.name === name)),
	);
}

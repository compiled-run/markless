import type {
	LoweredStateRead,
	LoweredStateWrite,
	SemanticGraphAlias,
	SemanticGraphArtifact,
	SemanticGraphBinding,
	SemanticLocalDeclaration,
	SemanticStateWrite,
	SourceSpan,
	StateLoweringArtifact,
	StateLoweringDiagnostic,
	StateLoweringInput,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
	uniqueBy,
} from '../artifact-helpers/graph-paths.ts';
import { resolveSharedInstanceGraphPath } from './semantic-graph/collect-shared.ts';

export function lowerStateAccess(input: StateLoweringInput): StateLoweringArtifact {
	const reads: LoweredStateRead[] = [];
	const writes: LoweredStateWrite[] = [];
	const diagnostics: StateLoweringDiagnostic[] = [];

	for (const read of input.semanticGraph.templateReads) {
		if (read.computedGraphNodeId) {
			const computed = input.semanticGraph.graphBindings.find(
				(binding) => binding.id === read.computedGraphNodeId,
			);
			for (const dependency of computed?.dependencies ?? []) {
				reads.push({
					source: dependency.source,
					graphNodeId: dependency.graphNodeId,
					path: dependency.path,
				});
			}
			continue;
		}

		const lookup = scopedGraphLookup(input, null);
		const resolved = resolveStateGraphPath(input, read.source, lookup, null);
		if (!resolved) {
			if (
				isDynamicGraphPathSource(
					read.source,
					lookup.bindings,
					lookup.aliases,
					input.semanticGraph,
				)
			) {
				diagnostics.push(
					dynamicGraphPathReadDiagnostic(
						read.source,
						read.sourceSpan,
						input.semanticGraph.filename,
					),
				);
				continue;
			}
			const staticExpressionReadSource = templateExpressionGraphReadSource(
				read.source,
				lookup,
			);
			if (staticExpressionReadSource) {
				diagnostics.push(
					templateExpressionStaticDiagnostic({
						source: read.source,
						readSource: staticExpressionReadSource,
						sourceSpan: read.sourceSpan,
						filename: input.semanticGraph.filename,
					}),
				);
				continue;
			}
			continue;
		}

		reads.push({
			source: read.source,
			graphNodeId: resolved.binding.id,
			path: resolved.path,
		});
	}

	for (const read of input.semanticGraph.stateReads) {
		const sharedDefinitionId = read.sharedDefinitionId ?? null;
		const lookup = scopedGraphLookup(input, sharedDefinitionId, read.componentName);
		const resolved = resolveStateGraphPath(input, read.source, lookup, sharedDefinitionId);
		if (!resolved) {
			if (
				isDynamicGraphPathSource(
					read.source,
					lookup.bindings,
					lookup.aliases,
					input.semanticGraph,
				)
			) {
				diagnostics.push(
					dynamicGraphPathReadDiagnostic(
						read.source,
						read.sourceSpan,
						input.semanticGraph.filename,
					),
				);
			}
			continue;
		}

		reads.push({
			source: read.source,
			...(read.sourceSpan ? { sourceSpan: read.sourceSpan } : {}),
			...((read.bindingId ?? resolved.bindingId)
				? { bindingId: read.bindingId ?? resolved.bindingId }
				: {}),
			...((read.componentName ?? resolved.componentName)
				? { componentName: read.componentName ?? resolved.componentName }
				: {}),
			graphNodeId: resolved.binding.id,
			path: resolved.path,
		});
	}

	for (const write of input.semanticGraph.stateWrites) {
		const sharedDefinitionId = write.sharedDefinitionId ?? null;
		const lookup = scopedGraphLookup(input, sharedDefinitionId, write.componentName);

		if (write.optional === true) {
			diagnostics.push(optionalChainWriteDiagnostic(write, input.semanticGraph.filename));
			continue;
		}

		const resolved = resolveStateGraphPath(input, write.target, lookup, sharedDefinitionId);
		if (!resolved) {
			const excludedAliasPath = findRestAliasExcludedPath(write.target, lookup.aliases);
			if (excludedAliasPath) {
				diagnostics.push(
					restAliasExcludedPathDiagnostic({
						source: write.target,
						sourceSpan: write.targetSpan,
						filename: input.semanticGraph.filename,
						excludedAliasPath,
					}),
				);
				continue;
			}

			if (
				isDynamicGraphPathSource(
					write.target,
					lookup.bindings,
					lookup.aliases,
					input.semanticGraph,
				)
			) {
				diagnostics.push(
					dynamicGraphPathWriteDiagnostic(write, input.semanticGraph.filename),
				);
				continue;
			}

			const moduleTarget = moduleScopeWriteTarget(write, input.semanticGraph);
			if (moduleTarget) {
				diagnostics.push(
					moduleEscapeDiagnostic(write, moduleTarget, input.semanticGraph.filename),
				);
				continue;
			}

			const staleLocal = staleLocalWriteTarget(write, input.semanticGraph);
			if (staleLocal) {
				diagnostics.push(
					staleLocalWriteDiagnostic(write, staleLocal, input.semanticGraph.filename),
				);
				continue;
			}

			if (isAllowedPlainLocalWrite(write, input.semanticGraph)) continue;

			diagnostics.push(unresolvedWriteDiagnostic(write, input.semanticGraph.filename));
			continue;
		}

		if (isConstBindingReassignment(write, resolved.binding, resolved.path)) {
			diagnostics.push(constBindingReassignmentDiagnostic(write));
			continue;
		}

		if (!resolved.binding.writable) {
			diagnostics.push(readOnlyWriteDiagnostic(write, resolved.binding));
			continue;
		}

		if (isUnloweredSharedSeed(write, resolved.binding, input)) {
			diagnostics.push(
				sharedSeedUnsupportedDiagnostic(write, input.semanticGraph.filename),
			);
			continue;
		}

		const elementHandleValue = elementHandleWriteValue(write, lookup);
		if (elementHandleValue) {
			diagnostics.push(
				stateElementHandleWriteDiagnostic(
					write,
					elementHandleValue,
					input.semanticGraph.filename,
				),
			);
			continue;
		}

		if (isConstAliasReassignment(write, lookup.aliases)) {
			diagnostics.push(constBindingReassignmentDiagnostic(write));
			continue;
		}

		writes.push({
			source: write.target,
			sourceSpan: write.targetSpan,
			graphNodeId: resolved.binding.id,
			path: resolved.path,
			operation: write.operation,
			assignmentOperator: write.assignmentOperator,
			valueSource: write.valueSource,
			prefix: write.prefix,
			updateOperator: write.updateOperator,
			method: write.method,
			argumentSources: write.argumentSources,
		});
	}

	return {
		passId: 'state-lowering',
		reads: uniqueBy(
			reads,
			(read) =>
				`${read.bindingId ?? ''}:${read.graphNodeId}:${read.path.join('.')}:${read.source}:${read.sourceSpan?.start ?? ''}:${read.sourceSpan?.end ?? ''}`,
		),
		writes,
		diagnostics,
	};
}

type GraphLookup = {
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly aliases: ReadonlyMap<string, SemanticGraphAlias>;
};

type ResolvedStateGraphPath = {
	readonly binding: SemanticGraphBinding;
	readonly path: ReadonlyArray<string>;
	readonly bindingId?: string;
	readonly componentName?: string;
};

function templateExpressionGraphReadSource(source: string, lookup: GraphLookup): string | null {
	if (!isCompositeTemplateExpression(source)) return null;

	const candidates = [...lookup.bindings.keys(), ...lookup.aliases.keys()].sort(
		(left, right) => right.length - left.length,
	);
	for (const name of candidates) {
		if (sourceContainsIdentifier(source, name)) return name;
	}

	return null;
}

function isCompositeTemplateExpression(source: string): boolean {
	return /[?:+\-*/%<>=!&|()[\]{}]/.test(source);
}

function sourceContainsIdentifier(source: string, identifier: string): boolean {
	return new RegExp(`(^|[^$0-9A-Z_a-z])${escapeRegExp(identifier)}(?=$|[^$0-9A-Z_a-z])`).test(
		source,
	);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scopedGraphLookup(
	input: StateLoweringInput,
	sharedDefinitionId: string | null,
	componentName?: string,
): GraphLookup {
	return {
		bindings: graphBindingMap(input.semanticGraph, sharedDefinitionId, componentName),
		aliases: semanticAliasMap(input.semanticGraph, sharedDefinitionId, componentName),
	};
}

function resolveStateGraphPath(
	input: StateLoweringInput,
	source: string,
	lookup: GraphLookup,
	sharedDefinitionId: string | null,
): ResolvedStateGraphPath | null {
	const direct = resolveGraphPath(source, lookup.bindings, lookup.aliases);
	if (direct) return direct;
	if (sharedDefinitionId) return null;

	return resolveSharedInstanceGraphPath(source, input.semanticGraph);
}

function templateExpressionStaticDiagnostic({
	source,
	readSource,
	sourceSpan,
	filename,
}: {
	readonly source: string;
	readonly readSource: string;
	readonly sourceSpan?: SourceSpan;
	readonly filename: string;
}): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_TEMPLATE_EXPRESSION_STATIC',
		severity: 'warning',
		phase: 'state-lowering',
		title: 'This expression reads state but never updates',
		message: `This text reads \`${readSource}\`, but only plain reads like \`{${readSource}}\` update the page today. The expression renders its initial value and never changes when \`${readSource}\` changes.`,
		why: 'Each template read compiles to a graph subscription with a DOM-update record; composite expressions are not lowered yet, so no subscription exists to wake this text.',
		primarySpan: sourceSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: readSource,
		source,
		suggestions: [
			{
				message:
					"Hoist the logic into a derived value: `const label = computed(() => a ? 'x' : 'y');` with `<p>{label}</p>`.",
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_EXPRESSION_STATIC',
	};
}

function elementHandleWriteValue(
	write: SemanticStateWrite,
	lookup: GraphLookup,
): SemanticGraphBinding | null {
	if (!write.valueSource) return null;
	const resolved = resolveGraphPath(write.valueSource, lookup.bindings, lookup.aliases);
	return resolved?.binding.kind === 'element' && resolved.path.length === 0
		? resolved.binding
		: null;
}

function stateElementHandleWriteDiagnostic(
	write: SemanticStateWrite,
	handle: SemanticGraphBinding,
	filename: string,
): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE',
		severity: 'error',
		phase: 'state-lowering',
		title: 'element() handles cannot be stored in state',
		message: `Cannot write element handle "${handle.name}" into state path "${write.target}" because element handles are DOM locators, not serializable graph data.`,
		why: 'state() writes are serialized into markless/state and replayed without running component bodies. An element() handle resolves through DOM locator metadata and must stay outside serialized graph state.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.valueSource ?? write.target,
		suggestions: [
			{
				message:
					'Keep element handles in element() bindings and bind them with el={handle}. Store serializable ids, flags, or data in state() instead.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE',
	};
}

function unresolvedWriteDiagnostic(
	write: SemanticStateWrite,
	filename: string,
): StateLoweringDiagnostic {
	const memberExpression = isMemberExpressionWriteTarget(write.target);
	return {
		code: 'MARKLESS_STATE_UNRESOLVED_WRITE',
		severity: memberExpression ? 'warning' : 'error',
		phase: 'state-lowering',
		title: memberExpression
			? 'Host-object write is not tracked as state'
			: 'Cannot resolve graph write target',
		message: memberExpression
			? `The write to "${write.target}" runs imperatively, but Markless does not track it as graph state.`
			: `Cannot write to "${write.target}" because the compiler cannot resolve that target.`,
		why: memberExpression
			? 'Member-expression writes can update host objects at runtime, but they do not produce resumable state graph updates.'
			: 'This write is not a known state() graph path, graph alias, declared plain local, or classified module-scope binding.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message:
					'Declare the local before writing it, or move UI-changing values into state() so Markless can serialize and resume the update.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_UNRESOLVED_WRITE',
	};
}

function isMemberExpressionWriteTarget(target: string): boolean {
	// The semantic artifact preserves the authored assignment target. Keep this
	// syntax classification in state-lowering, where unresolved-write severity is owned.
	const source = target.trim();
	if (source.startsWith('{') || source.startsWith('[')) return false;
	return source.includes('.') || /[$\w)]\s*\[/.test(source);
}

function staleLocalWriteDiagnostic(
	write: SemanticStateWrite,
	local: SemanticLocalDeclaration,
	filename: string,
): StateLoweringDiagnostic {
	const name = local.name;
	return {
		code: 'MARKLESS_STATE_STALE_LOCAL_WRITE',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Handler write would leave the template stale',
		message: `Cannot write to "${write.target}" from a handler because the template reads the component local "${name}" only during initial render.`,
		why: 'Component bodies run for initial render only. Template reads re-render after events only when they subscribe through state(), so this handler write would leave the UI stale after resume.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message: `Move "${name}" into state(), then write ${name}++ so Markless can serialize the cell and update subscribed DOM.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_STALE_LOCAL_WRITE',
	};
}

function moduleEscapeDiagnostic(
	write: SemanticStateWrite,
	target: ModuleWriteTarget,
	filename: string,
): StateLoweringDiagnostic {
	const aliasText = target.aliasName
		? ` because it aliases module-scope "${target.moduleName}", which would be shared across requests`
		: ' because it lives at module scope and would be shared across requests';
	return {
		code: 'MARKLESS_STATE_MODULE_ESCAPE',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Module-scope storage cannot be written from render or handlers',
		message: `Cannot write to "${write.target}"${aliasText}.`,
		why: 'Module-scope storage outlives a single server render. A handler could read or overwrite data from another user because the value is not part of this document payload.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message:
					'Keep per-document values inside state(), or use shared() for named request/container/page dataflow instead of module variables.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_MODULE_ESCAPE',
	};
}

function dynamicGraphPathReadDiagnostic(
	source: string,
	sourceSpan: SourceSpan | undefined,
	filename: string,
): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_STATE_DYNAMIC_PATH_READ',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot read from a dynamic graph path',
		message: `Cannot read "${source}" because graph read paths must be statically resolvable.`,
		why: 'The resumable state graph records path-level subscriptions in the payload. A dynamic property expression cannot be represented as a stable graph subscription by the current compiler pass.',
		primarySpan: sourceSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: source,
		source,
		suggestions: [
			{
				message:
					'Use a statically named property path, a literal array index, or model the dynamic lookup as a computed() with explicit compiler support.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_DYNAMIC_PATH_READ',
	};
}

// A component body seeds its widget's shared instance by assignment, and the
// seed is only representable when its value comes from this component's props
// or from constants. Anything else has no render-time source to read.
function isUnloweredSharedSeed(
	write: SemanticStateWrite,
	binding: SemanticGraphBinding,
	input: StateLoweringInput,
): boolean {
	if (write.writeScope !== 'component') return false;
	if (binding.sharedDefinitionId === undefined) return false;
	if (write.operation !== 'assign' || write.assignmentOperator !== undefined) return true;

	const allowed = new Set<string>(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);
	for (const propBinding of input.semanticGraph.componentPropBindings) {
		if (propBinding.componentName === write.componentName) allowed.add(propBinding.localName);
	}
	for (const graphBinding of input.semanticGraph.graphBindings) {
		if (graphBinding.kind === 'prop' && graphBinding.componentName === write.componentName)
			allowed.add(graphBinding.name);
	}

	return [...(write.valueSource ?? '').matchAll(/(\.\s*)?\b[$A-Z_a-z][$\w]*\b/g)].some(
		(match) => match[1] === undefined && !allowed.has(match[0].trim()),
	);
}

function sharedSeedUnsupportedDiagnostic(
	write: SemanticStateWrite,
	filename: string,
): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_SHARED_SEED_UNSUPPORTED',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot seed shared state from this expression',
		message: `Cannot seed "${write.target}" from "${write.valueSource ?? write.target}" because a component body seeds a shared instance only from its own props or from constants.`,
		why: 'A component body runs once during initial render. The compiler turns a shared-state assignment there into a per-instance initial value, which it can only build from values the render already has: this component\'s props and constants.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message:
					'Assign a prop or a constant, or move the write into an event handler where the shared instance is already live.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_SEED_UNSUPPORTED',
	};
}

function dynamicGraphPathWriteDiagnostic(
	write: SemanticStateWrite,
	filename: string,
): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_STATE_DYNAMIC_PATH_WRITE',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot write to a dynamic graph path',
		message: `Cannot write to "${write.target}" because graph write paths must be statically resolvable.`,
		why: 'The resumable state graph records path-level writes in the payload and runtime journal. A dynamic property expression cannot be represented as a stable graph path by the current compiler pass.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message:
					'Use a statically named property path, a literal array index, or a collection method with compiler coverage for this state update.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_DYNAMIC_PATH_WRITE',
	};
}

function optionalChainWriteDiagnostic(
	write: SemanticStateWrite,
	filename: string,
): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_STATE_OPTIONAL_CHAIN_WRITE',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot write graph state through optional chaining',
		message: `Cannot write to "${write.target}" through optional chaining because graph writes must have definite targets.`,
		why: 'Optional chaining can skip the method call and its arguments at runtime. The current graph write artifact cannot preserve that short-circuit behavior safely across resume.',
		primarySpan: write.targetSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message:
					'Guard explicitly before mutating graph state, or initialize the state path so the collection method call always has a definite target.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_OPTIONAL_CHAIN_WRITE',
	};
}

type ExcludedAliasPath = {
	readonly aliasName: string;
	readonly excludedPath: ReadonlyArray<string>;
};

function restAliasExcludedPathDiagnostic({
	source,
	sourceSpan,
	filename,
	excludedAliasPath,
}: {
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
	readonly filename: string;
	readonly excludedAliasPath: ExcludedAliasPath;
}): StateLoweringDiagnostic {
	const excludedPathSource = excludedAliasPath.excludedPath.join('.');

	return {
		code: 'MARKLESS_STATE_REST_ALIAS_EXCLUDED_PATH',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot write through an object-rest excluded path',
		message: `Cannot write to "${source}" because "${excludedPathSource}" was excluded when "${excludedAliasPath.aliasName}" was created.`,
		why: 'Object rest destructuring creates an alias for the remaining graph paths only. Paths explicitly destructured out of the source object are not owned by the rest alias.',
		primarySpan: sourceSpan ?? fallbackSpan(filename),
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: source,
		source,
		suggestions: [
			{
				message:
					'Write through the original graph path, or use the explicit destructured alias for the excluded property.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_REST_ALIAS_EXCLUDED_PATH',
	};
}

function readOnlyWriteDiagnostic(
	write: SemanticStateWrite,
	binding: SemanticGraphBinding,
): StateLoweringDiagnostic {
	const details = readOnlyWriteDetails(binding);

	return {
		code: 'MARKLESS_STATE_READ_ONLY_WRITE',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot write to a read-only graph binding',
		message: `Cannot write to "${write.target}" because ${details.bindingLabel} are read-only.`,
		why: details.why,
		primarySpan: write.targetSpan,
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [{ message: details.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_READ_ONLY_WRITE',
	};
}

function readOnlyWriteDetails(binding: SemanticGraphBinding): {
	readonly bindingLabel: string;
	readonly why: string;
	readonly suggestion: string;
} {
	if (binding.kind === 'computed') {
		return {
			bindingLabel: 'computed() values',
			why: 'computed() creates derived graph state. Mutating it would make the serialized graph ambiguous after resume.',
			suggestion:
				'Write to the source state that the computed value derives from, or make a separate state() value for mutable data.',
		};
	}

	if (binding.kind === 'prop') {
		return {
			bindingLabel: 'prop bindings',
			why: 'Props are owned by the parent graph projection. Mutating a child prop binding would create resume state that has no stable owner.',
			suggestion:
				'Write to state owned by the parent graph, or pass an event handler/shared graph method that performs the update at the owner.',
		};
	}

	return {
		bindingLabel: `${binding.kind} bindings`,
		why: 'This graph binding is read-only in the current compiler pass, so mutating it would create resume state the runtime cannot own safely.',
		suggestion: 'Write to a state() binding or a writable path inside object state instead.',
	};
}

function isConstBindingReassignment(
	write: SemanticStateWrite,
	binding: SemanticGraphBinding,
	path: ReadonlyArray<string>,
): boolean {
	if (binding.kind !== 'state' || binding.declarationKind !== 'const') return false;
	if (path.length > 0) return false;

	return write.operation === 'assign' || write.operation === 'update';
}

function isConstAliasReassignment(
	write: SemanticStateWrite,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
): boolean {
	if (write.operation !== 'assign' && write.operation !== 'update') return false;

	const segments = splitStaticGraphPath(write.target);
	if (segments.length !== 1) return false;

	return aliases.get(segments[0])?.declarationKind === 'const';
}

function isDynamicGraphPathSource(
	source: string,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
	graph?: SemanticGraphArtifact,
): boolean {
	if (!hasDynamicBracketSegment(source)) return false;

	const root = graphPathRoot(source);
	if (!root) return false;

	if (resolveGraphPath(root, bindings, aliases) !== null) return true;

	return graph?.sharedInstances.some((instance) => instance.localName === root) ?? false;
}

type ModuleWriteTarget = { readonly moduleName: string; readonly aliasName?: string };

function moduleScopeWriteTarget(
	write: SemanticStateWrite,
	graph: SemanticGraphArtifact,
): ModuleWriteTarget | null {
	const root = graphPathRoot(write.target);
	if (!root || write.writeScope === 'module') return null;

	const declaration = findLocalDeclaration(root, graph.localDeclarations);
	if (!declaration) return null;
	const moduleName =
		declaration.scope === 'module'
			? (declaration.aliasOf ?? declaration.name)
			: moduleAliasDeclarationName(declaration, graph.localDeclarations);
	if (!moduleName) return null;

	return moduleName === root ? { moduleName } : { moduleName, aliasName: root };
}

function moduleAliasDeclarationName(
	declaration: SemanticLocalDeclaration,
	declarations: ReadonlyArray<SemanticLocalDeclaration>,
): string | null {
	if (!declaration.aliasOf) return null;
	const target = findLocalDeclaration(declaration.aliasOf, declarations);
	return target?.scope === 'module' ? (target.aliasOf ?? target.name) : null;
}

function staleLocalWriteTarget(
	write: SemanticStateWrite,
	graph: SemanticGraphArtifact,
): SemanticLocalDeclaration | null {
	if (write.writeScope !== 'handler') return null;
	const root = graphPathRoot(write.target);
	if (!root) return null;
	const declaration = findLocalDeclaration(root, graph.localDeclarations);
	return declaration?.scope === 'component' &&
		declaration.componentName === write.componentName &&
		graph.templateReads.some((read) => graphPathRoot(read.source) === root)
		? declaration
		: null;
}

function isAllowedPlainLocalWrite(
	write: SemanticStateWrite,
	graph: SemanticGraphArtifact,
): boolean {
	const root = graphPathRoot(write.target);
	if (!root) return false;
	const declaration = findLocalDeclaration(root, graph.localDeclarations);
	if (!declaration || declaration.aliasOf) return false;
	if (declaration.scope === 'module') return false;
	return write.writeScope === 'component'
		? declaration.scope === 'component' && declaration.componentName === write.componentName
		: declaration.scope === 'function';
}

function findLocalDeclaration(
	name: string,
	declarations: ReadonlyArray<SemanticLocalDeclaration>,
): SemanticLocalDeclaration | undefined {
	for (let index = declarations.length - 1; index >= 0; index--) {
		const declaration = declarations[index];
		if (declaration?.name === name) return declaration;
	}
	return undefined;
}

function findRestAliasExcludedPath(
	source: string,
	aliases: ReadonlyMap<string, SemanticGraphAlias>,
): ExcludedAliasPath | null {
	const segments = splitStaticGraphPath(source);
	if (segments.length < 2) return null;

	const aliasName = segments[0];
	const alias = aliases.get(aliasName);
	if (!alias?.excludedPaths) return null;

	const requestedPath = segments.slice(1);
	const excludedPath = alias.excludedPaths.find((path) => pathStartsWith(requestedPath, path));
	if (!excludedPath) return null;

	return {
		aliasName,
		excludedPath,
	};
}

function pathStartsWith(path: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
	if (prefix.length > path.length) return false;

	return prefix.every((segment, index) => segment === path[index]);
}

function graphPathRoot(source: string): string | null {
	const match = /^\s*([$A-Z_a-z][$\w]*)/.exec(source);
	return match?.[1] ?? null;
}

function hasDynamicBracketSegment(source: string): boolean {
	let index = 0;

	while (index < source.length) {
		const open = source.indexOf('[', index);
		if (open === -1) return false;

		const close = source.indexOf(']', open + 1);
		if (close === -1) return true;

		const segment = source.slice(open + 1, close).trim();
		if (!isStaticBracketSegment(segment)) return true;

		index = close + 1;
	}

	return false;
}

function isStaticBracketSegment(segment: string): boolean {
	if (/^\d+$/.test(segment)) return true;
	if (segment.length < 2) return false;

	const quote = segment[0];
	return (quote === '"' || quote === "'") && segment[segment.length - 1] === quote;
}

function constBindingReassignmentDiagnostic(write: SemanticStateWrite): StateLoweringDiagnostic {
	return {
		code: 'MARKLESS_STATE_CONST_REASSIGNMENT',
		severity: 'error',
		phase: 'state-lowering',
		title: 'Cannot reassign a const graph binding',
		message: `Cannot update "${write.target}" because it was declared with const. JavaScript const binding semantics are preserved for state().`,
		why: 'state() removes marker syntax, but it does not change JavaScript binding rules. A const binding cannot be reassigned during resume or initial render.',
		primarySpan: write.targetSpan,
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph', 'stateLowering'],
		statePath: write.target,
		source: write.target,
		suggestions: [
			{
				message:
					'Use let for scalar state you reassign, or mutate a property path on object state such as menu.open.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_CONST_REASSIGNMENT',
	};
}

function fallbackSpan(filename: string): SourceSpan {
	return {
		filename,
		start: 0,
		end: 0,
	};
}

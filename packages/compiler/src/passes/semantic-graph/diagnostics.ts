import type { AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticElementHandleBinding,
	SemanticGraphDiagnostic,
	SemanticGraphBinding,
	SemanticSharedDependency,
	SemanticStateRead,
	SemanticTemplateRead,
	SourceSpan,
} from '../../artifacts.ts';
import type { FrameworkApiName } from './imports.ts';
import type { WalkState } from './types.ts';

export function frameworkImportRequiredDiagnostic(
	apiName: FrameworkApiName,
	call: AnyNode,
	filename: string,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Framework API must be imported',
		message: `Cannot use ${apiName}() until it is imported from markless.`,
		why: `${apiName}() is a compiler-rewritten markless API. The import makes ownership explicit for TypeScript, editors, junior developers, and AI agents.`,
		primarySpan: sourceSpan(call, filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Add \`import { ${apiName} } from '@markless/core';\` to this .tsrx file.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
	};
}

export function moduleScopeGraphCreationDiagnostic(
	name: string,
	callName: 'state' | 'computed',
	init: AnyNode | undefined,
	filename: string,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_MODULE_SCOPE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'state() and computed() cannot be created at module scope',
		message: `Cannot create "${name}" with ${callName}() at module scope.`,
		why: 'Module-scope graph state would be shared across requests and has no per-document serialization payload.',
		primarySpan: init ? sourceSpan(init, filename) : fallbackSpan(filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Move state() or computed() creation into a component or declare request/container/page state with shared().',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_MODULE_SCOPE',
	};
}

export function asyncPostAwaitReadDiagnostic(
	computedName: string,
	read: SemanticStateRead,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_ASYNC_POST_AWAIT_READ',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Reactive reads after await are not resumable',
		message: `Cannot read "${read.source}" after await in async computed "${computedName}". Snapshot the value before awaiting.`,
		why: 'Async computed dependency keys are captured before the first await. Reading graph state after suspension would make revalidation and resume depend on hidden async timing.',
		primarySpan: read.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Read the graph value before the first await, or split post-await formatting into a separate sync computed().',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ASYNC_POST_AWAIT_READ',
	};
}

export function asyncBoundaryRequiredDiagnostic(
	read: SemanticTemplateRead,
	binding: SemanticGraphBinding,
): SemanticGraphDiagnostic {
	const computedLabel = binding.async === true ? 'async computed' : 'async-capable computed';

	return {
		code: 'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Async computed reads need an async boundary',
		message: `Cannot read ${computedLabel} "${read.source}" outside @try/@pending/@catch. Wrap the read in an async boundary.`,
		why: 'Async computed values can be pending or rejected during initial render and resume. The runtime needs an explicit TSRX async boundary to render pending and error UI.',
		primarySpan: read.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Wrap this template read in @try with @pending and @catch branches, or read a sync computed that is already guarded by an async boundary.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ASYNC_BOUNDARY_REQUIRED',
	};
}

export function graphDestructureDefaultUnsupportedDiagnostic(input: {
	readonly localName: string;
	readonly target: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Graph destructuring defaults are not supported yet',
		message: `Cannot create graph alias "${input.localName}" from "${input.target}" with a default value.`,
		why: 'A destructuring default must run only when the property value is undefined. The current graph alias artifact can represent a graph path, but not a fallback expression without changing JavaScript semantics.',
		primarySpan: input.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: input.target,
		source: input.source,
		suggestions: [
			{
				message:
					'Use an explicit computed() for fallback logic, or read the graph path directly without a destructuring default.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED',
	};
}

export function stateElementHandleUnsupportedDiagnostic(input: {
	readonly stateName: string;
	readonly handleName: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'element() handles cannot be stored in state',
		message: `Cannot store element handle "${input.handleName}" in state "${input.stateName}" because element handles are DOM locators, not serializable graph data.`,
		why: 'state() values are serialized into markless/state and resumed without running component bodies. An element() handle resolves through DOM locator metadata and must stay outside serialized graph state.',
		primarySpan: input.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: input.stateName,
		source: input.source,
		suggestions: [
			{
				message:
					'Keep element handles in element() bindings and bind them with el={handle}. Store serializable ids, flags, or data in state() instead.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_ELEMENT_HANDLE_UNSERIALIZABLE',
	};
}

export function sharedDefinitionCycleDiagnostic(input: {
	readonly cycle: ReadonlyArray<string>;
	readonly closingDependency: SemanticSharedDependency;
}): SemanticGraphDiagnostic {
	const cycleSource = input.cycle.join(' -> ');

	return {
		code: 'MARKLESS_SHARED_DEFINITION_CYCLE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Shared definitions cannot depend on each other circularly',
		message: `Cannot create shared definition cycle "${cycleSource}".`,
		why: 'shared() instances are created from graph context during initial render and resume. A cycle would require one shared instance before its own dependency graph can be created.',
		primarySpan: input.closingDependency.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Break the shared() dependency cycle by passing plain data between definitions or by moving the shared read into an event method that runs after instance creation.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_DEFINITION_CYCLE',
	};
}

export function elementHandleRequiredDiagnostic(
	binding: SemanticElementHandleBinding,
	graphBinding: SemanticGraphBinding | undefined,
): SemanticGraphDiagnostic {
	const actual = graphBinding ? `${graphBinding.kind}()` : 'an unknown value';

	return {
		code: 'MARKLESS_ELEMENT_HANDLE_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'el expects an element() handle',
		message: `Cannot bind el={${binding.handleName}} because "${binding.handleName}" is ${actual}, not an element() handle.`,
		why: 'DOM elements are host resources. el can only bind element() handles so resume can recover the current DOM locator without serializing a DOM node.',
		primarySpan: binding.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		elementLocator: binding.hostNodeId,
		suggestions: [
			{
				message:
					'Create a handle with element<T>() and bind that handle with el={handle}. Keep DOM-backed resources in attach={...}.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_REQUIRED',
	};
}

export function duplicateElementHandleDiagnostic(
	binding: SemanticElementHandleBinding,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_ELEMENT_HANDLE_DUPLICATE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'element() handle is bound more than once',
		message: `Cannot bind element handle "${binding.handleName}" to multiple live host elements.`,
		why: 'A resumed element handle must resolve to one current DOM locator. Binding one handle to multiple live elements would make lazy event code ambiguous.',
		primarySpan: binding.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		elementLocator: binding.hostNodeId,
		suggestions: [
			{
				message:
					'Create a separate element() handle for each host element, or move repeated element access into keyed state and behavior records.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_DUPLICATE',
	};
}

export function attachHostElementRequiredDiagnostic(
	ownerTagName: string | null,
	value: AnyNode,
	state: Pick<WalkState, 'filename' | 'source'>,
): SemanticGraphDiagnostic {
	const source = expressionSource(value, state.source);
	const owner = ownerTagName ? `<${ownerTagName}>` : 'a non-host element';

	return {
		code: 'MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'attach can only be bound to host elements',
		message: `Cannot bind attach={${source}} on component ${owner}. attach installs DOM behavior and needs a concrete host element owner.`,
		why: 'Element behaviors are resumed by locating the owning DOM element. A component is not a DOM locator and may render zero, one, or many host nodes.',
		primarySpan: sourceSpan(value, state.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Move attach={...} to a host element such as <canvas>, or make the component forward behavior to a known host element in its own TSRX body.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED',
	};
}

export function fallbackSpan(filename: string): SourceSpan {
	return {
		filename,
		start: 0,
		end: 0,
	};
}

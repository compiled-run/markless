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
	shadowedLocal?: boolean,
	source = '',
): SemanticGraphDiagnostic {
	const callSource = expressionSource(call, source);
	if (shadowedLocal) {
		return semanticGraphDiagnostic({
			code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
			title: 'Framework API must be imported',
			message: `\`${callSource}\` calls your local function \`${apiName}\`, but in \`.tsrx\` files \`${apiName}\` is a compiler-recognized markless API name. Rename the local function, or import the framework API from \`@markless/core\`.`,
			why: 'The compiler recognizes `state`/`computed`/`element`/`shared` by name in `.tsrx` reactive scopes so that graph ownership stays unambiguous for readers and tools.',
			span: sourceSpan(call, filename),
			suggestion: `Rename the helper (before: \`function ${apiName}(value) { ... }\` — after: \`function doubleValue(value) { ... }\`), or, if graph state was intended, delete the helper and add \`import { ${apiName} } from '@markless/core';\`.`,
			docsUrl: 'https://markless.dev/errors/MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
		});
	}

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

export function frameworkApiAliasUnsupportedDiagnostic(input: {
	readonly localName: string;
	readonly apiName: FrameworkApiName;
	readonly declarationKind: string;
	readonly init: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED',
		title: 'Framework APIs cannot be aliased or passed as values',
		message: `\`${input.declarationKind} ${input.localName} = ${input.apiName}\` copies the framework API \`${input.apiName}\` into a plain variable. \`${input.localName}(5)\` would not create graph state — the compiler only rewrites calls made through the imported name.`,
		why: `${input.apiName}() is compiled away into graph cells; it has no runtime function value that an alias could call.`,
		span: sourceSpan(input.init, input.filename),
		suggestion:
			'Call the imported API directly — before: `const makeState = state; let x = makeState(5);` — after: `let x = state(5);`. For a reusable initialization pattern, wrap the VALUE, not the API (`const defaults = () => ({ open: false }); const menu = state(defaults());`).',
		docsUrl: 'https://markless.dev/errors/MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED',
	});
}

export function nestedStateCreationDiagnostic(input: {
	readonly outerApi: 'state' | 'computed';
	readonly nestedApi: FrameworkApiName;
	readonly name: string;
	readonly init: AnyNode;
	readonly filename: string;
	readonly source: string;
}): SemanticGraphDiagnostic {
	const initSource = expressionSource(input.init, input.source);
	const stateInState = input.outerApi === 'state' && input.nestedApi === 'state';
	return semanticGraphDiagnostic({
		code: 'MARKLESS_STATE_NESTED_CREATION',
		title: stateInState
			? 'state() cannot be the initial value of another state()'
			: 'A framework API call cannot be a graph value',
		message: stateInState
			? `\`${initSource}\` declares graph state whose initial value is another state() call. \`${input.name}\` cannot store graph state as its value.`
			: `\`${initSource}\` creates a computed whose value would be another ${input.nestedApi}() call. \`${input.name}\` derives a value; it cannot derive graph nodes.`,
		why: stateInState
			? 'A graph cell serializes plain data across the resume boundary; a state() call declares a cell and has no serializable value form.'
			: `${input.nestedApi}() declares a graph node at compile time; it has no runtime value form that a cell or derive result can hold.`,
		span: sourceSpan(input.init, input.filename),
		suggestion: stateInState
			? 'Before: `const x = state(state(5));` — After: `const x = state(5);`.'
			: 'Derive the value directly — before: `const outer = computed(() => computed(() => count));` — after: `const outer = computed(() => count);`.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_NESTED_CREATION',
	});
}

export function computedDependencyCycleDiagnostic(input: {
	readonly name: string;
	readonly init: AnyNode;
	readonly filename: string;
	readonly source: string;
}): SemanticGraphDiagnostic {
	const initSource = expressionSource(input.init, input.source);
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
		title: 'A computed cannot depend on itself',
		message: `\`${initSource}\` reads \`${input.name}\` — the value it is defining. \`${input.name}\` cannot be derived from \`${input.name}\`.`,
		why: 'A derive is a pull-based graph node; a cycle in its dependencies means there is no order in which the graph can produce the value.',
		span: sourceSpan(input.init, input.filename),
		suggestion:
			'Reference the source binding you meant to derive from, or rename one of the two values if this was a shadowing typo.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
	});
}

function semanticGraphDiagnostic(input: {
	readonly code: SemanticGraphDiagnostic['code'];
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly span?: SourceSpan;
	readonly suggestion: string;
	readonly docsUrl: string;
}): SemanticGraphDiagnostic {
	return {
		code: input.code,
		severity: 'error',
		phase: 'semantic-graph',
		title: input.title,
		message: input.message,
		why: input.why,
		primarySpan: input.span,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: input.docsUrl,
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

export function moduleScopeElementDiagnostic(
	name: string,
	init: AnyNode | undefined,
	filename: string,
): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_MODULE_SCOPE',
		title: 'element() cannot be created at module scope',
		message: `Cannot create element handle "${name}" at module scope.`,
		why: 'Element handles are per-render DOM locators. A module-scope handle would be shared across requests and cannot point at one document-owned host element.',
		span: init ? sourceSpan(init, filename) : fallbackSpan(filename),
		suggestion: 'Move element() creation into the component that owns the host element and bind it with el={handle}.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_MODULE_SCOPE',
	});
}

export function unstableStateCreationSiteDiagnostic(input: {
	readonly name: string;
	readonly apiName: 'state' | 'computed';
	readonly site: 'computed' | 'handler' | 'branch' | 'loop';
	readonly init: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const siteText = unstableCreationSiteText(input.site, input.name);
	return {
		code: 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'state() and computed() need a stable creation site',
		message: `${input.apiName}() creates "${input.name}" ${siteText.message}. That would ship a graph cell whose identity does not match when this code runs.`,
		why: `${siteText.why} Graph cells are planned into the payload before rendering, so each authored declaration needs one stable component-body or shared owner.`,
		primarySpan: sourceSpan(input.init, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [{ message: siteText.fix }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_CREATION_SITE_UNSTABLE',
	};
}

export function helperStateReturnUnsupportedDiagnostic(input: {
	readonly name: string;
	readonly apiName: 'state' | 'computed';
	readonly init: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Helper-created state is not supported yet',
		message: `${input.apiName}() creates "${input.name}" inside a helper function. helper-created state is coming, but this compiler slice cannot yet connect the helper return value to the component graph binding.`,
		why: 'The spec allows helper-created graph state, but the current compiler does not track graph cells through helper return values. Shipping a payload cell now would leave component reads and writes outside the graph.',
		primarySpan: sourceSpan(input.init, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'For now, inline the state() or computed() declaration into the component body and pass the value to helper code.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED',
	};
}

export function crossModuleHelperStateReturnUnsupportedDiagnostic(input: {
	readonly helperName: string;
	readonly sourceModule: string;
	readonly init: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return helperReturnUnsupportedDiagnostic({
		title: 'Cross-module helper-created state is not supported yet',
		message: `Cannot call cross-module helper "${input.helperName}" from "${input.sourceModule}" as component state. This slice supports same-module helper-created state only.`,
		why: 'The compiler can now connect same-module helper-created state to a component call site, but this worktree does not have the multi-module harness needed to prove imported helper call trees.',
		suggestion: 'Move the helper into this .tsrx module for now, or declare the state in the component body and pass it to imported helper code.',
		span: sourceSpan(input.init, input.filename),
	});
}

export function unsupportedHelperStateReturnDiagnostic(input: {
	readonly helperName: string;
	readonly source: string;
	readonly init: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return helperReturnUnsupportedDiagnostic({
		title: 'Helper-created state return shape is not supported yet',
		message: `Cannot connect helper "${input.helperName}" return value "${input.source}" to graph state. This slice supports returning one state() or computed() binding directly.`,
		why: 'Object-return and more complex helper return shapes need additional return-path alias artifacts before reads, writes, and payload cells can stay unambiguous.',
		suggestion: 'Return the graph binding directly from the same-module helper, or declare the state in the component body for now.',
		span: sourceSpan(input.init, input.filename),
	});
}

function helperReturnUnsupportedDiagnostic(input: {
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly suggestion: string;
	readonly span: SourceSpan;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: input.title,
		message: input.message,
		why: input.why,
		primarySpan: input.span,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED',
	};
}

function unstableCreationSiteText(
	site: 'computed' | 'handler' | 'branch' | 'loop',
	name: string,
): { readonly message: string; readonly why: string; readonly fix: string } {
	return {
		computed: {
			message: `inside the computed that derives "${name}"`,
			why: 'A computed body re-runs whenever the graph needs its value, so a cell created there could be recreated on demand instead of keeping its own value.',
			fix: 'Declare the cell in the component body and derive from it inside computed().',
		},
		handler: {
			message: 'inside an event handler',
			why: 'An event handler runs once per event, so a cell created there would be recreated per interaction instead of existing as durable graph state.',
			fix: 'Declare the cell in the component body and write to it from the event handler.',
		},
		branch: {
			message: 'inside a branch',
			why: 'A branch may or may not run for a request, but the payload must know every graph cell before rendering.',
			fix: 'Declare the cell unconditionally in the component body and branch only around the UI or value that uses it.',
		},
		loop: {
			message: 'inside a loop',
			why: 'A loop body can run any number of times, so one authored declaration cannot map to one stable payload cell.',
			fix: 'Declare component-level state outside the loop; use keyed repeat row graph scope when per-row state is supported.',
		},
	}[site];
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

export function templateAsValueDiagnostic(input: {
	readonly siteSource: string;
	readonly name?: string;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const target = input.name ? ` in "${input.name}"` : '';
	return {
		code: 'MARKLESS_TEMPLATE_AS_VALUE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'A template is not a value',
		message: `${input.siteSource} puts a template${target} where Markless needs runtime data. Templates compile into page structure with locators, not values to store, pass, or serialize.`,
		why: 'Markless has no VDOM. Templates compile to DOM structure and resume locators, so there is no render-output object that can live in state, a computed value, a local variable, or an array.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: input.siteSource,
		suggestions: [
			{
				message:
					'Keep templates in the tree. Use @if/@for for conditional or repeated structure, extract child components for reusable structure, or pass nested content through children projection.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_AS_VALUE',
	};
}

export function stateWriteInTemplateDiagnostic(input: {
	readonly source: string;
	readonly target: string;
	readonly targetSpan?: SourceSpan;
	readonly filename: string;
	readonly branchCondition?: boolean;
}): SemanticGraphDiagnostic {
	const message = input.branchCondition
		? `\`${input.source}\` assigns to \`${input.target}\` while deciding which branch to render. A branch test is a read; writing \`${input.target}\` there would re-trigger the very update that is evaluating it. If you meant a comparison, write \`===\`.`
		: `\`${input.source}\` writes to \`${input.target}\` while rendering its value. A template expression is a DOM read; writing \`${input.target}\` there would re-trigger the same DOM update that is rendering it.`;
	return {
		code: 'MARKLESS_STATE_WRITE_IN_TEMPLATE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Cannot write state inside a template expression',
		message,
		why: input.branchCondition
			? 'DOM updates are the only effects in the demand-driven graph; a write inside a branch test creates a self-waking cycle that cannot resume.'
			: 'DOM updates are the only effects in the demand-driven graph; a write inside a DOM read creates a self-waking cycle that cannot resume.',
		primarySpan: input.targetSpan ?? fallbackSpan(input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: input.target,
		source: input.source,
		suggestions: [
			{
				message:
					'Render the value directly and move the mutation to an event handler or another explicit write site.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_TEMPLATE',
	};
}

export function stateWriteInComputedDiagnostic(input: {
	readonly source: string;
	readonly target: string;
	readonly targetSpan?: SourceSpan;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_STATE_WRITE_IN_COMPUTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'A computed cannot write graph state',
		message: `\`${input.source}\` writes to \`${input.target}\` while deriving a computed value. A computed is a graph read, so writing graph state there would re-trigger the same derivation.`,
		why: 'A computed is a demand-driven read in the graph; the only effects in the system are compiler-generated DOM updates, so a write inside a derive is a self-waking cycle that cannot resume.',
		primarySpan: input.targetSpan ?? fallbackSpan(input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		statePath: input.target,
		source: input.source,
		suggestions: [
			{
				message:
					'Keep computed() pure. Move graph writes to an event handler and derive only from graph reads.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_WRITE_IN_COMPUTED',
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

export function elementHandlePropUnsupportedDiagnostic(
	binding: SemanticElementHandleBinding,
): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED',
		title: 'Nested prop-forwarded element handles are not supported yet',
		message: `Cannot bind el={${binding.handleName}} because this slice only supports element handles passed as direct component props, not through arrays or nested object props.`,
		why: 'Direct prop forwarding has one parent-owned element() handle for one child prop. Array and nested object containers need deeper edge tracking before the compiler can prove the owning handle.',
		span: binding.sourceSpan,
		suggestion:
			'Pass the element() handle as its own component prop for now, or bind it in the component that renders the host element.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_PROP_UNSUPPORTED',
	});
}

export function unboundElementHandleDiagnostic(input: {
	readonly handleName: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_ELEMENT_HANDLE_UNBOUND',
		severity: 'warning',
		phase: 'semantic-graph',
		title: 'element() handle is read before it is bound',
		message: `Reading element handle "${input.source}" will produce undefined because "${input.handleName}" is never bound with el={${input.handleName}} in this component.`,
		why: 'element() handles are DOM locator references, not state. A read is only useful after the handle has a host element binding that resume can locate.',
		primarySpan: input.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: input.source,
		suggestions: [
			{
				message:
					'Bind the handle to one host element with el={handle}, or remove the read if undefined is intentional.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_UNBOUND',
	};
}

export function elementHandleRenderReadDiagnostic(input: {
	readonly handleName: string;
	readonly source: string;
	readonly sourceSpan?: SourceSpan;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_RENDER_READ',
		title: 'DOM handles cannot be read while rendering',
		message: `Cannot render "${input.source}" because "${input.handleName}" is an element() handle, not serializable graph state.`,
		why: 'During initial render the browser DOM element does not exist, and browser resume does not rerun component bodies. Element handles are available to lazy event or behavior code after resume locates the host node.',
		span: input.sourceSpan,
		suggestion: 'Read DOM properties inside an event handler or attach behavior, and render serializable state() or computed() data instead.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_RENDER_READ',
	});
}

export function duplicateElementHandleDiagnostic(
	binding: SemanticElementHandleBinding,
): SemanticGraphDiagnostic {
	const repeated = binding.keyedRepeatScopeIds.length > 0;
	return {
		code: 'MARKLESS_ELEMENT_HANDLE_DUPLICATE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'element() handle is bound more than once',
		message: repeated
			? `Cannot bind element handle "${binding.handleName}" inside a keyed repeat because one authored handle would point at many row host elements.`
			: `Cannot bind element handle "${binding.handleName}" to multiple live host elements.`,
		why: repeated
			? 'Each repeated row has its own DOM locator. A single element() handle cannot serialize one stable locator for every row instance.'
			: 'A resumed element handle must resolve to one current DOM locator. Binding one handle to multiple live elements would make lazy event code ambiguous.',
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

export function repeatKeyRequiredDiagnostic(input: {
	readonly node: AnyNode;
	readonly itemName: string;
	readonly collectionSource: string;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_REPEAT_KEY_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'This @for needs a key',
		message: `@for (const ${input.itemName} of ${input.collectionSource}) repeats reactive state without a key. When ${input.collectionSource} changes, the rows of this list have no identity to update, reorder, or resume by.`,
		why: 'A keyed loop item keeps its state, events, and DOM attached to the same logical item across reorder, insert, and delete; without a key there is no stable identity root.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Add a stable domain key such as \`@for (const ${input.itemName} of ${input.collectionSource}; key ${input.itemName}.id)\`, or key by position with \`index i; key i\` when state should follow the slot.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_REQUIRED',
	} as SemanticGraphDiagnostic;
}

export function repeatKeyIsIndexDiagnostic(input: {
	readonly node: AnyNode;
	readonly itemName: string;
	readonly indexName: string;
	readonly collectionSource: string;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_REPEAT_KEY_IS_INDEX',
		severity: 'warning',
		phase: 'semantic-graph',
		title: 'Keying by index makes row identity follow the position',
		message: `key ${input.indexName} identifies each row of ${input.collectionSource} by its position, not by its data. If ${input.collectionSource} reorders, inserts, or deletes, any row-local state, event wiring, and DOM reuse stay with the slot number.`,
		why: 'The key is the identity root for a repeated graph scope; a positional key pins that scope to the slot, which is only correct when state genuinely belongs to the position.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Key by a stable field of the item when state belongs to the item, such as \`@for (const ${input.itemName} of ${input.collectionSource}; key ${input.itemName}.id)\`. Keep \`key ${input.indexName}\` when state should follow the slot.`,
			},
			{
				message:
					'To silence this warning for one site, add `// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: state follows the slot intentionally` on the @for header line.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_IS_INDEX',
	} as SemanticGraphDiagnostic;
}

export function repeatKeyUnstableDiagnostic(input: {
	readonly keyNode: AnyNode;
	readonly itemName: string;
	readonly collectionSource: string;
	readonly keySource: string;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_REPEAT_KEY_UNSTABLE',
		severity: 'error',
		phase: 'semantic-graph',
		title: '@for key must identify the item stably',
		message: `key ${input.keySource} does not derive identity from ${input.itemName} or an explicit index alias. Row state, event wiring, and DOM reuse follow the key, so rows of ${input.collectionSource} could not be matched with themselves reliably.`,
		why: 'The key is the stable identity root for a repeated graph scope across reorder, insert, delete, and resume; a value that is not derived from the item or its position cannot identify anything.',
		primarySpan: sourceSpan(input.keyNode, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Key by a stable field of ${input.itemName}, such as \`key ${input.itemName}.id\`, or key by position with \`index i; key i\` when state should follow the slot.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_UNSTABLE',
	} as SemanticGraphDiagnostic;
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

// TSRX parses `module server { ... }` blocks and identifier-source imports,
// but this host has not implemented server/client splitting. Decision draft:
// specs/framework/08-deferred-decisions.md "TSRX Submodule Host Boundary".
export function submoduleUnsupportedDiagnostic(
	kind: 'module-block' | 'identifier-import',
	name: string,
	node: AnyNode,
	filename: string,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_SUBMODULE_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'TSRX submodules are not supported by this host yet',
		message:
			kind === 'module-block'
				? `The submodule block "module ${name} { ... }" has no server/client boundary semantics in markless yet; its code runs wherever this module runs.`
				: `The identifier-source import "import ... from ${name};" has no submodule resolution in markless yet; nothing is split out of the client bundle.`,
		why: 'TSRX defines submodule syntax but defers boundary semantics to the host. Until markless implements splitting, treating this as supported would silently ship server-intended code to the client.',
		primarySpan: sourceSpan(node, filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Move the code into a separate module with a string import specifier, or wait for the submodule host boundary decision in specs/framework/08-deferred-decisions.md.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SUBMODULE_UNSUPPORTED',
	};
}

export function fallbackSpan(filename: string): SourceSpan {
	return {
		filename,
		start: 0,
		end: 0,
	};
}

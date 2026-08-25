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
import type { PendingElementHandleIdref, WalkState } from './types.ts';

export function storageKeyStaticDiagnostic(input: {
	readonly argument: 'key' | 'fallback';
	readonly call: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const keyArgument = input.argument === 'key';
	return semanticGraphDiagnostic({
		code: 'MARKLESS_STORAGE_KEY_STATIC',
		title: keyArgument ? 'Storage key must be static' : 'Storage fallback must be static',
		message: keyArgument
			? 'storage(key, fallback) requires an explicit key to be a static string literal; omit it to derive markless:<identifier>.'
			: 'storage() requires its fallback to be a static string literal.',
		why: keyArgument
			? 'The compiler bakes the key into a stable graph identity and storage key at compile time; it cannot be a runtime value.'
			: 'The compiler must embed the fallback as the initial graph value without executing storage() at runtime.',
		span: sourceSpan(input.call, input.filename),
		suggestion: keyArgument
			? "Pass a string literal, for example `storage('theme', 'light')`, or omit the key: `storage('light')`."
			: "Use a string literal fallback, for example `storage('light')`.",
		docsUrl: 'https://markless.dev/errors/MARKLESS_STORAGE_KEY_STATIC',
	});
}

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
			why: 'The compiler recognizes `state`/`computed`/`element`/`shared`/`storage` by name in `.tsrx` reactive scopes so that graph ownership stays unambiguous for readers and tools.',
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

export function callbackPropArityUnsupportedDiagnostic(input: {
	readonly propName: string;
	readonly parameterCount: number;
	readonly reason?: string;
	readonly callback: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED',
		title: 'Callback props accept at most one parameter',
		message: `Callback prop \`${input.propName}\` is unsupported because ${input.reason ?? `it declares ${input.parameterCount} parameters`}. Lazy callback symbols accept zero parameters or one simple identifier, object pattern, or array pattern without top-level defaults or rest.`,
		why: 'The callback transport carries one callback value across the lazy-symbol boundary. Multiple parameters, defaults, and rest bindings do not have supported parameter semantics when the symbol runs.',
		span: sourceSpan(input.callback, input.filename),
		suggestion:
			'Pass a single object instead — change `(kind, payload) => ...` to `({ kind, payload }) => ...` and invoke the callback with one object value; remove parameter defaults and rest bindings.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_CALLBACK_PROP_ARITY_UNSUPPORTED',
	});
}

export function componentPropExpressionUnsupportedDiagnostic(input: {
	readonly propName: string;
	readonly source: string;
	readonly childComponentName: string;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED',
		title: 'A prop expression that reads state needs a route the child can follow',
		message: `Prop \`${input.propName}\` on \`<${input.childComponentName}>\` is written as \`${input.source}\`, which reads state but is not an expression this compiler can route.`,
		why: 'A child reads a prop through the graph node the parent named. An expression with no node behind it can only be seeded once, from whatever the value happened to be at render - so the child would show a stale value forever and nothing would say so.',
		span: sourceSpan(input.node, input.filename),
		suggestion:
			'Pass a value the compiler can follow: a plain read (`group.value`), or an expression built only from reads, operators and method calls on those reads (`group.value.includes(item.value)`). If the value needs a function of your own, put that function inside a `computed()` and pass the computed.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED',
	});
}

export function componentSpreadUnsupportedDiagnostic(input: {
	readonly source: string;
	readonly childComponentName: string;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPONENT_SPREAD_UNSUPPORTED',
		title: 'Only the props rest binding can be spread onto a component',
		message: `\`{...${input.source}}\` on \`<${input.childComponentName}>\` cannot be forwarded, because \`${input.source}\` is not this component's props rest binding.`,
		why: 'What a spread carries onto a child component is decided at build time, from the signature that produced it. An object assembled anywhere else has no build-time contents, so the child would render without the entries and nothing would say so.',
		span: sourceSpan(input.node, input.filename),
		suggestion:
			'Spread the rest binding of this component\'s own props (`function Part({ known, ...rest })` then `<Child {...rest} />`), or write the props you mean out by name on the tag.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_SPREAD_UNSUPPORTED',
	});
}

export function memberTagUnresolvedDiagnostic(input: {
	readonly tagName: string;
	readonly rootName: string;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPONENT_TAG_UNRESOLVED',
		title: 'Member component tag must come from an import',
		message: `Cannot resolve \`<${input.tagName} />\` because \`${input.rootName}\` is not imported in this file.`,
		why: 'The compiler links a child component to the module it comes from at build time. Without an import it cannot find the component to render, and dropping the tag silently would delete the subtree.',
		span: sourceSpan(input.node, input.filename),
		suggestion: `Import the object that holds the component, for example \`import * as ${input.rootName} from './${input.rootName}.tsrx';\` or \`import { ${input.rootName} } from './${input.rootName}.ts';\`.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_TAG_UNRESOLVED',
	});
}

// The module behind a member tag is linked, and it does not serve the part the
// tag names. Emitting the tag anyway would compile to a named read off a module
// that publishes no such export, which surfaces as a bundler MISSING_EXPORT or a
// browser "does not provide an export named" instead of a compiler error.
export function memberTagPartMissingDiagnostic(input: {
	readonly tagName: string;
	readonly partName: string;
	readonly importSource: string;
	readonly served: ReadonlyArray<string>;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const served = input.served.length
		? input.served.map((name) => `\`${name}\``).join(', ')
		: 'no components';
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPONENT_TAG_UNRESOLVED',
		title: 'Member component tag must name a component that module serves',
		message: `Cannot resolve \`<${input.tagName} />\` because \`${input.importSource}\` does not export a component named \`${input.partName}\`.`,
		why: `That module serves ${served}. A compiled .tsrx module publishes its components under the names it exports them as, so a tag naming anything else has no component to render, and emitting it anyway moves the failure to bundle time.`,
		span: sourceSpan(input.node, input.filename),
		suggestion: `Name one of the components \`${input.importSource}\` exports, or export \`${input.partName}\` from it.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_TAG_UNRESOLVED',
	});
}

// A compiled .tsrx module serves its components from one flat map on its
// surface, keyed by the name it exports each under. A tag that walks two
// segments into that surface names a place the map cannot hold, and composing
// its last segment alone would render a different part without saying so.
export function memberTagNestedPartDiagnostic(input: {
	readonly tagName: string;
	readonly surfacePath: ReadonlyArray<string>;
	readonly importSource: string;
	readonly served: ReadonlyArray<string>;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const served = input.served.length
		? input.served.map((name) => `\`${name}\``).join(', ')
		: 'no components';
	const path = input.surfacePath.join('.');
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPONENT_TAG_UNRESOLVED',
		title: 'Member component tag must name one component of a module surface',
		message: `Cannot resolve \`<${input.tagName} />\` because \`${input.importSource}\` serves its components one level deep and \`${path}\` walks ${input.surfacePath.length} levels into it.`,
		why: `That module serves ${served}, each under a single export name. Nothing on its surface holds a nested group, so this tag names no component, and composing only \`${input.surfacePath.at(-1)}\` would silently render a different one.`,
		span: sourceSpan(input.node, input.filename),
		suggestion: `Name a component \`${input.importSource}\` exports directly, or group the parts in a plain \`.ts\` barrel and import that instead.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_TAG_UNRESOLVED',
	});
}

export function computedDependencyGraphCycleDiagnostic(input: {
	readonly cycle: ReadonlyArray<string>;
}): SemanticGraphDiagnostic {
	const cycleSource = input.cycle.join(' -> ');
	return semanticGraphDiagnostic({
		code: 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
		title: 'Computed dependencies cannot form a cycle',
		message: `Cannot create computed dependency cycle \`${cycleSource}\`.`,
		why: 'A derive is a pull-based graph node; a cycle in its dependencies means there is no order in which the graph can produce the value.',
		suggestion: `Break the dependency loop between ${input.cycle.slice(0, -1).join(', ')} so each computed can be evaluated from already available graph values.`,
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
		suggestion:
			'Move element() creation into the component that owns the host element and bind it with el={handle}.',
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
		title: 'Helper-created state return shape is not supported',
		message: `${input.apiName}() creates "${input.name}" inside a helper function, but the compiler cannot connect this helper return shape to the component graph binding.`,
		why: 'The compiler supports same-module direct helper returns and compiled imported helpers. This gate remains for residual helper shapes such as object returns, nested return chains, or imported helpers without module graph interface data.',
		primarySpan: sourceSpan(input.init, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Return the graph binding directly from the helper, compile the imported helper with interface output, or declare the state in the component body.',
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
		title: 'Imported helper-created state needs module analysis',
		message: `Cannot call imported helper "${input.helperName}" from "${input.sourceModule}" as component state because graph analysis is not available for that module.`,
		why: 'Per-module compilation can connect helper-created state only when the imported module was compiled with a module graph interface that describes exported helper graph semantics.',
		suggestion:
			'Compile the helper module with interface output and pass that interface to this module compile, or declare the state in this component body for now.',
		span: sourceSpan(input.init, input.filename),
	});
}

export function crossModuleStateImportDiagnostic(input: {
	readonly importedName: string;
	readonly sourceModule: string;
	readonly filename: string;
	readonly sourceSpan?: SourceSpan;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_STATE_CROSS_MODULE_IMPORT',
		title: 'Imported module-scope state is not resumable',
		message: `Cannot import graph state "${input.importedName}" from "${input.sourceModule}" into "${input.filename}".`,
		why: 'Module-scope state has no per-request graph ownership. Importing it would compile reads as dead snapshots and writes as plain module mutation instead of connecting to this document payload.',
		span: input.sourceSpan,
		suggestion:
			'Move the state() call into the component that owns it, or expose request/container/page lifetime data with shared() and import that shared() definition instead.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_CROSS_MODULE_IMPORT',
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
		suggestion:
			'Return the graph binding directly from the same-module helper, or declare the state in the component body for now.',
		span: sourceSpan(input.init, input.filename),
	});
}

function helperReturnUnsupportedDiagnostic(input: {
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly suggestion: string;
	// Spanless nodes stay reportable: primarySpan is optional on the diagnostic.
	readonly span: SourceSpan | undefined;
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

export function invalidSharedScopeDiagnostic(input: {
	readonly valueSource?: string;
	readonly valueSpan?: SourceSpan;
}): SemanticGraphDiagnostic {
	const valid = '"request", "container", "page", and "widget"';
	const literal = input.valueSource?.startsWith("'") || input.valueSource?.startsWith('"');
	const valueText = literal ? `"${input.valueSource?.slice(1, -1)}"` : input.valueSource;
	return semanticGraphDiagnostic({
		code: 'MARKLESS_SHARED_SCOPE_INVALID',
		title: 'shared() scope must be valid',
		message: literal
			? `Unknown shared() scope ${valueText}. Valid scopes are ${valid}.`
			: `shared() scope must be a string literal. Valid scopes are ${valid}.`,
		why: 'shared() scope controls graph lifetime. Silently dropping an unknown scope changes whether data is request, container, page, or widget owned.',
		span: input.valueSpan,
		suggestion:
			'Use `shared(factory, { scope: "request" })`, `shared(factory, { scope: "container" })`, `shared(factory, { scope: "page" })`, or `shared(factory, { scope: "widget" })`.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_SCOPE_INVALID',
	});
}

/**
 * Defect 69. `krs();` instead of `const group = krs();`. The call used to
 * compile: the client body dropped it, and the server prelude emitted it
 * verbatim, where it reached the bundler's fail-closed `MARKLESS_SHARED_CALL_UNCOMPILED`
 * export and threw at render time — so the same page worked client-rendered and
 * threw server-rendered.
 *
 * It is refused rather than lowered because an unbound call cannot carry
 * meaning: every read and write of a shared instance resolves through the local
 * name the call was bound to, so a call with no name contributes nothing a later
 * pass can resolve. Refusing at build time is also free of regression risk,
 * since a call in this shape threw on every server render and no working code
 * can depend on it.
 */
export function unboundSharedCallDiagnostic(input: {
	readonly definitionName: string;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	const binding = `const ${input.definitionName}Instance = ${input.definitionName}()`;
	return {
		code: 'MARKLESS_SHARED_CALL_UNBOUND',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'a shared() call must be bound to a name',
		message: `shared() definition "${input.definitionName}" is called but its result is discarded.`,
		why: 'Reads and writes of a shared instance resolve through the name the call was bound to. An unbound call names nothing, so it lowers to no client behavior while the server render still tries to run it and throws.',
		primarySpan: input.span,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: input.definitionName,
		suggestions: [
			{
				message: `Bind the call and read through the name: \`${binding}\`.`,
			},
			{
				message: 'Delete the call if nothing in this component reads the shared instance.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_CALL_UNBOUND',
	};
}

// A shared() definition that several components of its own module resolve is a
// widget family shape. Left without a scope it is page-scoped, so two of those
// widgets on one page silently share one graph. The warning makes the scope a
// choice instead of an omission; either spelling silences it.
export function implicitFamilyScopeDiagnostic(input: {
	readonly definitionName: string;
	readonly componentNames: ReadonlyArray<string>;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	const components = input.componentNames.join(', ');
	return {
		code: 'MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT',
		severity: 'warning',
		phase: 'semantic-graph',
		title: 'shared() family has no declared scope',
		message: `${input.componentNames.length} components in this module resolve shared() "${input.definitionName}" (${components}), which is the shape of a widget family, but no scope is declared so it is page-scoped.`,
		why: 'A page-scoped family gives every widget of that family on one page the same graph, so two of them move together. That is a real choice, but silence makes it a surprise.',
		primarySpan: input.span,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: input.definitionName,
		suggestions: [
			{
				message: `Add { scope: 'widget' } to give each rendered widget its own graph.`,
			},
			{
				message: `Write { scope: 'page' } explicitly to keep one graph shared across the page.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT',
	};
}

export function callbackSlotSourceDiagnostic(input: {
	readonly slotName: string;
	readonly componentName: string;
	readonly definitionName: string;
	readonly valueSource: string;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_CALLBACK_SLOT_SOURCE_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'A callback slot can only be filled by the widget root’s own callback prop',
		message: `"${input.componentName}" assigns ${input.valueSource} into the "${input.slotName}" callback slot of shared() "${input.definitionName}", and ${input.valueSource} is not one of this component's callback props.`,
		why: 'A callback slot is a compile-time route, not a stored value: the build records that this widget root’s callback prop answers the slot, and a part invoking the slot dispatches straight to the consumer’s handler. A local function has no consumer to route to, so nothing could be recorded and the call would silently do nothing.',
		...(input.span ? { primarySpan: input.span } : {}),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: input.valueSource,
		suggestions: [
			{
				message: `Declare the handler as a prop of ${input.componentName} and assign that prop: ${input.slotName} = <thatProp>.`,
			},
			{
				message:
					'To run widget-local logic on the same gesture, call it from the factory method that invokes the slot.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_CALLBACK_SLOT_SOURCE_UNSUPPORTED',
	};
}

export function unboundCallbackSlotDiagnostic(input: {
	readonly slotName: string;
	readonly definitionName: string;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_CALLBACK_SLOT_UNBOUND',
		severity: 'warning',
		phase: 'semantic-graph',
		title: 'A callback slot is invoked but no component fills it',
		message: `shared() "${input.definitionName}" invokes its "${input.slotName}" callback slot, but no component in this module assigns a callback prop into it.`,
		why: 'Without an assignment there is no widget root to route the call to, so the invocation can never reach a consumer and does nothing at runtime.',
		...(input.span ? { primarySpan: input.span } : {}),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: input.slotName,
		suggestions: [
			{
				message: `Assign the widget root's callback prop into the slot: <instance>.${input.slotName} = <thatProp>.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_CALLBACK_SLOT_UNBOUND',
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

/**
 * A dangling IDREF handle is an error, not a warning, and it is its own code
 * rather than a promotion of MARKLESS_ELEMENT_HANDLE_UNBOUND.
 *
 * The two failures are not the same failure. An unbound handle READ renders
 * `undefined` where you can see it, and `// markless-allow` can legitimately
 * say the read is intentional - which only works because that code is a
 * warning; markless-allow cannot suppress errors. A dangling IDREF renders
 * nothing wrong at all: the page looks right, the relationship is simply
 * absent, and nothing downstream ever notices. That is the worst accessibility
 * bug class there is, so it stops the build and cannot be waived.
 */
export function unboundIdrefElementHandleDiagnostic(
	reference: PendingElementHandleIdref,
): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND',
		title: 'element() handle is referenced but never bound',
		message: `Cannot resolve ${reference.attributeName}={${reference.source}} because "${reference.handleName}" is never bound with el={${reference.handleName}} in this component.`,
		why: 'An IDREF position names another element. With no el={handle} binding there is no element to name, so the compiler would emit an attribute pointing at nothing - a silently broken relationship that renders correctly and helps nobody.',
		span: reference.sourceSpan,
		suggestion: `Bind the handle to the element it names with el={${reference.handleName}}, or remove the ${reference.attributeName} attribute.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND',
	});
}

/**
 * An IDREF position takes exactly one handle, written directly. Lists
 * (`aria-labelledby={[a, b]}`), joins, and choices are refused in this slice
 * rather than lowered.
 *
 * Refusal is a decision about ownership, not difficulty. Joining ids would make
 * the compiler mint several ids, choose their order, and pick a separator - all
 * of which are id SPELLING, which these records deliberately do not own. A
 * refusal is loud and reversible; a silent join would bake one emitter's
 * spelling into the graph.
 */
export function compositeIdrefElementHandleDiagnostic(input: {
	readonly attributeName: string;
	readonly source: string;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE',
		title: 'One element() handle per IDREF attribute',
		message: `Cannot resolve ${input.attributeName}={${input.source}}. An IDREF position takes exactly one element() handle written directly, not a list, a join, or a choice between handles.`,
		why: 'The compiler resolves the relationship and the emitter mints the id. Combining handles would require the compiler to spell and order several ids inside one attribute value, and id spelling is not something this record owns.',
		span: input.span,
		suggestion: `Reference one element() handle directly, as ${input.attributeName}={handle}.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE',
	});
}

/**
 * A handle bound inside a keyed repeat locates one element per row. Naming it
 * from an IDREF position asks which row, and this slice deliberately does not
 * answer: per-row identity belongs with the code that owns row identity.
 * Refusing keeps the ambiguity visible instead of resolving it to row one.
 */
export function rowOwnedIdrefElementHandleDiagnostic(
	reference: PendingElementHandleIdref,
): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED',
		title: 'A repeated element() handle cannot be named by an IDREF',
		message: `Cannot resolve ${reference.attributeName}={${reference.source}} because "${reference.handleName}" is bound inside a keyed repeat, so it names one element per row rather than one element.`,
		why: 'Every row owns its own element and would need its own id. One authored handle cannot name one of them, and picking a row silently would make the relationship point at whichever row happened to render first.',
		span: reference.sourceSpan,
		suggestion: 'Bind a separate element() handle outside the repeat for the element this attribute names, or move the relationship inside the row so each row names its own element.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED',
	});
}

/**
 * The widget root is the component that resolves the factory, and it renders
 * BEFORE the token naming its own instance exists: that token is written into
 * the seed map the root hands its parts. A part reads it; the root cannot. The
 * same holds for a factory whose scope is not `widget`, where one handle would
 * name one element per page rather than one per rendered widget.
 */
export function widgetRootIdrefElementHandleDiagnostic(
	reference: PendingElementHandleIdref,
): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT',
		title: 'This shared() element() handle cannot be named by an IDREF here',
		message: `Cannot resolve ${reference.attributeName}={${reference.source}} because "${reference.handleName}" is declared in a shared() factory that this component roots, or in a factory that is not { scope: 'widget' }.`,
		why: 'A widget-scoped factory is one graph per rendered widget, so the minted id has to carry which widget it belongs to. That token is written when the widget root seeds the parts placed inside it, which happens after the root itself has started rendering and never happens at all for a page-wide factory.',
		span: reference.sourceSpan,
		suggestion: "Move the element() handle and both ends of the relationship into parts placed inside the widget root, and give the factory { scope: 'widget' }.",
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT',
	});
}

/**
 * The element an IDREF names receives a minted id, so an authored id on the
 * same element would produce two id attributes and the relationship would
 * silently follow whichever one the parser kept.
 */
export function idrefElementHandleIdConflictDiagnostic(input: {
	readonly handleName: string;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_IDREF_ID_CONFLICT',
		title: 'An element named by an IDREF cannot also declare an id',
		message: `Cannot mint the id for el={${input.handleName}} because this element already declares an id attribute.`,
		why: 'An IDREF position is written from the id the compiler mints for the bound element. A second, authored id on the same element would emit two id attributes and leave the relationship pointing at whichever one the HTML parser kept.',
		span: input.span,
		suggestion: 'Remove the authored id from this element, or drop the element() handle and write the IDREF attribute with your own id string.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_IDREF_ID_CONFLICT',
	});
}

/**
 * `anchorName` / `positionAnchor` as an attribute. Refused rather than written:
 * neither is an HTML attribute, so a browser reading the emitted markup would
 * find `anchorname="..."` and ignore it, leaving the popup positioned against
 * its containing block and looking merely misplaced.
 */
export function cssAnchorAttributeDiagnostic(input: {
	readonly attributeName: string;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_CSS_ANCHOR_ATTRIBUTE',
		title: 'CSS anchoring is regular CSS',
		message: `Cannot write ${input.attributeName} as an attribute. CSS anchoring is regular CSS - declare anchor-name/position-anchor in a <style> block or your stylesheet.`,
		why: 'An element takes the attributes HTML defines. anchor-name and position-anchor are CSS properties with no HTML attribute of the same name, so nothing on the page would read them.',
		span: input.span,
		suggestion:
			'Declare the anchor in a <style> block in this file, or in your stylesheet, and select the element the way you select it for any other style.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_CSS_ANCHOR_ATTRIBUTE',
	});
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
		suggestion:
			'Read DOM properties inside an event handler or attach behavior, and render serializable state() or computed() data instead.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_RENDER_READ',
	});
}

/**
 * An IDREF names exactly ONE element, and an array-typed handle names a set.
 * Lifting the duplicate refusal for ordinary `el=` bindings answered "which
 * element does a resumed handle locate" with an order, but `aria-labelledby`
 * has no order to ride - it would have to pick a member, and picking silently
 * is the defect.
 */
export function pluralIdrefElementHandleDiagnostic(
	reference: PendingElementHandleIdref,
): SemanticGraphDiagnostic {
	return semanticGraphDiagnostic({
		code: 'MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF',
		title: 'An array-typed element() handle cannot fill this position',
		message: `Cannot resolve ${reference.attributeName}={${reference.source}} because "${reference.handleName}" is declared as an array (element<T[]>()), so it names an ordered set of elements rather than one.`,
		why: 'This attribute points at exactly one element. A handle declared with an array type argument may be bound on many elements, and an IDREF carries no order to say which member it means, so the compiler would have to pick one silently.',
		span: reference.sourceSpan,
		suggestion: `Declare a second, single element() handle for the one element this attribute points at and bind it there, leaving "${reference.handleName}" for the set.`,
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF',
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
			? `Cannot bind element handle "${binding.handleName}" inside a keyed repeat because one authored handle would point at many row host elements. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`
			: `Cannot bind element handle "${binding.handleName}" to multiple live host elements. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
		why: repeated
			? 'Each repeated row has its own DOM locator, so one handle declared as a single element cannot say which row it means.'
			: 'A resumed element handle declared as a single element must resolve to one current DOM locator. Binding it to multiple live elements would make lazy event code ambiguous.',
		primarySpan: binding.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		elementLocator: binding.hostNodeId,
		suggestions: [
			{
				// The widening is the type argument and nothing else, and it must be
				// written literally: the graph reads the spelling, not a resolved
				// type, so an alias for the array type still reads as one element.
				message: `Declare the handle as an ordered set by widening its type argument to an array - element<HTMLElement[]>() - written literally as T[], Array<T> or readonly T[]. Reads then answer every bound element in document order. Otherwise create a separate element() handle for each host element.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_HANDLE_DUPLICATE',
	};
}

export function unsupportedRowElementHandleDiagnostic(
	binding: SemanticElementHandleBinding,
): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_ROW_ELEMENT_HANDLE_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'This is not a row-ownable element() handle',
		message: `Cannot bind el={${binding.handleName}} inside a keyed repeat. A row host takes a declared element() handle, named directly (el={row}) or as one member off a shared() instance (el={select.optionEls}). markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
		why: 'The keyed row record owns one host slot per authored handle and repeat key. Forwarded props, deeper paths, and nested repeat scopes do not identify one compiler-proven row-owned slot.',
		primarySpan: binding.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		elementLocator: binding.hostNodeId,
		suggestions: [
			{
				message:
					'Declare the handle with const row = element<HTMLElement[]>() in this component or in the shared() factory the row reads, then bind el={row} - or el={family.row} - directly on the keyed row host.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ROW_ELEMENT_HANDLE_UNSUPPORTED',
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

export function repeatCollectionUnreadableDiagnostic(input: {
	readonly node: AnyNode;
	readonly itemName: string;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_REPEAT_COLLECTION_UNREADABLE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'This @for collection cannot be read',
		message: `@for (const ${input.itemName} of ...) has a collection the compiler could not read back as an expression, so the repeat has neither a state graph node nor an authored expression to take its rows from. It would render no rows at all.`,
		why: 'Rows come either from a reactive graph read or from the authored collection expression evaluated in module scope; a repeat with neither has no source of rows on the server or in the browser.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Loop over a named collection, such as \`@for (const ${input.itemName} of items; key ${input.itemName}.id)\` where \`items\` is state, a module constant, or an import.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_COLLECTION_UNREADABLE',
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

/**
 * overlay marks structural elevation and carries no inputs, so its value has to
 * be readable at compile time. A non-literal is refused rather than lowered:
 * there is no dependency edge that could re-elevate the host when it changes.
 */
export function overlayValueUnsupportedDiagnostic(input: {
	readonly source: string;
	readonly carrier: 'attribute' | 'spread';
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	const bound =
		input.carrier === 'spread'
			? `Cannot carry overlay through {...${input.source}}`
			: `Cannot bind overlay={${input.source}}`;

	return semanticGraphDiagnostic({
		code: 'MARKLESS_OVERLAY_VALUE_UNSUPPORTED',
		title: 'overlay accepts only a literal',
		message: `${bound}. overlay must be written on the element itself as bare \`overlay\`, \`overlay={true}\`, or \`overlay={false}\`.`,
		why: 'Elevation is structural, not reactive. The overlay record carries no inputs, so it has no dependencies and can never re-run; a value that varies at runtime would have nothing to re-elevate the element.',
		span: input.span,
		suggestion:
			'Let `@if` decide whether the element exists and keep `overlay` a literal on the element inside the branch.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_OVERLAY_VALUE_UNSUPPORTED',
	});
}

/**
 * Mirrors MARKLESS_ATTACH_HOST_ELEMENT_REQUIRED. overlay cannot be prop-forwarded
 * either, because `overlay={props.overlay}` is non-literal by design - so a
 * component-level overlay would be useless but silent without this diagnostic.
 */
export function overlayHostElementRequiredDiagnostic(input: {
	readonly ownerTagName: string | null;
	readonly span?: SourceSpan;
}): SemanticGraphDiagnostic {
	const owner = input.ownerTagName ? `<${input.ownerTagName}>` : 'a non-host element';

	return semanticGraphDiagnostic({
		code: 'MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED',
		title: 'overlay can only be marked on host elements',
		message: `Cannot mark overlay on component ${owner}. overlay elevates one concrete host element above the rest of the UI and needs a host element owner.`,
		why: 'Elevation is applied to a DOM element. A component is not a DOM locator and may render zero, one, or many host nodes, and overlay cannot be forwarded to one as a prop because its value must be a literal.',
		span: input.span,
		suggestion:
			'Move overlay onto the host element that should be elevated, inside the component TSRX body.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_OVERLAY_HOST_ELEMENT_REQUIRED',
	});
}

type AttributeDisciplineNode = { readonly node: AnyNode; readonly filename: string };

export function eventSpreadUnsupportedDiagnostic(
	input: AttributeDisciplineNode & {
		readonly spreadSource: string;
		readonly keys: ReadonlyArray<string>;
	},
): SemanticGraphDiagnostic {
	const listed = input.keys.map((key) => `\`${key}\``).join(', ');
	return attributeDisciplineDiagnostic(input.node, input.filename, {
		code: 'MARKLESS_EVENT_SPREAD_UNSUPPORTED',
		severity: 'error',
		title: 'Event handlers cannot be spread onto an element',
		message: `{...${input.spreadSource}} spreads ${listed} onto an element. Events compile to static view records, so handlers inside a spread would be discarded.`,
		why: 'The compiler owns event discovery so the browser can resume without scanning markup; a runtime spread hides which events exist from the compiler.',
		suggestion:
			'Write event props directly, for example <input onClick={handlers.onClick} onInput={handlers.onInput} />, and keep spreads for plain static attributes.',
	});
}

export function spreadStaticSnapshotDiagnostic(
	input: AttributeDisciplineNode & {
		readonly spreadSource: string;
	},
): SemanticGraphDiagnostic {
	return attributeDisciplineDiagnostic(input.node, input.filename, {
		code: 'MARKLESS_SPREAD_STATIC_SNAPSHOT',
		severity: 'warning',
		title: 'Spread attributes render once',
		message: `{...${input.spreadSource}} copies attributes during initial render. When ${input.spreadSource} changes later, these attributes do not update.`,
		why: 'The compiler plans DOM-update records for graph-backed attributes it can see; a spread hides which attributes exist, so no update records are planned for it.',
		suggestion:
			'Bind attributes that change individually, such as <div id={menu.id} data-open={menu.open} />, and keep the spread only for initial attributes.',
	});
}

export function attributeObjectValueDiagnostic(
	input: AttributeDisciplineNode & {
		readonly attributeName: string;
		readonly valueSource: string;
		readonly eventSuggestion?: string;
	},
): SemanticGraphDiagnostic {
	const eventText = input.eventSuggestion
		? ` If this was meant to be an event, did you mean \`${input.eventSuggestion}\`?`
		: '';
	return attributeDisciplineDiagnostic(input.node, input.filename, {
		code: 'MARKLESS_ATTRIBUTE_OBJECT_VALUE',
		severity: 'warning',
		title: input.eventSuggestion
			? 'Lowercase on* attributes are plain HTML attributes'
			: 'This attribute renders "[object Object]"',
		message: input.eventSuggestion
			? `\`${input.attributeName}={${input.valueSource}}\` is a plain attribute, not a Markless event. It would serialize the function source into HTML.${eventText}`
			: `\`${input.attributeName}={${input.valueSource}}\` writes an object into an attribute, so the page renders ${input.attributeName}="[object Object]".`,
		why: 'Attribute bindings serialize to plain text in HTML and DOM updates; only graph cells keep structured values across resume.',
		suggestion: input.eventSuggestion
			? `Use the event prop casing, for example \`${input.eventSuggestion}={...}\`, or serialize a string deliberately.`
			: 'Bind the field you mean, such as data-x={menu.open}, or serialize deliberately with a string value.',
	});
}

export function duplicateAttributeDiagnostic(input: {
	readonly tagName: string | null;
	readonly attributeName: string;
	readonly duplicate: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const tag = input.tagName ? `<${input.tagName}>` : 'this element';
	return attributeDisciplineDiagnostic(input.duplicate, input.filename, {
		code: 'MARKLESS_ATTRIBUTE_DUPLICATE',
		severity: 'error',
		title: 'Duplicate attribute on one element',
		message: `\`${input.attributeName}\` appears twice on ${tag}. Only one can win, and render paths can disagree about which value is used.`,
		why: 'Duplicate attributes ship invalid HTML and make the element depend on parser and update semantics instead of one authored value.',
		suggestion: `Keep one \`${input.attributeName}\` attribute on this element.`,
	});
}

export function styleObjectUnsupportedDiagnostic(
	input: AttributeDisciplineNode & {
		readonly valueSource: string;
		readonly reason: string;
	},
): SemanticGraphDiagnostic {
	return attributeDisciplineDiagnostic(input.node, input.filename, {
		code: 'MARKLESS_STYLE_OBJECT_UNSUPPORTED',
		severity: 'error',
		title: 'This style object shape is not supported',
		message: `style={${input.valueSource}} uses ${input.reason}, which style objects do not support. Supported: an object literal written on the element, or an unmodified same-file \`const\` object literal referenced by name or flattened with \`...spread\`, with keys that are plain names or compile-time strings and values that are literals, state, computed values, or props.`,
		why: 'A style object is turned into CSS text while compiling, so every key must be readable from the source and every value must be one the compiler can recombine into the same text the server renders and the browser rewrites. Objects that are imported, held in state, mutated, aliased, or built at runtime cannot be frozen that way.',
		suggestion:
			'Write the declarations directly on the element, such as style={{ color: theme, marginTop: 8 }}, move the object into an unmodified same-file const, or pass a CSS string.',
	});
}

function attributeDisciplineDiagnostic(
	node: AnyNode,
	filename: string,
	input: {
		readonly code: SemanticGraphDiagnostic['code'];
		readonly severity: SemanticGraphDiagnostic['severity'];
		readonly title: string;
		readonly message: string;
		readonly why: string;
		readonly suggestion: string;
	},
): SemanticGraphDiagnostic {
	return {
		code: input.code,
		severity: input.severity,
		phase: 'semantic-graph',
		title: input.title,
		message: input.message,
		why: input.why,
		primarySpan: sourceSpan(node, filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: `https://markless.dev/errors/${input.code}`,
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

// A plain `else` after an @if arm still parses: TSRX reads it as sibling markup
// text plus a swallowed body, so the page renders the word "else" and the arm's
// escaped source instead of the branch the author wrote. Nothing downstream can
// recover the intent, so the spelling is refused at the graph.
export function branchElseSpellingDiagnostic(input: {
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	return {
		code: 'MARKLESS_BRANCH_ELSE_SPELLING',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'A branch alternative is spelled `else` instead of `@else`',
		message:
			'This `else` follows an @if arm but is not written as `@else`, so it is not read as a branch at all. TSRX parses it as literal text next to the @if, and the block after it becomes a separate expression, so the page renders the word "else" followed by the arm\'s own source as escaped text.',
		why: 'Markless branches are spelled with the `@` sigil — `@if`, `@else if`, `@else` — because that sigil is what tells the parser a construct starts here. Without it the parser has no branch to attach the alternative to, and the mistake is silent: the module compiles and ships visible garbage instead of failing.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{ message: 'Write the alternative as `@else { ... }`.' },
			{ message: 'For a chained condition, write `@else if (condition) { ... }`.' },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_BRANCH_ELSE_SPELLING',
	};
}

// Owner-adjustable: the spec is unambiguous that a bare container is not a
// template output node, but the in-repo @markless/ui families still spell arms
// that way. `warning` until that migration lands, then `error`.
export const BARE_ARM_INTERPOLATION_SEVERITY: 'error' | 'warning' = 'error';

export const BARE_ARM_INTERPOLATION_CODE = 'MARKLESS_BARE_ARM_INTERPOLATION' as const;

export function bareArmInterpolationDiagnostic(input: {
	readonly expressionSource: string;
	readonly node: AnyNode;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const wrapped = `<>{${input.expressionSource}}</>`;
	return {
		code: BARE_ARM_INTERPOLATION_CODE,
		severity: BARE_ARM_INTERPOLATION_SEVERITY,
		phase: 'semantic-graph',
		title: 'A branch arm renders a bare expression instead of a fragment',
		message: `\`{${input.expressionSource}}\` stands alone as this arm's whole body. A standalone expression container is not a template output node, so the arm has no markup of its own and its text has nowhere to live but the element around it — which erases whatever the other arm rendered there.`,
		why: 'Template output is an element, a fragment, or a control-flow construct. A statement container that needs to render text says so with a fragment, which gives the text its own marker range inside the arm.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		source: `{${input.expressionSource}}`,
		suggestions: [{ message: `Wrap it in a fragment: ${wrapped}` }],
		docsUrl: `https://markless.dev/errors/${BARE_ARM_INTERPOLATION_CODE}`,
	};
}

export function fallbackSpan(filename: string): SourceSpan {
	return {
		filename,
		start: 0,
		end: 0,
	};
}

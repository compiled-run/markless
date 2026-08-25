import type { AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';

// The public render plan pass owns these diagnostic contract values. Tests and
// any other reader import them from here rather than restating the strings, so
// the contract has one source of truth.
export const PUBLIC_RENDER_PLAN_PASS_ID = 'public-render-plan' as const;
export const PUBLIC_RENDER_PHASE = 'public-render' as const;
export const PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT_CODE =
	'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT' as const;

export function gatePlanDisagreementDiagnostic(input: {
	readonly label: '@try' | '@if' | '@switch' | '@for';
	readonly message: string;
	readonly node: AnyNode;
	readonly filename: string;
	readonly suggestion: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
		severity: 'error',
		phase: 'public-render',
		title: `${input.label} passed render support checks but has no usable render plan`,
		message: input.message,
		why: 'The public render gate admitted this authored construct, so silently omitting its render plan would produce output that can fail or remain permanently unsettled at request time.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
	};
}

// The public render module emitter renders only compiler-proven constructs.
// Anything else must be reported here so authored content never disappears
// from CSR/SSR output without an explanation the author can act on.
export function unsupportedRenderConstructDiagnostic(input: {
	readonly label: string;
	readonly message: string;
	readonly node: AnyNode;
	readonly filename: string;
	readonly suggestion: string;
	readonly severity?: 'warning' | 'error';
}): CompilerDiagnostic {
	return {
		code: PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT_CODE,
		severity: input.severity ?? 'warning',
		phase: PUBLIC_RENDER_PHASE,
		title: `${input.label} is not rendered by the public render path yet`,
		message: `${input.message} markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
		why: 'The public render module only emits compiler-proven output. Content inside an unsupported construct would silently disappear from rendered HTML, so the compiler reports it instead.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: PUBLIC_RENDER_PLAN_PASS_ID,
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: `https://markless.dev/errors/${PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT_CODE}`,
	};
}

// D2/D4: when a settled @try/@catch arm cannot get a browser-side render
// module, the refusal is loud and speaks the author's words — the content
// still server-renders, but it cannot update in the browser after settle.
export function asyncArmRenderUnsupportedDiagnostic(input: {
	readonly message: string;
	readonly node: AnyNode;
	readonly filename: string;
	readonly suggestion: string;
	readonly severity?: 'warning' | 'error';
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_ASYNC_ARM_RENDER_UNSUPPORTED',
		severity: input.severity ?? 'warning',
		phase: 'public-render',
		title: 'The settled @try content cannot render in the browser yet',
		message: input.message,
		why: 'The compiler emits a browser-side render module for @try/@catch content so it can update after the data settles. A shape the module cannot render would silently stay frozen, so the compiler reports it instead.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ASYNC_ARM_RENDER_UNSUPPORTED',
	};
}

// D2/D4: a toggle inside @try/@catch content whose branch cannot flip on its
// own (it needs component execution) still WORKS — the whole @try content
// re-renders — but the cost is never silent, and the wording stays in the
// author's vocabulary (never compiler internals).
export function tryBlockToggleRerenderDiagnostic(input: {
	readonly branchLabel: '@if' | '@switch';
	readonly componentName: string | null;
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	const message = input.componentName
		? `this ${input.branchLabel} contains <${input.componentName}>, so toggling it re-renders the whole @try block — move the component outside the ${input.branchLabel} to keep the toggle cheap.`
		: `this ${input.branchLabel} contains content the toggle cannot rebuild on its own, so toggling it re-renders the whole @try block — simplify the ${input.branchLabel} content to plain elements, text, and state reads to keep the toggle cheap.`;
	return {
		code: 'MARKLESS_TRY_BLOCK_TOGGLE_RERENDER',
		severity: 'warning',
		phase: 'public-render',
		title: `Toggling this ${input.branchLabel} re-renders the whole @try block`,
		message,
		why: 'Content with a component cannot be rebuilt from static parts and value slots, so the toggle falls back to re-rendering the whole @try block. That works, but it re-runs the component and replaces DOM the toggle did not touch.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message: `Move the component outside the ${input.branchLabel}, or keep the ${input.branchLabel} content to plain elements, text, and state reads.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_TRY_BLOCK_TOGGLE_RERENDER',
	};
}

// A list that renders its served rows but can never grow still ships, and the
// set of shapes that reach this shrinks as row growth covers more of them, so
// this warns rather than blocks. Change this one constant to move it.
export const KEYED_REPEAT_ROW_MINT_UNSUPPORTED_SEVERITY: 'error' | 'warning' = 'warning';

export const KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE =
	'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED' as const;

/**
 * One clause of the row-template mint's refusal, in the author's own terms.
 *
 * A refused row still serves whatever the server rendered, and it still
 * reorders and removes. What it cannot do is GROW: an item appended to the
 * collection after resume has no markup, because the client carries no
 * renderer and the payload carries no template for it. Every channel is
 * otherwise silent about that, which is what this says out loud.
 */
export type KeyedRepeatRowMintRefusal =
	| { readonly kind: 'component'; readonly componentName: string }
	| { readonly kind: 'nested-construct'; readonly label: string }
	| { readonly kind: 'attribute'; readonly attributeName: string }
	| { readonly kind: 'outside-read' };

export function keyedRepeatRowMintUnsupportedDiagnostic(input: {
	readonly itemName: string;
	readonly refusal: KeyedRepeatRowMintRefusal;
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	const cause = refusalCause(input.itemName, input.refusal);
	return {
		code: KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE,
		severity: KEYED_REPEAT_ROW_MINT_UNSUPPORTED_SEVERITY,
		phase: PUBLIC_RENDER_PHASE,
		title: 'This list can never grow in the browser',
		message: `${cause.message} The browser has no renderer, so a row that arrives after the page loads has no markup to be built from: this list will render the rows the server sent, reorder them and remove them, and silently ignore every new one.`,
		why: 'The payload carries one row of finished markup so the browser can build a row the server never rendered. It can fill text read off the row item and nothing else, so a row needing anything more ships no template at all.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: PUBLIC_RENDER_PLAN_PASS_ID,
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: cause.suggestion }],
		docsUrl: `https://markless.dev/errors/${KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE}`,
	};
}

function refusalCause(
	itemName: string,
	refusal: KeyedRepeatRowMintRefusal,
): { readonly message: string; readonly suggestion: string } {
	switch (refusal.kind) {
		case 'component':
			return {
				message: `This @for row renders <${refusal.componentName}>, and a component in the row is a graph the browser would have to build one of per row.`,
				suggestion: `Move <${refusal.componentName}> outside the @for and keep the row to plain elements and text read off ${itemName}, or wait for component-rooted rows.`,
			};
		case 'nested-construct':
			return {
				message: `This @for row holds ${refusal.label}, and a construct inside the row is wiring the browser would have to register per row.`,
				suggestion: `Lift ${refusal.label} outside the @for, or keep the row to plain elements and text read off ${itemName}.`,
			};
		case 'attribute':
			return {
				message: `This @for row sets the ${refusal.attributeName} attribute from a value, and the row template fills text only.`,
				suggestion: `Render the value as text inside the row instead of as the ${refusal.attributeName} attribute, or wait for attribute rows.`,
			};
		case 'outside-read':
			return {
				message: `This @for row reads a value that is not a property of ${itemName}, and the browser builds a row from the row item alone.`,
				suggestion: `Read the value off ${itemName} - put it on the item before the list is built - or keep the row to text read off ${itemName}.`,
			};
	}
}

export function repeatRowStateScopeUnsupportedDiagnostic(input: {
	readonly apiName: 'state' | 'computed';
	readonly name: string;
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED',
		severity: 'error',
		phase: 'public-render',
		title: 'Per-row state in keyed repeats is not supported yet',
		message: `${input.apiName}() creates "${input.name}" inside a keyed @for row. Per-row cells need per-row graph scopes, which do not exist yet.`,
		why: 'Keys give rows identity, but each row would need its own cell keyed by row identity across reorder and resume. The current graph payload can only plan stable component-owned cells.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message:
					'Lift the state to a collection on the parent: use one state() holding per-row data keyed by the row key.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED',
	};
}

// Sibling @for loops sharing an item name compile fine - the row context answers
// both. A name that is one loop's ITEM and another's INDEX cannot: the emitted
// row readers share one scope, so the name would have to mean two things at once.
export function repeatBindingNameConflictDiagnostic(input: {
	readonly name: string;
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_REPEAT_BINDING_NAME_CONFLICT',
		severity: 'error',
		phase: 'public-render',
		title: 'Two @for loops give the same name two different meanings',
		message: `"${input.name}" is one @for loop's item and another @for loop's index in the same file. Rename one of them.`,
		why: 'Every @for expression in a file is compiled into readers that share one set of row bindings, so a name can bind to the row item or the row index, never to both.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message: `Rename this loop's binding - two loops may reuse a name freely as long as both use it the same way (both items, or both indexes).`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_BINDING_NAME_CONFLICT',
	};
}

// Spec 01-tsrx-host-contract: children are an opaque compiler-owned template
// projection. Inspecting or transforming them React-style is diagnosed.
export function childrenOpacityDiagnostic(input: {
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_CHILDREN_OPAQUE',
		severity: 'error',
		phase: 'public-render',
		title: 'children cannot be inspected or transformed',
		message:
			'children is an opaque template projection: place it with {children}, wrap it, or pass it through — mapping, counting, indexing, or mutating it is not supported.',
		why: 'The compiler owns children projection; there is no render-output array to inspect, so React-style children access would silently misbehave.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{ message: 'Render {children} directly or move per-item rendering to the parent.' },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_CHILDREN_OPAQUE',
	};
}

export function unsupportedRenderRootDiagnostic(input: {
	readonly message: string;
	readonly node: AnyNode;
	readonly filename: string;
	readonly suggestion: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
		severity: 'error',
		phase: 'public-render',
		title: 'This component root cannot be rendered yet',
		message: input.message,
		why: "Markless anchors each component's HTML and interactivity to a single root element. Without a supported root the component would silently render nothing, so the compiler stops with an error instead.",
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
	};
}

export function noRenderableRootDiagnostic(input: {
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
		severity: 'warning',
		phase: 'public-render',
		title: 'No renderable component root was found',
		message:
			'No component with a TSRX template root was found, so the compiled module would render nothing.',
		why: 'The render module anchors one root component structure and its locators for resume; without a template root there is nothing to anchor.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message:
					'Export a TSRX component with an @{...} template body, or pass an explicit compiled component artifact when multiple roots exist.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
	};
}

export function unsupportedRenderBodyDiagnostic(input: {
	readonly node: AnyNode;
	readonly filename: string;
	readonly message: string;
	readonly suggestion: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_RENDER_BODY_UNSUPPORTED',
		severity: 'error',
		phase: 'public-render',
		title: 'Component body statement is not supported by the render module',
		message: input.message,
		why: 'Component bodies execute during initial render. A body statement the emitter cannot represent would otherwise be deleted from CSR and SSR output.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RENDER_BODY_UNSUPPORTED',
	};
}

export function undeclaredTemplateReadDiagnostic(input: {
	readonly name: string;
	readonly node: AnyNode;
	readonly filename: string;
}): CompilerDiagnostic {
	const message = `${input.name} would throw ReferenceError when the render module runs because no prop, body declaration, module declaration, or import with that name is in scope.`;
	return {
		code: 'MARKLESS_TEMPLATE_READ_UNDECLARED',
		severity: 'error',
		phase: 'public-render',
		title: 'Template read is not declared in render scope',
		message,
		why: 'Public CSR and SSR render modules execute template expressions directly during initial render. An identifier that is not declared in the emitted render scope would crash instead of rendering HTML.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message: `Declare ${input.name} in the component body, pass it as a prop, import it, or hoist it to a module-scope declaration before reading it in the template.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_READ_UNDECLARED',
	};
}

export function conditionalComponentRootDiagnostic(input: {
	readonly node: AnyNode;
	readonly filename: string;
	readonly componentName: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_COMPONENT_ROOT_CONDITIONAL',
		severity: 'error',
		phase: 'public-render',
		title: 'Component root is conditional',
		message: `${input.componentName} has a second template return, so the public render module cannot choose one component root without deleting statement flow.`,
		why: 'Initial render executes component bodies, but resume needs one planned root with stable locators. Multiple or conditional template returns need branch records before they can render.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message:
					'Use a single root with @if/@else inside it, or return null before the one root for a guard clause.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_ROOT_CONDITIONAL',
	};
}

export function elementGuardReturnUnsupportedDiagnostic(input: {
	readonly node: AnyNode;
	readonly filename: string;
	readonly componentName: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED',
		severity: 'error',
		phase: 'public-render',
		title: 'Element-valued guard returns are not supported',
		message: `${input.componentName} uses an element-valued guard return before its template root, so the public render plan cannot preserve both outcomes.`,
		why: 'The public render module needs one planned component root with stable locators. An earlier element-valued return creates another root whose conditional statement flow is not represented by that plan.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [
			{
				message:
					'Rewrite the two outcomes as a root-level @if/@else template, or use return null when the guard should render nothing.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED',
	};
}

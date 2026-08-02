import type { AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';

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
		code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
		severity: input.severity ?? 'warning',
		phase: 'public-render',
		title: `${input.label} is not rendered by the public render path yet`,
		message: `${input.message} markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
		why: 'The public render module only emits compiler-proven output. Content inside an unsupported construct would silently disappear from rendered HTML, so the compiler reports it instead.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
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
		title: 'Component root shape is not supported by the public render path',
		message: input.message,
		why: 'The public render module needs one host or component element as the component root to plan locators and emit HTML. Without it the component renders nothing.',
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

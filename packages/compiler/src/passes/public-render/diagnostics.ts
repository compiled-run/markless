import type { AnyNode } from '../../ast/nodes.ts';
import { sourceSpan } from '../../ast/source.ts';
import type { CompilerDiagnostic } from '../../diagnostics.ts';

// The public render module emitter renders only compiler-proven constructs.
// Anything else must be reported here so authored content never disappears
// from CSR/SSR output without an explanation the author can act on.
export function unsupportedRenderConstructDiagnostic(input: {
	readonly label: string;
	readonly message: string;
	readonly node: AnyNode;
	readonly filename: string;
	readonly suggestion: string;
}): CompilerDiagnostic {
	return {
		code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
		severity: 'error',
		phase: 'public-render',
		title: `${input.label} is not rendered by the public render path yet`,
		message: input.message,
		why: 'The public render module only emits compiler-proven output. Content inside an unsupported construct would silently disappear from rendered HTML, so the compiler reports it instead.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		suggestions: [{ message: input.suggestion }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
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
		severity: 'error',
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

export function unsupportedRenderBodyDiagnostic(input: { readonly node: AnyNode; readonly filename: string; readonly message: string; readonly suggestion: string; }): CompilerDiagnostic {
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

export function undeclaredTemplateReadDiagnostic(input: { readonly name: string; readonly node: AnyNode; readonly filename: string; }): CompilerDiagnostic {
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
		suggestions: [{ message: `Declare ${input.name} in the component body, pass it as a prop, import it, or hoist it to a module-scope declaration before reading it in the template.` }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_TEMPLATE_READ_UNDECLARED',
	};
}

export function conditionalComponentRootDiagnostic(input: { readonly node: AnyNode; readonly filename: string; readonly componentName: string; }): CompilerDiagnostic {
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
		suggestions: [{ message: 'Use a single root with @if/@else inside it, or return null before the one root for a guard clause.' }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPONENT_ROOT_CONDITIONAL',
	};
}

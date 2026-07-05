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

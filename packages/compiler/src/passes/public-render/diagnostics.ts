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

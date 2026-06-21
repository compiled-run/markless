import type {
	CsrRenderContainer,
	CsrRenderOptions,
	CsrRenderOutput,
	RenderTarget,
} from '@arcade/runtime/render';

export type { CsrRenderContainer, CsrRenderOptions, CsrRenderOutput, RenderTarget };

export async function render(
	component: () => CsrRenderOutput,
	options: CsrRenderOptions,
): Promise<CsrRenderContainer> {
	const output = component();

	if (output.graph && output.runtime) {
		mountRoot(options.target, output.root);
		return {
			phase: 'csr',
			root: output.root,
			graph: output.graph,
			runtime: output.runtime,
		};
	}

	const { render: renderWithRuntime } = await import('@arcade/runtime/render');
	return renderWithRuntime(() => output, options);
}

function mountRoot(target: RenderTarget, root: CsrRenderOutput['root']): void {
	if (target.replaceChildren) {
		target.replaceChildren(root);
		return;
	}
	if (target.appendChild) {
		target.appendChild(root);
		return;
	}
	throw new TypeError(
		'render(App, { target }) requires a target that can receive the root node.',
	);
}

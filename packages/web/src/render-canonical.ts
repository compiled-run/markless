import type { ResumeDomElement } from './resume.ts';
import type { CsrRenderArtifact, CsrRenderOutput, RenderTarget } from './render.ts';
import { materializeDomLocators } from './resume-locators.ts';

export async function renderCanonicalClientOutput(
	component: CsrRenderArtifact,
	target: RenderTarget,
): Promise<CsrRenderOutput> {
	const ownerDocument = (target as { readonly ownerDocument?: Document }).ownerDocument ??
		(typeof document === 'undefined' ? undefined : document);
	if (!ownerDocument) {
		throw new TypeError('Canonical client rendering requires a DOM document.');
	}
	if (component.renderData) {
		const surface = await (typeof component.renderData === 'function'
			? component.renderData()
			: component.renderData);
		const loadSymbol = component.loadSymbol ?? missingCanonicalSymbol;
		const output = await (
			await import('./prerender/evaluator.ts')
		).renderPrerenderDataSurface(surface, loadSymbol, component.props);
		return clientOutputFromHtml(ownerDocument, output.html, {
			state: output.state,
			view: output.view,
			loadSymbol,
			renderData: () => surface,
		});
	}
	if (!component.renderSsr) {
		throw new TypeError(
			'render(App) requires a compiled TSRX artifact with a canonical render surface.',
		);
	}
	const output = await component.renderSsr();
	return clientOutputFromHtml(ownerDocument, output.html, {
		state: output.state,
		view: output.view,
		loadSymbol: component.loadSymbol,
	});
}

function clientOutputFromHtml(
	ownerDocument: Document,
	html: string,
	records: Pick<CsrRenderOutput, 'state' | 'view' | 'loadSymbol' | 'renderData'>,
): CsrRenderOutput {
	const template = ownerDocument.createElement('template');
	template.innerHTML = html;
	const root =
		template.content.childNodes.length === 1
			? template.content.firstChild
			: template.content;
	if (!root) throw new Error('MARKLESS_CANONICAL_CLIENT_ROOT_MISSING');
	return {
		root: root as unknown as ResumeDomElement,
		...records,
		liveHostNodes: records.view
			? materializeDomLocators(
					root as unknown as ResumeDomElement,
					records.view.locators,
				)
			: undefined,
	};
}

function missingCanonicalSymbol(symbolId: string): never {
	throw new Error(`MARKLESS_CANONICAL_SYMBOL_MISSING: ${symbolId}`);
}

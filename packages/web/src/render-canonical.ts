import type { ResumeDomElement } from './resume.ts';
import type { CsrRenderArtifact, CsrRenderOutput, RenderTarget } from './render.ts';
import { materializeDomLocators } from './resume-locators.ts';

const scopeIndexByTarget = new Map<RenderTarget, number>();

// A second live root on the page mints its element() ids under a segment of its own.
function elementIdScopeFor(target: RenderTarget): string {
	const held = new Set<number>();
	for (const [other, index] of scopeIndexByTarget)
		if ((other as { readonly isConnected?: boolean }).isConnected === false)
			scopeIndexByTarget.delete(other);
		else if (other !== target) held.add(index);
	let index = 0;
	while (held.has(index)) index++;
	scopeIndexByTarget.set(target, index);
	return index ? `v${index}:` : '';
}

export async function renderCanonicalClientOutput(
	component: CsrRenderArtifact,
	target: RenderTarget,
	elementIdScope: string = elementIdScopeFor(target),
): Promise<CsrRenderOutput> {
	const ownerDocument = (target as { readonly ownerDocument?: Document }).ownerDocument ??
		(typeof document === 'undefined' ? undefined : document);
	if (!ownerDocument) {
		throw new TypeError('Canonical client rendering requires a DOM document.');
	}
	if (component.renderData) {
		const authored = await (typeof component.renderData === 'function'
			? component.renderData()
			: component.renderData);
		const surface = elementIdScope ? { ...authored, elementIdScope } : authored;
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
	const output = await component.renderSsr(
		undefined,
		elementIdScope ? { elementIdScope } : undefined,
	);
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
	(globalThis as { __marklessPropertySeeds?: (nodes: ArrayLike<unknown>) => void }).__marklessPropertySeeds?.(
		template.content.childNodes,
	);
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

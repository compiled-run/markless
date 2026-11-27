import type { ResumeDomElement } from './resume.ts';
import type { CsrRenderArtifact, CsrRenderOutput, RenderTarget } from './render.ts';
import { materializeDomLocators } from './resume-locators.ts';
import type { PrerenderDataSurface } from './prerender/evaluator.ts';

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
		const scoped = elementIdScope ? { ...authored, elementIdScope } : authored;
		// A client render has the visitor's saved storage() values at hand, so it renders with them.
		const surface = declaresStorage(scoped)
			? (await import('./storage-saved.ts')).withSavedStorageValues(scoped)
			: scoped;
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
	const output = await component.renderSsr(undefined, {
		...(elementIdScope ? { elementIdScope } : {}),
		...(await import('./storage-saved.ts')).savedStorageRenderContext,
	});
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

function declaresStorage(surface: PrerenderDataSurface, seen = new Set<PrerenderDataSurface>()): boolean {
	if (seen.has(surface)) return false;
	seen.add(surface);
	return (
		Object.values(surface.components).some((definition) => !!definition.state.storage?.length) ||
		Object.values(surface.imports).some((imported) => declaresStorage(imported, seen))
	);
}

function missingCanonicalSymbol(symbolId: string): never {
	throw new Error(`MARKLESS_CANONICAL_SYMBOL_MISSING: ${symbolId}`);
}

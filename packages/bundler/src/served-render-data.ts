// The render data a server-rendered page's browser loads: only what it can still render itself
// (the compiler's `servedRenderData`). Everything else is already in the served HTML.
import { parsePath, withQuery } from 'ufo';

export const MARKLESS_SERVED_RENDER_DATA_QUERY = 'markless-served';

/** The served spelling of a render-data source request. */
export function servedRenderDataSourceReference(source: string): string {
	return withQuery(source, { [MARKLESS_SERVED_RENDER_DATA_QUERY]: null });
}

export function isServedRenderDataRequest(id: string): boolean {
	return new URLSearchParams(parsePath(id).search).has(MARKLESS_SERVED_RENDER_DATA_QUERY);
}

import { asset } from '../../../site-base.ts';
import type { SearchIndex } from './search-index.ts';

/** The file the build writes next to the client assets, loaded on the first open of the search dialog. */
export const SEARCH_INDEX_FILE = 'search-index.json';

/** The file in `public/` the dialog's empty state links into, so the drawing costs the page nothing until it shows. */
export const NOTHING_FOUND = 'search-nothing.svg';

let loading: Promise<SearchIndex> | undefined;
let loaded: SearchIndex | undefined;
let failed = false;

/** The last attempt to load the index failed, and nothing has retried it since. */
export function searchIndexFailed(): boolean {
	return failed;
}

/** The index if it has finished loading, otherwise undefined. */
export function cachedSearchIndex(): SearchIndex | undefined {
	return loaded;
}

/** Fetches the index once per page load; every later call shares the first request. */
export function loadSearchIndex(): Promise<SearchIndex> {
	if (!loading) failed = false;
	loading ??= fetch(asset(SEARCH_INDEX_FILE))
		.then((response) => {
			if (!response.ok) throw new Error(`The search index answered ${response.status}.`);
			return response.json() as Promise<SearchIndex>;
		})
		.then((index) => (loaded = index));
	loading.catch(() => {
		loading = undefined;
		failed = true;
	});
	return loading;
}

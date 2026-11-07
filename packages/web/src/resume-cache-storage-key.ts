// `sessionStorage` keys of the resume cache. Clearing every key that starts with the prefix clears the cache.
export const RESUME_CACHE_KEY_PREFIX = 'markless:resume';
// The element carrying the session scope token the server minted; a document without one keeps no cache.
export const RESUME_CACHE_SCOPE_ATTRIBUTE = 'data-markless-scope';
// Marks a region showing seeded content until its revalidation commits.
export const RESUME_CACHE_SEEDED_ATTRIBUTE = 'data-markless-seeded';
// Marks the arm and state-patch scripts a seed wrote: the tab's last answer, never the stream's.
export const RESUME_CACHE_SEED_SCRIPT_ATTRIBUTE = 'data-seeded';

export function resumeCacheStorageKey(
	scope: string,
	build: string,
	route: string,
	boundaryId: string,
): string {
	return `${RESUME_CACHE_KEY_PREFIX}:${scope}:${build}:${route}:${boundaryId}`;
}

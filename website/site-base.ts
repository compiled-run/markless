/** The path this site is served under; `vite.config.ts` reads it for `base` and `nitro.baseURL`. */
export const siteBase = '/';

/** A file in `public/`, addressed under the site's base path. */
export function asset(path: string): string {
	return siteBase + path.replace(/^\/+/, '');
}

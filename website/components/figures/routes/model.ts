// The values the routes figure shows, the URL each file makes, and the sentence its live region speaks.
export type Spot = 'in' | 'out';
export type View = 'home' | 'about' | 'post' | 'missing';

export const ABOUT_URL = '/about';
export const FIRST_SLUG = 'hello';
export const postUrl = (slug: string) => `/blog/${slug}`;

/** Keeps a typed slug to the characters a URL segment carries here. */
export function typeSlug(slug: string, key: string): string {
	if (key === 'Backspace') return slug.slice(0, -1);
	if (/^[a-z0-9-]$/i.test(key) && slug.length < 12) return slug + key.toLowerCase();
	return slug;
}

/** What the browser shows for an address, given which files sit in pages/. */
export function viewOf(url: string, about: Spot, slugFile: Spot): View {
	if (url === '/') return 'home';
	if (url === ABOUT_URL) return about === 'in' ? 'about' : 'missing';
	if (url.startsWith('/blog/') && url.length > '/blog/'.length) return slugFile === 'in' ? 'post' : 'missing';
	return 'missing';
}

export function describe(url: string, view: View): string {
	if (view === 'missing') return `The browser asked for ${url}. No file in pages/ makes that address, so it shows the 404 page.`;
	if (view === 'about') return `pages/about.tsrx makes ${url}, so the browser shows the About page.`;
	if (view === 'post') return `pages/blog/[slug].tsrx makes ${url}, with slug set to ${url.slice('/blog/'.length)}.`;
	return 'pages/index.tsrx makes /, the home page.';
}

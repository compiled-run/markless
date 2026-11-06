// The site's folders and where a page file in each is served; the router serves only files under pages/.

/** Folders the figure offers, as they sit in website/. */
export const FOLDERS = ['pages/', 'pages/concepts/', 'components/'];

/** Concept pages with real files, so every address the figure shows exists on this site. */
export const NAMES = ['state', 'lists', 'async'];

/** The address a page file is served at, or '' when it sits outside pages/ and is not a page. */
export function addressOf(folder: string, name: string): string {
	if (!folder.startsWith('pages/')) return '';
	return '/' + folder.slice('pages/'.length) + name;
}

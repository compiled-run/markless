import type { Plugin } from 'vite';

// The page file already names the family and the route, so a docs tag may leave
// them out: in pages/markless/ui/accordion.mdx `<ApiTable />` reads as
// `<ApiTable family="accordion" />`, `scenario="basic"` as
// `scenario="accordion/basic"`, and `<Sidebar />` gets the page's pathname.
const PAGES = '/pages/';
const TAG = /<(ApiTable|AnatomyTable|KeyboardTable|Sidebar)(\s[^>]*?)?\s*\/>/g;
const BARE_SCENARIO = /\sscenario="([a-z0-9-]+)"/g;

function routeOf(file: string): { pathname: string; stem: string } | undefined {
	const at = file.indexOf(PAGES);
	if (at < 0 || !file.endsWith('.mdx')) return;
	const rel = file.slice(at + PAGES.length, -'.mdx'.length);
	const segments = rel.split('/');
	const stem = segments[segments.length - 1] ?? '';
	if (stem === 'index') segments.pop();
	return { pathname: '/' + segments.join('/'), stem };
}

function fillTag(
	tag: string,
	attrs: string | undefined,
	route: { pathname: string; stem: string },
): string {
	const rest = attrs ?? '';
	const [name, value] = tag === 'Sidebar' ? ['pathname', route.pathname] : ['family', route.stem];
	if (new RegExp(`\\s${name}=`).test(rest)) return `<${tag}${rest} />`;
	return `<${tag} ${name}="${value}"${rest.trimEnd()} />`;
}

/** Fills the family and pathname a page's own path implies into bare docs tags. */
export function fillPageProps(source: string, file: string): string {
	const route = routeOf(file);
	if (!route) return source;
	let fenced = false;
	return source
		.split('\n')
		.map((line) => {
			if (line.trimStart().startsWith('```')) fenced = !fenced;
			if (fenced) return line;
			return line
				.replace(TAG, (_, tag: string, attrs?: string) => fillTag(tag, attrs, route))
				.replace(BARE_SCENARIO, (_, stem: string) => ` scenario="${route.stem}/${stem}"`);
		})
		.join('\n');
}

export function pageProps(): Plugin {
	return {
		name: 'compiled-website:page-props',
		// Ahead of ui-demos, which needs the full `family/demo` scenario.
		enforce: 'pre',
		transform: {
			order: 'pre',
			handler(code: string, id: string) {
				const file = id.split('?', 1)[0] ?? id;
				if (!file.endsWith('.mdx')) return;
				const next = fillPageProps(code, file);
				return next === code ? undefined : { code: next, map: null };
			},
		},
	};
}

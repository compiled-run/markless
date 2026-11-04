import { MARKLESS_CHUNK_SPECIFIER_PREFIX } from '@markless/bundler/rolldown';
import type { MarklessRouterClientAssetRoutes } from './client-assets-manifest.ts';

type RoutePreloadData = Pick<MarklessRouterClientAssetRoutes, 'navigation' | 'ssr'> &
	Partial<Pick<MarklessRouterClientAssetRoutes, 'styles'>>;
type IndexedRoutes = Record<string, number[]>;

export function compactRoutePreloadData(
	data: RoutePreloadData,
): [string[], IndexedRoutes, IndexedRoutes] | [string[], IndexedRoutes, IndexedRoutes, IndexedRoutes] {
	const urls: string[] = [];
	const indices = new Map<string, number>();
	const encode = (routes: RoutePreloadData['navigation']): IndexedRoutes =>
		Object.fromEntries(
			Object.keys(routes)
				.sort()
				.map((route) => [
					route,
					routes[route]!.map((href) => {
						let index = indices.get(href);
						if (index === undefined) {
							index = urls.length;
							urls.push(href);
							indices.set(href, index);
						}
						return index;
					}),
				]),
		);
	const navigation = encode(data.navigation);
	const ssr = encode(data.ssr);
	const styled = Object.values(data.styles ?? {}).some((hrefs) => hrefs.length > 0);
	return styled ? [urls, navigation, ssr, encode(data.styles!)] : [urls, navigation, ssr];
}

// With chunk specifiers, chunk URLs ride as specifiers; the document's import map resolves them to the hrefs its own preload links use.
export function routePreloadDecoderSource(chunkSpecifiers: boolean): string {
	return [
		'if (Array.isArray(routePreloadData)) {',
		'  const [urls, navigation, ssr, styles] = routePreloadData;',
		...(chunkSpecifiers
			? [
					`  const imports = Object.assign({}, ...[...(globalThis.document?.querySelectorAll('script[type="importmap"]') ?? [])].map((script) => { try { return JSON.parse(script.textContent).imports; } catch { return {}; } }));`,
					`  const href = (url) => (url.startsWith(${JSON.stringify(MARKLESS_CHUNK_SPECIFIER_PREFIX)}) && imports[url]) || url;`,
				]
			: []),
		`  const decode = (routes) => Object.fromEntries(Object.entries(routes).map(([file, indices]) => [file, indices.map((index) => ${chunkSpecifiers ? 'href(urls[index])' : 'urls[index]'})]));`,
		'  routePreloadData = { navigation: decode(navigation), ssr: decode(ssr), styles: Object.fromEntries(Object.entries(styles ?? {}).map(([file, indices]) => [file, indices.map((index) => urls[index])])) };',
		'}',
	].join('\n');
}

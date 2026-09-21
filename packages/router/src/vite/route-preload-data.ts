import type { MarklessRouterClientAssetRoutes } from './client-assets-manifest.ts';

type RoutePreloadData = Pick<MarklessRouterClientAssetRoutes, 'navigation' | 'ssr'>;
type IndexedRoutes = Record<string, number[]>;

export function compactRoutePreloadData(
	data: RoutePreloadData,
): [string[], IndexedRoutes, IndexedRoutes] {
	const urls: string[] = [];
	const indices = new Map<string, number>();
	const encode = (routes: RoutePreloadData['navigation']): IndexedRoutes =>
		Object.fromEntries(Object.entries(routes).map(([route, hrefs]) => [route, hrefs.map(href => {
			let index = indices.get(href);
			if (index === undefined) {
				index = urls.length;
				urls.push(href);
				indices.set(href, index);
			}
			return index;
		})]));
	return [urls, encode(data.navigation), encode(data.ssr)];
}

export const routePreloadDecoderSource = [
	'if (Array.isArray(routePreloadData)) {',
	'  const [urls, navigation, ssr] = routePreloadData;',
	'  const decode = (routes) => Object.fromEntries(Object.entries(routes).map(([file, indices]) => [file, indices.map((index) => urls[index])]));',
	'  routePreloadData = { navigation: decode(navigation), ssr: decode(ssr) };',
	'}',
].join('\n');

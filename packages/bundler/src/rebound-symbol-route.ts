type BoundRoute = {
	readonly prefix: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
};

// A child symbol its edge binds is reached through the edge's bound row, or a callback the
// child's own child invokes by instance path never sees the captures this edge supplies.
export function emitReboundSymbolRoute(
	route: BoundRoute,
	reboundName: string,
	localLoader: string,
	unboundLoad: string,
	indent: string,
): string[] {
	if (!hasBoundSymbols(route)) return [];
	const rest = `symbolId.slice(${route.prefix.length})`;
	return [
		`${indent}const bound = ${JSON.stringify(route.boundSymbols)};`,
		`${indent}if (Object.hasOwn(bound, ${rest})) return ${reboundName}(${localLoader}(bound[${rest}]), ${JSON.stringify(route.prefix)}, () => ${unboundLoad});`,
	];
}

export function emitReboundSymbolImport(
	routes: ReadonlyArray<BoundRoute>,
	reboundName: string,
): string {
	return routes.some(hasBoundSymbols)
		? `import { marklessReboundSymbol as ${reboundName} } from '@markless/web/fns/rebound-symbol';`
		: '';
}

function hasBoundSymbols(route: BoundRoute): boolean {
	return route.boundSymbols !== undefined && Object.keys(route.boundSymbols).length > 0;
}

import { protocolBoundSymbolPrefix } from '@markless/serializer';

type BoundRoute = {
	readonly prefix: string;
	readonly boundSymbols?: Readonly<Record<string, string>>;
};

function emitReboundSymbolImport(routes: ReadonlyArray<BoundRoute>, reboundName: string): string {
	return routes.some(hasBoundSymbols)
		? `import { marklessReboundSymbol as ${reboundName} } from '@markless/web/fns/rebound-symbol';`
		: '';
}

function hasBoundSymbols(route: BoundRoute): boolean {
	return route.boundSymbols !== undefined && Object.keys(route.boundSymbols).length > 0;
}

/**
 * One loader for every composed child route, driven by a table: a page with many
 * instances of a child adds a row per instance, not a copy of the loader.
 */
export function emitSymbolRouteTable(input: {
	readonly routes: ReadonlyArray<BoundRoute & { readonly importSource?: string }>;
	readonly functionName: string;
	readonly fallbackName: string;
	readonly reboundName: string;
	readonly exported?: boolean;
}): string {
	const { routes, functionName, fallbackName, reboundName } = input;
	const sources = [
		...new Set(routes.flatMap((route) => (route.importSource ? [route.importSource] : []))),
	];
	const keyLists: string[] = [];
	const table = routes.map(
		(route) =>
			`[${JSON.stringify(route.prefix)}, ${route.importSource ? sources.indexOf(route.importSource) : -1}, ${hasBoundSymbols(route) ? boundEntry(route.boundSymbols!, keyLists) : 0}]`,
	);
	return [
		emitReboundSymbolImport(routes, reboundName),
		`const ${functionName}Imports = [${sources.map((source) => `() => import(${JSON.stringify(source)})`).join(', ')}];`,
		keyLists.length > 0 ? `const ${functionName}BoundKeys = [${keyLists.join(', ')}];` : '',
		`const ${functionName}Routes = [${table.join(', ')}];`,
		`${input.exported ? 'export ' : ''}function ${functionName}(symbolId) {`,
		`\tfor (const [prefix, at, bound] of ${functionName}Routes) {`,
		'\t\tif (!symbolId.startsWith(prefix)) continue;',
		'\t\tconst rest = symbolId.slice(prefix.length);',
		// A same-module child re-enters the table: what is left can carry another child's path.
		`\t\tconst unbound = () => at < 0 ? (prefix ? ${functionName}(rest) : ${fallbackName}(rest)) : ${functionName}Imports[at]().then((mod) => mod.loadSymbol ? mod.loadSymbol(rest) : Promise.reject(new Error(\`Unknown child async symbol \${symbolId}\`)));`,
		// A child symbol its edge binds goes through the edge's bound row, or a callback the
		// child's own child invokes by instance path never sees the captures this edge supplies.
		hasAnyBound(routes)
			? [
					keyLists.length > 0
						? `\t\tconst boundId = !bound ? undefined : Array.isArray(bound) ? (${functionName}BoundKeys[bound[1]].includes(rest) ? \`bound:\${encodeURIComponent(rest)}:\${bound[0]}\` : undefined) : Object.hasOwn(bound, rest) ? bound[rest] : undefined;`
						: '\t\tconst boundId = bound && Object.hasOwn(bound, rest) ? bound[rest] : undefined;',
					`\t\tif (boundId) return ${reboundName}(${fallbackName}(boundId), prefix, unbound);`,
				].join('\n')
			: '',
		'\t\treturn unbound();',
		'\t}',
		`\treturn ${fallbackName}(symbolId);`,
		'}',
	]
		.filter((line) => line !== '')
		.join('\n');
}

// An edge binds `symbol:N` to `bound:symbol%3AN:<edge>`, so it ships its edge half and a key list its sibling instances share.
// The table rebuilds an id with `encodeURIComponent`, so only keys the protocol spells that way share one.
function boundEntry(boundSymbols: Readonly<Record<string, string>>, keyLists: string[]): string {
	const entries = Object.entries(boundSymbols);
	const [firstKey, firstId] = entries[0]!;
	const head = `${protocolBoundSymbolPrefix(firstKey)}:`;
	const suffix = firstId.startsWith(head) ? firstId.slice(head.length) : undefined;
	if (
		suffix === undefined ||
		entries.some(
			([key, id]) =>
				protocolBoundSymbolPrefix(key) !== `bound:${encodeURIComponent(key)}` ||
				id !== `${protocolBoundSymbolPrefix(key)}:${suffix}`,
		)
	)
		return JSON.stringify(boundSymbols);
	const keys = JSON.stringify(entries.map(([key]) => key));
	let index = keyLists.indexOf(keys);
	if (index < 0) index = keyLists.push(keys) - 1;
	return `[${JSON.stringify(suffix)}, ${index}]`;
}

function hasAnyBound(routes: ReadonlyArray<BoundRoute>): boolean {
	return routes.some(hasBoundSymbols);
}

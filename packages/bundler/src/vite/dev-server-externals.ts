import { isAbsolute } from 'pathe';
import type { LinkResolveContext } from '../link-driver.ts';
import { pathname } from '../virtual-ids.ts';

type NoExternal = true | string | RegExp | ReadonlyArray<string | RegExp> | undefined;

type ServerEnvironmentContext = LinkResolveContext & {
	readonly environment?: {
		readonly config?: { readonly consumer?: string; readonly resolve?: { noExternal?: NoExternal } };
	};
};

// A dev server environment loads a bare dependency's built JavaScript as an external module,
// the same as the server build's resolver marks it. Without this, a plain dependency
// component such as @markless/router's Html reaches the linker as an unresolved child.
export function withDevServerExternals<Context extends ServerEnvironmentContext>(
	context: Context,
): Context {
	const config = context.environment?.config;
	if (config?.consumer !== 'server') return context;
	const noExternal = config.resolve?.noExternal;
	const resolve: LinkResolveContext['resolve'] = async (source, importer, options) => {
		const resolved = await context.resolve(source, importer, options);
		if (!isBareSpecifier(source) || matchesNoExternal(noExternal, source)) return resolved;
		const id = typeof resolved === 'string' ? resolved : resolved?.id;
		if (!id || !isBuiltDependency(pathname(String(id)))) return resolved;
		return { ...(typeof resolved === 'object' ? resolved : {}), id: String(id), external: true };
	};
	return new Proxy(context, {
		get(target, property) {
			if (property === 'resolve') return resolve;
			const value = Reflect.get(target, property, target);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
}

function isBareSpecifier(source: string): boolean {
	return (
		!source.startsWith('.') &&
		!isAbsolute(source) &&
		!source.startsWith('\0') &&
		!source.startsWith('virtual:')
	);
}

function isBuiltDependency(id: string): boolean {
	return id.includes('/node_modules/') && /\.[cm]?js$/.test(id);
}

function matchesNoExternal(noExternal: NoExternal, source: string): boolean {
	if (noExternal === true) return true;
	if (noExternal === undefined) return false;
	const patterns: ReadonlyArray<string | RegExp> =
		typeof noExternal === 'string' || noExternal instanceof RegExp ? [noExternal] : noExternal;
	return patterns.some((pattern) =>
		typeof pattern === 'string'
			? source === pattern || source.startsWith(`${pattern}/`)
			: pattern.test(source),
	);
}

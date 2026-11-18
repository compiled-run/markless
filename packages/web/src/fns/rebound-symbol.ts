import {
	marklessInstanceSegments,
	type MarklessRescopingSymbol,
	type MarklessScopedGraph,
} from './instance-scope.ts';
import { protocolBoundSymbolPrefix } from '@markless/serializer';
import { marklessThen } from '../ssr-data/awaitable.ts';
import { MARKLESS_SYMBOL_UNKNOWN } from './symbol-unknown.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';

type LoadedSymbol = ResumeSymbol | Promise<ResumeSymbol>;

/** The path above the module that rebound a symbol, or undefined when the asking path did not come through it. */
type OuterPath = (instancePath: string) => string | undefined;

type ReboundSymbol = MarklessRescopingSymbol & {
	readonly marklessBoundId?: string;
	readonly marklessBoundOuter?: OuterPath;
};

/**
 * A composed child's symbol that its edge binds, answered by the edge's bound row so
 * the captures the edge supplies (a callback prop above all) travel with it. That row
 * scopes itself under the edge's own prefix, so the path that asked for it is applied
 * only above that prefix, on the page graph the bound row expects.
 */
export function marklessReboundSymbol(
	loaded: LoadedSymbol,
	prefix: string,
	loadUnbound: () => LoadedSymbol,
	boundId?: string,
): LoadedSymbol {
	return reboundAt(
		loaded,
		(instancePath) => withoutSuffix(instancePath, prefix),
		loadUnbound,
		boundId,
	);
}

/**
 * A child module's answer for a row it binds to a callback prop of its own, which this
 * module handed it to forward: this module's row binds that callback, so it answers
 * instead. The row is spelled from this module's root, so it applies above the child's
 * path, the child's own rows, and the prefix this module's table consumed.
 *
 * `forwarded` is the edge's suffix when every such row is the child's id under it, and
 * the resolver holds only the rows this module republished, so any other id stays the child's.
 */
export function marklessForwardedSymbol(
	loaded: LoadedSymbol,
	forwarded: string | Readonly<Record<string, string>>,
	prefix: string,
	loadLocal: (symbolId: string) => LoadedSymbol,
): LoadedSymbol {
	return marklessThen(loaded, (symbol): LoadedSymbol => {
		const { marklessBoundId: childId, marklessBoundOuter: childOuter } =
			symbol as ReboundSymbol;
		if (childId === undefined || !childOuter) return symbol;
		const boundId =
			typeof forwarded === 'string'
				? `${protocolBoundSymbolPrefix(childId)}:${forwarded}`
				: Object.hasOwn(forwarded, childId)
					? forwarded[childId]!
					: undefined;
		if (boundId === undefined) return symbol;
		const outer: OuterPath = (instancePath) => {
			const above = childOuter(instancePath);
			if (above === undefined) return undefined;
			let path = above;
			for (const segment of marklessInstanceSegments(above).reverse()) {
				if (!segment.startsWith('r:') || !path.endsWith(segment)) break;
				path = path.slice(0, path.length - segment.length);
			}
			return withoutSuffix(path, prefix);
		};
		return Promise.resolve(loadLocal(boundId)).then(
			(bound) => reboundAt(bound, outer, () => symbol, boundId),
			(error: unknown) => {
				if ((error as { readonly code?: unknown } | undefined)?.code === MARKLESS_SYMBOL_UNKNOWN)
					return symbol;
				throw error;
			},
		);
	});
}

function withoutSuffix(path: string, suffix: string): string | undefined {
	return path.endsWith(suffix) ? path.slice(0, path.length - suffix.length) : undefined;
}

function reboundAt(
	loaded: LoadedSymbol,
	outerOf: OuterPath,
	loadUnbound: () => LoadedSymbol,
	boundId: string | undefined,
): LoadedSymbol {
	return marklessThen(loaded, (bound): ReboundSymbol => {
		const run = (context: ResumeSymbolContext) => bound(context);
		return Object.assign(run, {
			...(boundId === undefined
				? {}
				: { marklessBoundId: boundId, marklessBoundOuter: outerOf }),
			marklessRescope: (
				instancePath: string,
				scope: (symbol: ResumeSymbol, instancePath: string) => ResumeSymbol,
			): ResumeSymbol => {
				const outer = outerOf(instancePath);
				if (outer === undefined)
					return (context) =>
						marklessThen(loadUnbound(), (raw) => scope(raw, instancePath)(context));
				// Scoping `run` itself would re-enter this rescope and drop the bound row.
				const scoped = outer ? scope((context) => bound(context), outer) : run;
				return (context) =>
					scoped({
						...context,
						...(context.graph
							? {
									graph:
										(context.graph as unknown as MarklessScopedGraph)
											.marklessPageGraph ?? context.graph,
								}
							: {}),
					});
			},
		});
	});
}

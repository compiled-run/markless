import type { MarklessRescopingSymbol, MarklessScopedGraph } from './instance-scope.ts';
import { marklessThen } from '../ssr-data/awaitable.ts';
import type { ResumeSymbol, ResumeSymbolContext } from '../resume-types.ts';

type LoadedSymbol = ResumeSymbol | Promise<ResumeSymbol>;

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
): LoadedSymbol {
	return marklessThen(loaded, (bound): MarklessRescopingSymbol => {
		const run = (context: ResumeSymbolContext) => bound(context);
		return Object.assign(run, {
			marklessRescope: (
				instancePath: string,
				scope: (symbol: ResumeSymbol, instancePath: string) => ResumeSymbol,
			): ResumeSymbol => {
				const outer = instancePath.endsWith(prefix)
					? instancePath.slice(0, instancePath.length - prefix.length)
					: undefined;
				// A keyed row's bound symbol finds its row from the dispatching record, which a callback invoked by path does not carry.
				if (outer === undefined || outer.includes('r:'))
					return (context) =>
						marklessThen(loadUnbound(), (raw) => scope(raw, instancePath)(context));
				const scoped = outer ? scope(run, outer) : run;
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

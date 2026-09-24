import type { RuntimeDemandMapArtifact } from '@markless/compiler';
import type { SourceLazySymbolRoute } from './source-module.ts';

export function emitScalarPlanLoader(
	actions: RuntimeDemandMapArtifact['actions'],
	routes: ReadonlyArray<SourceLazySymbolRoute>,
): string {
	const ordered = routes
		.filter((route) => route.prefix.length > 0)
		.toSorted((left, right) => right.prefix.length - left.prefix.length);
	const scalarActions = actions.filter(
		(action) => action.recordKind === 'event' && action.plan?.kind === 'scalar',
	);
	if (scalarActions.length === 0 && ordered.length === 0) return '';
	return [
		'export function loadScalarActionPlan(symbolId) {',
		...scalarActions.map(
			(action) =>
				`\tif (symbolId === ${JSON.stringify(action.plan!.symbolId)}) return ${JSON.stringify({ hostNodeId: action.hostNodeId, eventName: action.eventName, scope: '', plan: action.plan })};`,
		),
		...ordered.flatMap((route) => [
			`\tif (symbolId.startsWith(${JSON.stringify(route.prefix)})) {`,
			'importSource' in route
				? `\t\treturn import(${JSON.stringify(route.importSource)}).then(module => module.loadScalarActionPlan?.(symbolId.slice(${route.prefix.length}))).then(action => action && ({ ...action, scope: ${JSON.stringify(route.prefix)} + action.scope }));`
				: `\t\treturn Promise.resolve(loadScalarActionPlan(symbolId.slice(${route.prefix.length}))).then(action => action && ({ ...action, scope: ${JSON.stringify(route.prefix)} + action.scope }));`,
			'\t}',
		]),
		'}',
	].join('\n');
}

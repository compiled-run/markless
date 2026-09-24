import type { RouteInteractionClosures } from './interaction-closures.ts';
import {
	deferralPays,
	estimatedGzipKb,
	mergeIntoWiderPack,
	PACK_COST_MODEL,
} from './pack-cost-model.ts';

// Code nothing needs at landing or navigation time; fetched on first import().
export const MARKLESS_DEFERRED_PACK = 'markless-deferred';
// Navigation-only code: fetched on navigation intent, never on a landing page.
export const MARKLESS_NAVIGATION_PACK_PREFIX = 'navigation:';

export function isMarklessDeferredPack(name: string | undefined): boolean {
	return name === MARKLESS_DEFERRED_PACK || !!name?.startsWith(`${MARKLESS_DEFERRED_PACK}-`);
}

export function isMarklessNavigationPack(name: string | undefined): boolean {
	return !!name?.startsWith(MARKLESS_NAVIGATION_PACK_PREFIX);
}

export function isStartupPack(group: string): boolean {
	return !isMarklessDeferredPack(group) && !isMarklessNavigationPack(group);
}

export function planRoutePackGroups(input: {
	readonly modules: ReadonlyMap<
		string,
		{
			readonly dependencies: readonly string[];
			readonly dynamicDependencies?: readonly string[];
			readonly source?: string;
			// Route root this module is materialized for; only real edges reach it, never source siblings.
			readonly reachedFrom?: string;
			// Only client navigation to this module's route runs it (route facade, route render data).
			readonly navigationOnly?: boolean;
			// Source length before tree-shaking; the planner's byte estimate.
			readonly size?: number;
		}
	>;
	readonly routes: ReadonlyMap<string, readonly string[]>;
	// Dynamic-import targets no payload record demands; code reachable only through them is deferred.
	readonly undemandedDynamicTargets?: ReadonlySet<string>;
	// Interaction closures per route; when present, packs are cut into first-use, navigation and deferred tiers.
	readonly closures?: readonly RouteInteractionClosures[];
	// Filled with the routes each shared:<id> code pack serves.
	readonly routeSets?: Map<string, ReadonlyArray<string>>;
}): Map<string, string> {
	const sources = new Map<string, string[]>();
	for (const [id, module] of input.modules) {
		if (!module.source || module.reachedFrom !== undefined) continue;
		const siblings = sources.get(module.source) ?? [];
		siblings.push(id);
		sources.set(module.source, siblings);
	}
	const roots = new Map<string, string>();
	for (const [route, ids] of input.routes) {
		for (const id of ids) {
			if (!input.modules.has(id))
				throw new Error(`Markless route ${route} has missing root ${id}.`);
			roots.set(id, route);
		}
	}
	const owners = new Map<string, Set<string>>();
	for (const [route, ids] of input.routes) {
		const pending = [...ids];
		const visited = new Set<string>();
		while (pending.length) {
			const id = pending.pop()!;
			if (visited.has(id)) continue;
			visited.add(id);
			if (roots.has(id) && roots.get(id) !== route) continue;
			const module = input.modules.get(id);
			if (!module) continue;
			const routes = owners.get(id) ?? new Set<string>();
			routes.add(route);
			owners.set(id, routes);
			pending.push(...module.dependencies, ...(module.dynamicDependencies ?? []));
			if (module.source) pending.push(...(sources.get(module.source) ?? []));
		}
	}
	// Code outside every route closure runs on any route, so it must never statically import a route-specific pack.
	const reachedOutsideRoutes = new Set<string>();
	const outside = [...input.modules.keys()].filter((id) => !owners.has(id));
	while (outside.length) {
		const id = outside.pop()!;
		for (const dependency of input.modules.get(id)?.dependencies ?? []) {
			if (roots.has(dependency) || !owners.has(dependency)) continue;
			if (reachedOutsideRoutes.has(dependency)) continue;
			reachedOutsideRoutes.add(dependency);
			outside.push(dependency);
		}
	}
	const routeSpecific = (id: string) =>
		owners.get(id)!.size < input.routes.size &&
		(owners.get(id)!.size === 1 || input.modules.get(id)?.reachedFrom !== undefined);
	// A route whose every root is navigation-only keeps one pack: its landing page has nothing else to load.
	const landingRoutes = new Set(
		[...roots]
			.filter(([id]) => !input.modules.get(id)!.navigationOnly)
			.map(([, route]) => route),
	);
	const undemanded = input.undemandedDynamicTargets ?? new Set<string>();
	const reach = (landingOnly: boolean) => {
		const reached = new Set<string>();
		// Code outside every route closure (navigation, client render) pins what it reaches too.
		const pending = [...input.modules.keys()].filter((id) => roots.has(id) || !owners.has(id));
		while (pending.length) {
			const id = pending.pop()!;
			if (reached.has(id)) continue;
			const module = input.modules.get(id);
			if (landingOnly && module?.navigationOnly && roots.has(id)) continue;
			reached.add(id);
			if (!module) continue;
			pending.push(...module.dependencies);
			for (const target of module.dynamicDependencies ?? [])
				if (landingOnly || !undemanded.has(target)) pending.push(target);
			if (module.source) pending.push(...(sources.get(module.source) ?? []));
		}
		return reached;
	};
	const critical = reach(false);
	// What only a navigation-only root reaches runs on navigation alone; any landing import, even a lazy one, keeps it.
	const landing = reach(true);
	// Modules outside every route closure stay ungrouped so Rolldown keeps dynamic-only code lazy.
	const groups = new Map(
		[...owners]
			.filter(([id]) => !(reachedOutsideRoutes.has(id) && routeSpecific(id)))
			.map(([id, routes]): [string, string] => [
				id,
				!critical.has(id)
					? MARKLESS_DEFERRED_PACK
					: routes.size === 1
						? !landing.has(id) && landingRoutes.has([...routes][0]!)
							? `${MARKLESS_NAVIGATION_PACK_PREFIX}${[...routes][0]}`
							: `route:${[...routes][0]}`
						: // Render data shared by some routes rides neither every route's shared pack nor the code packs of those routes.
							input.modules.get(id)?.reachedFrom !== undefined
							? `shared:${routeSetId(routeKey(routes))}:data`
							: 'shared',
			]),
	);
	// Code only some routes reach leaves the shared pack when the routes that never run it would pay
	// more in bytes than a file of its own costs the routes that do; code outside the routes stays.
	const subsets = new Map<string, string[]>();
	for (const [id, group] of groups) {
		const routes = owners.get(id)!;
		if (group === 'shared' && routes.size < input.routes.size && !reachedOutsideRoutes.has(id))
			push(subsets, routeKey(routes), id);
	}
	for (const [key, ids] of subsets) {
		const needing = routesOf(key).filter((route) => landingRoutes.has(route)).length;
		if (
			!mergeIntoWiderPack({
				gzipKb: estimatedGzipKb(ids.reduce((sum, id) => sum + (input.modules.get(id)?.size ?? 0), 0)),
				loadersNeeding: needing,
				loadersNotNeeding: landingRoutes.size - needing,
				msPerGzipKb: PACK_COST_MODEL.bootMsPerGzipKb,
			})
		)
		{
			const name = `shared:${routeSetId(key)}`;
			input.routeSets?.set(name, routesOf(key));
			for (const id of ids) groups.set(id, name);
		}
	}
	return input.closures ? tierByFirstUse(groups, owners, input) : groups;
}

// Cuts the eager packs into tiers: what boot and any control's first use needs (preloaded with
// the page, one round), what only a client render needs (navigation packs), and the rest (fetched
// on demand). Within a tier, code several routes need shares one pack unless the cost model says
// the routes that do not need it would pay more in bytes than the others save in files.
function tierByFirstUse(
	groups: ReadonlyMap<string, string>,
	owners: ReadonlyMap<string, ReadonlySet<string>>,
	input: Parameters<typeof planRoutePackGroups>[0],
): Map<string, string> {
	const fallbackRoutes = new Set<string>();
	const firstUse = new Map<string, Set<string>>();
	const render = new Map<string, Set<string>>();
	for (const route of input.closures ?? []) {
		if (route.fallback) {
			fallbackRoutes.add(route.route);
			continue;
		}
		for (const consumer of route.consumers)
			for (const id of consumer.modules) {
				const tier = consumer.kind === 'render' ? render : firstUse;
				const routes = tier.get(id) ?? new Set<string>();
				routes.add(route.route);
				tier.set(id, routes);
			}
	}
	const critical = new Map<string, string[]>();
	const rendered = new Map<string, string[]>();
	const deferred = new Map<string, string[]>();
	for (const [id, group] of groups) {
		if (group === MARKLESS_DEFERRED_PACK) continue;
		const reachedBy = owners.get(id) ?? new Set<string>();
		if ([...reachedBy].some((route) => fallbackRoutes.has(route))) continue;
		const landing = firstUse.get(id);
		// A route pack carries only code no other route can reach; loading it elsewhere loads the route.
		const foreign = [...reachedBy].some((route) => !landing?.has(route));
		if (landing) push(critical, `${routeKey(landing)}${foreign ? SHARED_MARK : ''}`, id);
		else if (render.has(id)) push(rendered, routeKey(render.get(id)!), id);
		else if (reachedBy.size) push(deferred, routeKey(reachedBy), id);
	}
	const gzipKb = (ids: readonly string[]) =>
		estimatedGzipKb(ids.reduce((sum, id) => sum + (input.modules.get(id)?.size ?? 0), 0));
	const tiered = new Map(groups);
	const landingRoutes = new Set([...critical.keys()].flatMap(routesOf));
	for (const [marked, ids] of critical) {
		const key = marked.replace(SHARED_MARK, '');
		const routes = routesOf(key);
		const name =
			routes.length === 1 && key === marked
				? `route:${routes[0]}`
				: routes.length === landingRoutes.size ||
					  mergeIntoWiderPack({
							gzipKb: gzipKb(ids),
							loadersNeeding: routes.length,
							loadersNotNeeding: landingRoutes.size - routes.length,
							msPerGzipKb: PACK_COST_MODEL.bootMsPerGzipKb,
					  })
					? 'shared'
					: `shared:${routeSetId(key)}`;
		if (name.startsWith('shared:')) input.routeSets?.set(name, routes);
		for (const id of ids) tiered.set(id, name);
	}
	const renderIds = [...rendered.values()].flat();
	if (deferralPays(gzipKb(renderIds))) {
		const renderRoutes = new Set([...rendered.keys()].flatMap(routesOf));
		for (const [key, ids] of rendered) {
			const routes = routesOf(key);
			const name =
				routes.length === 1
					? `${MARKLESS_NAVIGATION_PACK_PREFIX}${routes[0]}`
					: routes.length === renderRoutes.size ||
						  mergeIntoWiderPack({
								gzipKb: gzipKb(ids),
								loadersNeeding: routes.length,
								loadersNotNeeding: renderRoutes.size - routes.length,
								msPerGzipKb: PACK_COST_MODEL.interactionMsPerGzipKb,
						  })
						? `${MARKLESS_NAVIGATION_PACK_PREFIX}shared`
						: `${MARKLESS_NAVIGATION_PACK_PREFIX}shared:${routeSetId(key)}`;
			for (const id of ids) tiered.set(id, name);
		}
	}
	const deferredIds = [...deferred.values()].flat();
	if (deferralPays(gzipKb(deferredIds))) {
		const reachingRoutes = new Set([...deferred.keys()].flatMap(routesOf));
		for (const [key, ids] of deferred) {
			const routes = routesOf(key);
			const wide =
				routes.length === reachingRoutes.size ||
				mergeIntoWiderPack({
					gzipKb: gzipKb(ids),
					loadersNeeding: routes.length,
					loadersNotNeeding: reachingRoutes.size - routes.length,
					msPerGzipKb: PACK_COST_MODEL.interactionMsPerGzipKb,
				});
			const name = wide
				? MARKLESS_DEFERRED_PACK
				: `${MARKLESS_DEFERRED_PACK}-${routeSetId(key)}`;
			for (const id of ids) tiered.set(id, name);
		}
		// One level deep: deferred code rides the navigation or deferred pack it imports, one fetch away.
		for (let moved = true; moved;) {
			moved = false;
			for (const id of deferredIds) {
				const own = tiered.get(id)!;
				if (!isMarklessDeferredPack(own)) continue;
				const target = input.modules
					.get(id)!
					.dependencies.map((dependency) => tiered.get(dependency))
					.filter(
						(name): name is string =>
							name !== undefined &&
							name !== own &&
							(isMarklessNavigationPack(name) || isMarklessDeferredPack(name)),
					)
					.sort()[0];
				if (!target) continue;
				for (const other of deferredIds)
					if (tiered.get(other) === own) tiered.set(other, target);
				moved = true;
			}
		}
	}
	return tiered;
}

const ROUTE_KEY_SEPARATOR = '\n';
const SHARED_MARK = '\t';

function routeKey(routes: ReadonlySet<string>): string {
	return [...routes].sort().join(ROUTE_KEY_SEPARATOR);
}

// Pack names become file-name inputs, so a route set is named by a stable digest, not listed.
function routeSetId(key: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < key.length; index++)
		hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193) >>> 0;
	return hash.toString(36);
}

function routesOf(key: string): string[] {
	return key.replace(SHARED_MARK, '').split(ROUTE_KEY_SEPARATOR);
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const values = map.get(key);
	if (values) values.push(value);
	else map.set(key, [value]);
}

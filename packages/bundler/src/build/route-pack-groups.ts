import type { RouteInteractionClosures } from './interaction-closures.ts';
import {
	deferralPays,
	estimatedGzipKb,
	frameworkSplitPays,
	lazySiblingPays,
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

/** Deferred packs plus the module-free facade chunks Rolldown emits in front of their entries. */
export function marklessDeferredChunkFileNames(
	chunks: Iterable<{
		readonly fileName: string;
		readonly name?: string;
		readonly imports: readonly string[];
		readonly moduleIds?: readonly string[];
	}>,
): Set<string> {
	const all = [...chunks];
	const deferred = new Set(
		all.filter((chunk) => isMarklessDeferredPack(chunk.name)).map((chunk) => chunk.fileName),
	);
	for (let grew = deferred.size > 0; grew;) {
		grew = false;
		for (const chunk of all)
			if (
				!deferred.has(chunk.fileName) &&
				chunk.moduleIds?.length === 0 &&
				chunk.imports.length > 0 &&
				chunk.imports.every((name) => deferred.has(name))
			) {
				deferred.add(chunk.fileName);
				grew = true;
			}
	}
	return deferred;
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
			// Runs when a landing page dispatches its first event (resume and symbol modules, wake and settle entries).
			readonly firstEvent?: boolean;
			// One compiled event handler: runs only when its own event fires.
			readonly handler?: boolean;
			// Source length before tree-shaking; the planner's byte estimate.
			readonly size?: number;
			// App source, as opposed to framework or dependency code: it changes with nearly every deploy.
			readonly app?: boolean;
		}
	>;
	readonly routes: ReadonlyMap<string, readonly string[]>;
	// Dynamic-import targets no payload record demands; code reachable only through them is deferred.
	readonly undemandedDynamicTargets?: ReadonlySet<string>;
	// Interaction closures per route. A route without them, or with a fallback, has unknown first use:
	// everything its landing page can reach is preloaded with that page.
	readonly closures?: readonly RouteInteractionClosures[];
	// Filled with the routes each shared:<id> code pack serves.
	readonly routeSets?: Map<string, ReadonlyArray<string>>;
	// Each page loads one route (router builds); an entry-rooted page may load all its roots at once.
	readonly pagesLoadOneRoute?: boolean;
	// Filled with the routes whose first event needs a lazy sibling pack at once; their route pack imports it.
	readonly eagerLazyRoutes?: Map<string, ReadonlyArray<string>>;
}): Map<string, string> {
	const sources = new Map<string, string[]>();
	for (const [id, module] of input.modules) {
		if (!module.source || module.reachedFrom !== undefined) continue;
		push(sources, module.source, id);
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
	const walk = (route: string, start: Iterable<string>, visited: Set<string>) => {
		const reached: string[] = [];
		const pending = [...start];
		while (pending.length) {
			const id = pending.pop()!;
			if (visited.has(id)) continue;
			visited.add(id);
			if (roots.has(id) && roots.get(id) !== route) continue;
			const module = input.modules.get(id);
			if (!module) continue;
			add(owners, id, route);
			reached.push(id);
			pending.push(...module.dependencies, ...(module.dynamicDependencies ?? []));
		}
		return reached;
	};
	const visitedByRoute = new Map<string, Set<string>>();
	for (const [route, ids] of input.routes) {
		const visited = new Set<string>();
		walk(route, ids, visited);
		visitedByRoute.set(route, visited);
	}
	// A source sibling joins a route only when no route imports it; an imported one belongs to its importers.
	const imported = new Set(owners.keys());
	for (const [route, visited] of visitedByRoute) {
		const expanded = new Set<string>();
		let frontier = [...visited].filter((id) => owners.get(id)?.has(route));
		while (frontier.length) {
			const next: string[] = [];
			for (const id of frontier) {
				const source = input.modules.get(id)?.source;
				if (!source || expanded.has(source)) continue;
				expanded.add(source);
				const siblings = (sources.get(source) ?? []).filter(
					(sibling) => !imported.has(sibling),
				);
				next.push(...walk(route, siblings, visited));
			}
			frontier = next;
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
	// A route whose every root is navigation-only lands on nothing else, so its navigation code is its landing code.
	const rootedLandings = new Set(
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
	const eager = reach(false);
	// What only a navigation-only root reaches runs on navigation alone; any landing import, even a lazy one, keeps it.
	const landing = reach(true);

	// Each eager module lands in one tier per route: first use (preloaded with the page, one round),
	// render (only a client render runs it: navigation packs), or neither (fetched on demand).
	const firstUse = new Map<string, Set<string>>();
	const render = new Map<string, Set<string>>();
	const known = new Set<string>();
	for (const route of input.closures ?? []) {
		if (route.fallback) continue;
		known.add(route.route);
		for (const consumer of route.consumers)
			for (const id of consumer.modules)
				add(consumer.kind === 'render' ? render : firstUse, id, route.route);
	}
	const planned = [...owners.keys()].filter(
		(id) => eager.has(id) && !(reachedOutsideRoutes.has(id) && routeSpecific(id)),
	);
	for (const id of planned)
		for (const route of owners.get(id)!)
			if (!known.has(route))
				add(landing.has(id) || !rootedLandings.has(route) ? firstUse : render, id, route);
	const gzipKb = (ids: readonly string[]) =>
		estimatedGzipKb(ids.reduce((sum, id) => sum + (input.modules.get(id)?.size ?? 0), 0));
	// A tier too small to pay for its own file rides the landing packs of the routes that reach it.
	const renderIds = planned.filter((id) => !firstUse.has(id) && render.has(id));
	const deferRender = deferralPays(gzipKb(renderIds));
	if (!deferRender) for (const id of renderIds) firstUse.set(id, render.get(id)!);
	const idleIds = planned.filter((id) => !firstUse.has(id) && !render.has(id));
	const deferIdle = deferralPays(gzipKb(idleIds));
	if (!deferIdle) for (const id of idleIds) firstUse.set(id, owners.get(id)!);

	const groups = new Map<string, string>();
	for (const id of owners.keys())
		if (!eager.has(id) && !(reachedOutsideRoutes.has(id) && routeSpecific(id)))
			groups.set(id, MARKLESS_DEFERRED_PACK);
	const critical = new Map<string, string[]>();
	for (const id of planned) {
		const routes = firstUse.get(id);
		if (!routes) continue;
		// A route pack carries only code no other route can reach; loading it elsewhere loads the route.
		const foreign = [...owners.get(id)!].some((route) => !routes.has(route));
		push(critical, `${routeKey(routes)}${foreign ? SHARED_MARK : ''}`, id);
	}
	const landingRoutes = new Set([...critical.keys()].flatMap(routesOf));
	for (const [marked, ids] of critical) {
		const key = marked.replace(SHARED_MARK, '');
		const routes = routesOf(key);
		const name =
			routes.length === 1 && key === marked
				? `route:${routes[0]}`
				: routes.length === landingRoutes.size ||
					  !input.pagesLoadOneRoute ||
					  mergeIntoWiderPack({
							gzipKb: gzipKb(ids),
							loadersNeeding: routes.length,
							loadersNotNeeding: landingRoutes.size - routes.length,
							msPerGzipKb: PACK_COST_MODEL.bootMsPerGzipKb,
					  })
					? 'shared'
					: `shared:${routeSetId(key)}`;
		if (name.startsWith('shared:')) input.routeSets?.set(name, routes);
		for (const id of ids) groups.set(id, name);
	}
	if (deferRender) {
		const rendered = new Map<string, string[]>();
		for (const id of renderIds) push(rendered, routeKey(render.get(id)!), id);
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
			for (const id of ids) groups.set(id, name);
		}
	}
	if (deferIdle) {
		const deferred = new Map<string, string[]>();
		for (const id of idleIds) push(deferred, routeKey(owners.get(id)!), id);
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
			for (const id of ids) groups.set(id, name);
		}
		// One level deep: deferred code rides the navigation or deferred pack it imports, one fetch away.
		for (let moved = true; moved;) {
			moved = false;
			for (const id of idleIds) {
				const own = groups.get(id)!;
				if (!isMarklessDeferredPack(own)) continue;
				const target = input.modules
					.get(id)!
					.dependencies.map((dependency) => groups.get(dependency))
					.filter(
						(name): name is string =>
							name !== undefined &&
							name !== own &&
							(isMarklessNavigationPack(name) || isMarklessDeferredPack(name)),
					)
					.sort()[0];
				if (!target) continue;
				for (const other of idleIds)
					if (groups.get(other) === own) groups.set(other, target);
				moved = true;
			}
		}
	}
	// Entry-rooted builds resolve symbols through their source's symbol chunk, so their packs stay whole.
	return input.pagesLoadOneRoute
		? splitFrameworkFromApp(
				splitStartupPacksByStaticReach(groups, roots, sources, owners, input),
				input,
			)
		: groups;
}

function splitFrameworkFromApp(
	groups: Map<string, string>,
	input: Parameters<typeof planRoutePackGroups>[0],
): Map<string, string> {
	const halves = new Map<string, { app: string[]; framework: string[] }>();
	for (const [id, group] of groups) {
		if (!isStartupPack(group)) continue;
		const half = halves.get(group) ?? { app: [], framework: [] };
		halves.set(group, half);
		(input.modules.get(id)?.app ? half.app : half.framework).push(id);
	}
	const gzipKb = (ids: readonly string[]) =>
		estimatedGzipKb(ids.reduce((sum, id) => sum + (input.modules.get(id)?.size ?? 0), 0));
	for (const [group, half] of halves) {
		if (
			!frameworkSplitPays({
				appGzipKb: gzipKb(half.app),
				frameworkGzipKb: gzipKb(half.framework),
			})
		)
			continue;
		for (const id of half.framework) groups.set(id, `${group}${FRAMEWORK_PIECE}`);
	}
	return groups;
}

// A landing root's static imports evaluate before its first event handler can run, so the code of a startup
// pack those roots reach only through import() moves to a lazy sibling pack preloaded in the same round.
function splitStartupPacksByStaticReach(
	groups: Map<string, string>,
	roots: ReadonlyMap<string, string>,
	sources: ReadonlyMap<string, readonly string[]>,
	owners: ReadonlyMap<string, ReadonlySet<string>>,
	input: Parameters<typeof planRoutePackGroups>[0],
): Map<string, string> {
	const gzipKbOf = (ids: readonly string[]) =>
		estimatedGzipKb(ids.reduce((sum, id) => sum + (input.modules.get(id)?.size ?? 0), 0));
	const flagged = [...input.modules.values()].some((module) => module.firstEvent !== undefined);
	const seed = (id: string) => {
		const module = input.modules.get(id);
		return !!module && !module.navigationOnly && (!flagged || !!module.firstEvent);
	};
	const handler = (id: string) => !!input.modules.get(id)?.handler;
	// Static imports and first-event siblings from `start`, outside `path`; handler siblings are only collected.
	const closure = (route: string, start: readonly string[], path: ReadonlySet<string>) => {
		const reached = new Set<string>();
		const handlers = new Set<string>();
		const pending = [...start];
		while (pending.length) {
			const id = pending.pop()!;
			if (path.has(id) || reached.has(id) || (roots.has(id) && roots.get(id) !== route))
				continue;
			const module = input.modules.get(id);
			if (!module) continue;
			reached.add(id);
			pending.push(...module.dependencies);
			for (const sibling of module.source ? (sources.get(module.source) ?? []) : [])
				if (seed(sibling) && sibling !== id)
					if (handler(sibling)) handlers.add(sibling);
					else pending.push(sibling);
		}
		return { reached, handlers };
	};
	// What a first event on some route statically reaches. A handler whose own imports would add a
	// file's worth of code stays off the path: only its own event waits for it.
	const staticReach = new Set<string>();
	for (const [route, ids] of input.routes) {
		const visited = new Set<string>();
		const first = closure(
			route,
			ids.filter((id) => seed(id) && !handler(id)),
			visited,
		);
		for (const id of first.reached) visited.add(id);
		// A handler only this page reaches rides its route pack; one other routes share keeps its shared pack whole.
		const candidates = [
			...first.handlers,
			...[...owners]
				.filter(
					([id, routes]) =>
						routes.size === 1 && routes.has(route) && seed(id) && handler(id),
				)
				.map(([id]) => id),
		];
		while (candidates.length) {
			const id = candidates.pop()!;
			if (visited.has(id)) continue;
			const extra = closure(route, [id], visited);
			const imported = [...extra.reached].filter((reached) => reached !== id);
			if (deferralPays(gzipKbOf(imported))) continue;
			for (const reached of extra.reached) visited.add(reached);
			candidates.push(...extra.handlers);
		}
		for (const id of visited) staticReach.add(id);
	}
	const known = new Map(
		(input.closures ?? [])
			.filter((route) => !route.fallback)
			.map((route) => [route.route, route]),
	);
	// A first event the compiler serves on no lean dispatch path runs the full resume runtime at once.
	const firstEventNeedsRuntime = (route: string) =>
		!known.has(route) ||
		known
			.get(route)!
			.consumers.some((consumer) => consumer.kind === 'action' && !consumer.lean);
	const firstEventIsLean = (route: string) =>
		!firstEventNeedsRuntime(route) &&
		known.get(route)!.consumers.some((consumer) => consumer.kind === 'action');
	const routePacks = new Set([...groups.values()].filter((group) => group.startsWith('route:')));
	const lazy = new Map<string, string[]>();
	const packSizes = new Map<string, number>();
	for (const [id, group] of groups) {
		if (!isStartupPack(group)) continue;
		packSizes.set(group, (packSizes.get(group) ?? 0) + 1);
		if (!staticReach.has(id)) push(lazy, group, id);
	}
	for (const [group, ids] of lazy) {
		if (ids.length === packSizes.get(group)) continue;
		const loaders = new Set(ids.flatMap((id) => [...(owners.get(id) ?? [])]));
		const eager = [...loaders].filter(firstEventNeedsRuntime);
		const loadersSpedUp = [...loaders].filter(firstEventIsLean).length;
		if (!lazySiblingPays({ gzipKb: gzipKbOf(ids), loadersSpedUp, loaders: loaders.size }))
			continue;
		// Such a route evaluates the lazy half with its own route pack, so it needs one.
		if (eager.some((route) => !routePacks.has(`route:${route}`))) continue;
		const name = lazyStartupPackName(group);
		for (const id of ids) groups.set(id, name);
		if (eager.length) input.eagerLazyRoutes?.set(name, eager.sort());
	}
	return groups;
}

export function lazyStartupPackName(group: string): string {
	return group.replace(/^(route|shared)/, `$1${LAZY_PACK_MARK}`);
}

// The startup pack a lazy sibling was cut from; any other name is returned as is.
export function startupPackOfLazy(name: string): string {
	return name.replace(new RegExp(`^(route|shared)${LAZY_PACK_MARK}`), '$1');
}

const LAZY_PACK_MARK = '-lazy';
// A piece of a pack serves the same routes as the pack; lazy-module facades read `~<n>` as such.
const FRAMEWORK_PIECE = '~1';

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

function add<K, V>(map: Map<K, Set<V>>, key: K, value: V) {
	const values = map.get(key);
	if (values) values.add(value);
	else map.set(key, new Set([value]));
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
	const values = map.get(key);
	if (values) values.push(value);
	else map.set(key, [value]);
}

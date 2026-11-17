import { PACK_RESIDENT } from './resident-load.ts';

/** A module a write may reach: its specifier, its load, and the demand map's id when it is runtime code. */
type Named = readonly [specifier: string, load: () => Promise<unknown>, runtimeModuleId?: string];

const resident = new Map<string, unknown>();
const loading = new Map<string, Promise<void>>();
const named: Array<readonly [key: string, load: () => Promise<unknown>, runtimeModuleId?: string]> =
	[];

/**
 * Dev server only: a module the first interaction loaded answers in the caller's task, as packed code does in a build.
 * `scope` is the importer's URL, so the same relative specifier in two modules names two modules.
 */
export function marklessDevLoad<T>(
	scope: string,
	specifier: string,
	load: () => Promise<T>,
): Promise<T> {
	const key = `${scope} ${specifier}`;
	if (!resident.has(key)) return load();
	const mod = resident.get(key) as T;
	return Object.assign(Promise.resolve(mod), { [PACK_RESIDENT]: () => mod });
}

/** Names modules a write may reach; nothing loads until a handler does. */
export function marklessDevWarm(scope: string, modules: ReadonlyArray<Named>): void {
	for (const [specifier, load, id] of modules) named.push([`${scope} ${specifier}`, load, id]);
}

/**
 * Loads the app code named so far and the runtime code the handler's actions demand, and what those name in turn;
 * runtime code no action of this handler demands stays unloaded, as it does in a build. Without ids, all of it loads.
 */
export async function marklessDevWarmed(runtimeModuleIds?: ReadonlyArray<string>): Promise<void> {
	const demanded = runtimeModuleIds && new Set(runtimeModuleIds);
	const tried = new Set<string>();
	for (;;) {
		const due = named.filter(
			([key, , id]) =>
				!resident.has(key) && !tried.has(key) && (id === undefined || !demanded || demanded.has(id)),
		);
		for (const [key] of due) tried.add(key);
		const waits = due.map(([key, load]) => {
			let wait = loading.get(key);
			if (!wait) {
				wait = load().then(
					(mod) => void resident.set(key, mod),
					() => undefined,
				);
				loading.set(key, wait);
			}
			return wait;
		});
		if (waits.length === 0) return;
		await Promise.all(waits);
		// One that failed stays out of the resident set and loads again where it is used.
		for (const [key] of due) loading.delete(key);
	}
}

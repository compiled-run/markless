import { PACK_RESIDENT } from './resident-load.ts';

type Named = ReadonlyArray<readonly [string, () => Promise<unknown>]>;

const resident = new Map<string, unknown>();
const named: Named[] = [];
let warming: Promise<void> | undefined;

/**
 * Dev server only: a module the first interaction loaded answers in the caller's task, as packed code does in a build.
 * `scope` is the importer's URL, so the same relative specifier in two modules names two modules.
 */
export function marklessDevLoad<T>(scope: string, specifier: string, load: () => Promise<T>): Promise<T> {
	const key = `${scope} ${specifier}`;
	if (!resident.has(key)) return load();
	const mod = resident.get(key) as T;
	return Object.assign(Promise.resolve(mod), { [PACK_RESIDENT]: () => mod });
}

/** Names modules a write may reach; nothing loads until a handler does. */
export function marklessDevWarm(scope: string, modules: Named): void {
	named.push(modules.map(([specifier, load]) => [`${scope} ${specifier}`, load] as const));
}

async function warm(): Promise<void> {
	while (named.length > 0)
		await Promise.all(
			named
				.splice(0)
				.flat()
				.filter(([key]) => !resident.has(key))
				.map(([key, load]) =>
					load().then(
						(mod) => void resident.set(key, mod),
						() => undefined,
					),
				),
		);
}

/** Loads every module named so far, and what those name in turn; one that fails loads again where it is used. */
export function marklessDevWarmed(): Promise<void> {
	return (warming ??= warm().finally(() => (warming = undefined)));
}

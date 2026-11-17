import { PACK_RESIDENT } from './resident-load.ts';

/** Dev server only: a module already imported, handed out as a build hands out packed code already on the page. */
export function marklessDevResident<T>(mod: T): Promise<T> {
	return Object.assign(Promise.resolve(mod), { [PACK_RESIDENT]: () => mod });
}

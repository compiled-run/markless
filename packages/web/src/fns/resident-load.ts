/** The property a packed `import()` of code already on the page carries its loader on. */
export const PACK_RESIDENT = '$mlNow';

/**
 * `loading.then(use)`, run in the caller's own task when the module is already on the page.
 * A throw still reaches the caller as a rejected load.
 */
export function marklessWhenLoaded<T>(
	loading: Promise<unknown>,
	use: (mod: never) => T | Promise<T>,
): T | Promise<T> {
	// Spelled out, not read from PACK_RESIDENT: a module-level constant would run at page load.
	const resident = (loading as Promise<unknown> & { readonly $mlNow?: () => unknown }).$mlNow;
	if (resident) {
		try {
			return use(resident() as never);
		} catch (error) {
			return loading.then(() => {
				throw error;
			});
		}
	}
	return loading.then(use as (mod: unknown) => T | Promise<T>);
}

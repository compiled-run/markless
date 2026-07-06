export async function marklessResolveResult<T>(value: T | Promise<T>): Promise<T> {
	return value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
		? await value
		: value;
}

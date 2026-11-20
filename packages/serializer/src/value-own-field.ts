/**
 * Sets a field whose key came from data (a decoded payload, a URL, stored state) as an own
 * property. Assigning would treat a `__proto__` key as the prototype setter and replace the
 * object's prototype; JSON.parse makes the same key an own field, and so does this.
 */
export function setDataField(target: object, key: string, value: unknown): void {
	if (key === '__proto__')
		Object.defineProperty(target, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true,
		});
	else (target as Record<string, unknown>)[key] = value;
}

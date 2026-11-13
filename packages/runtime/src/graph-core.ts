import type { ProtocolStatePayload } from '@markless/serializer';

type RuntimeSharedDefinition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];
type RuntimeSharedReturnProperty = NonNullable<RuntimeSharedDefinition['returnProperties']>[number];

export function findLastSharedReturnProperty(
	properties: NonNullable<RuntimeSharedDefinition['returnProperties']> | undefined,
	propertyName: string,
): RuntimeSharedReturnProperty | undefined {
	if (!properties) return undefined;

	for (let index = properties.length - 1; index >= 0; index--) {
		const property = properties[index];
		if (property?.name === propertyName) return property;
	}

	return undefined;
}

export function readPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;

	for (const segment of path) {
		if (current == null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

export function writePath(
	value: unknown,
	path: ReadonlyArray<string>,
	nextValue: unknown,
): unknown {
	if (path.length === 0) return nextValue;

	const root = isObject(value) ? value : {};
	let current = root as Record<string, unknown>;

	for (const segment of path.slice(0, -1)) {
		const child = current[segment];
		if (!isObject(child)) {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}

	current[path[path.length - 1]] = nextValue;
	return root;
}

export function dirtyPathForGraphWrite(
	value: unknown,
	path: ReadonlyArray<string>,
): ReadonlyArray<string> {
	if (path[path.length - 1] !== 'length') return path;

	const parentPath = path.slice(0, -1);
	const parent = readPath(value, parentPath);
	if (!Array.isArray(parent)) return path;

	return parentPath;
}

export function deletePath(
	value: unknown,
	path: ReadonlyArray<string>,
): {
	readonly result: boolean;
	readonly mutated: boolean;
} {
	if (path.length === 0) {
		throw new TypeError('Cannot delete a graph node root. Delete a property path instead.');
	}

	let current = value;

	for (const segment of path.slice(0, -1)) {
		if (current == null) {
			throw new TypeError(`Cannot delete graph path "${path.join('.')}".`);
		}

		current = (current as Record<string, unknown>)[segment];
	}

	if (current == null) {
		throw new TypeError(`Cannot delete graph path "${path.join('.')}".`);
	}

	if (!isObject(current)) {
		return { result: true, mutated: false };
	}

	const key = path[path.length - 1];
	const hadProperty = Object.prototype.hasOwnProperty.call(current, key);
	const result = delete current[key];

	return { result, mutated: hadProperty && result };
}

export function pathsIntersect(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
	return isPrefix(a, b) || isPrefix(b, a);
}

function isPrefix(prefix: ReadonlyArray<string>, value: ReadonlyArray<string>): boolean {
	if (prefix.length > value.length) return false;

	return prefix.every((segment, index) => value[index] === segment);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

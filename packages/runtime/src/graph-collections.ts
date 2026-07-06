type ArraySlotSnapshot = {
	readonly exists: boolean;
	readonly value: unknown;
};

type CollectionMutationSnapshot =
	| {
			readonly type: 'size';
			readonly value: number;
	  }
	| {
			readonly type: 'array';
			readonly slots: ReadonlyArray<ArraySlotSnapshot>;
			readonly target: ReadonlyArray<unknown>;
	  }
	| {
			readonly type: 'set-add';
			readonly hadValue: boolean;
	  }
	| {
			readonly type: 'map-set';
			readonly hadKey: boolean;
			readonly valueChanged: boolean;
	  }
	| {
			readonly type: 'date';
			readonly time: number;
			readonly target: Date;
	  };

export function applyCollectionCall(
	target: unknown,
	method: string,
	args: ReadonlyArray<unknown>,
): unknown {
	if (!isSupportedCollectionTarget(target)) {
		throw new TypeError(
			`Cannot call collection method "${method}" because the graph path is not an Array, Map, Set, or Date.`,
		);
	}

	if (!isSupportedCollectionMethod(method)) {
		throw new TypeError(`Unsupported graph collection method "${method}".`);
	}

	const callable = (target as unknown as { readonly [key: string]: unknown })[method];
	if (typeof callable !== 'function') {
		throw new TypeError(`Unsupported graph collection method "${method}".`);
	}

	return Reflect.apply(callable, target, [...args]);
}

export function collectionCallMutated(
	method: string,
	result: unknown,
	beforeMutation: CollectionMutationSnapshot | null,
): boolean {
	if (method === 'delete') return result === true;
	if (method === 'clear') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'pop') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'shift') {
		return beforeMutation?.type === 'size' && beforeMutation.value > 0;
	}
	if (method === 'push' || method === 'unshift') {
		return beforeMutation?.type !== 'size' || result !== beforeMutation.value;
	}
	if (arrayContentMutationMethod(method)) {
		return (
			beforeMutation?.type !== 'array' ||
			!arraySlotsEqual(beforeMutation.slots, beforeMutation.target)
		);
	}
	if (method === 'add') {
		return beforeMutation?.type !== 'set-add' || !beforeMutation.hadValue;
	}
	if (method === 'set') {
		return (
			beforeMutation?.type !== 'map-set' ||
			!beforeMutation.hadKey ||
			beforeMutation.valueChanged
		);
	}
	if (dateMutationMethod(method)) {
		return (
			beforeMutation?.type !== 'date' ||
			!Object.is(beforeMutation.time, beforeMutation.target.getTime())
		);
	}

	return true;
}

export function collectionMutationSnapshot(
	target: unknown,
	method: string,
	args: ReadonlyArray<unknown>,
): CollectionMutationSnapshot | null {
	if (method === 'add' && target instanceof Set) {
		return { type: 'set-add', hadValue: target.has(args[0]) };
	}
	if (method === 'set' && target instanceof Map) {
		const hadKey = target.has(args[0]);
		return {
			type: 'map-set',
			hadKey,
			valueChanged: !hadKey || !Object.is(target.get(args[0]), args[1]),
		};
	}
	if (target instanceof Date && dateMutationMethod(method)) {
		return { type: 'date', time: target.getTime(), target };
	}
	if (arrayContentMutationMethod(method) && Array.isArray(target))
		return { type: 'array', slots: arraySlotSnapshot(target), target };

	if (Array.isArray(target)) return { type: 'size', value: target.length };
	if (target instanceof Map || target instanceof Set) return { type: 'size', value: target.size };

	return null;
}

function isSupportedCollectionMethod(name: string): boolean {
	return (
		name === 'add' ||
		name === 'clear' ||
		name === 'copyWithin' ||
		name === 'delete' ||
		name === 'fill' ||
		name === 'pop' ||
		name === 'push' ||
		name === 'reverse' ||
		name === 'set' ||
		name === 'shift' ||
		name === 'sort' ||
		name === 'splice' ||
		name === 'unshift' ||
		dateMutationMethod(name)
	);
}

function isSupportedCollectionTarget(
	target: unknown,
): target is unknown[] | Map<unknown, unknown> | Set<unknown> | Date {
	return (
		Array.isArray(target) ||
		target instanceof Map ||
		target instanceof Set ||
		target instanceof Date
	);
}

function arrayContentMutationMethod(method: string): boolean {
	return (
		method === 'copyWithin' ||
		method === 'fill' ||
		method === 'reverse' ||
		method === 'sort' ||
		method === 'splice'
	);
}

function dateMutationMethod(method: string): boolean {
	return (
		method === 'setDate' ||
		method === 'setFullYear' ||
		method === 'setHours' ||
		method === 'setMilliseconds' ||
		method === 'setMinutes' ||
		method === 'setMonth' ||
		method === 'setSeconds' ||
		method === 'setTime' ||
		method === 'setUTCDate' ||
		method === 'setUTCFullYear' ||
		method === 'setUTCHours' ||
		method === 'setUTCMilliseconds' ||
		method === 'setUTCMinutes' ||
		method === 'setUTCMonth' ||
		method === 'setUTCSeconds' ||
		method === 'setYear'
	);
}

function arraySlotSnapshot(target: ReadonlyArray<unknown>): ArraySlotSnapshot[] {
	return Array.from({ length: target.length }, (_, index) => ({
		exists: Object.prototype.hasOwnProperty.call(target, index),
		value: target[index],
	}));
}

function arraySlotsEqual(before: ReadonlyArray<ArraySlotSnapshot>, after: unknown): boolean {
	if (!Array.isArray(after)) return false;
	if (before.length !== after.length) return false;

	return before.every((slot, index) => {
		const exists = Object.prototype.hasOwnProperty.call(after, index);
		return slot.exists === exists && (!slot.exists || Object.is(slot.value, after[index]));
	});
}

export type SerializedPrimitive =
	| null
	| string
	| number
	| boolean
	| { readonly $type: 'undefined' }
	| { readonly $type: 'bigint'; readonly value: string };

export type SerializedSlot =
	| SerializedPrimitive
	| { readonly $ref: number }
	| { readonly $type: 'date'; readonly value: string }
	| { readonly $type: 'regexp'; readonly source: string; readonly flags: string }
	| { readonly $type: 'url'; readonly value: string };

export type SerializedRecord =
	| {
			readonly id: number;
			readonly type: 'object';
			readonly fields: ReadonlyArray<readonly [string, SerializedSlot]>;
	  }
	| {
			readonly id: number;
			readonly type: 'array';
			readonly items: ReadonlyArray<SerializedSlot>;
	  }
	| {
			readonly id: number;
			readonly type: 'map';
			readonly entries: ReadonlyArray<readonly [SerializedSlot, SerializedSlot]>;
	  }
	| {
			readonly id: number;
			readonly type: 'set';
			readonly values: ReadonlyArray<SerializedSlot>;
	  }
	| {
			readonly id: number;
			readonly type: 'date';
			readonly value: string;
	  }
	| {
			readonly id: number;
			readonly type: 'regexp';
			readonly source: string;
			readonly flags: string;
	  }
	| {
			readonly id: number;
			readonly type: 'url';
			readonly value: string;
	  }
	| {
			readonly id: number;
			readonly type: 'array-buffer';
			readonly bytes: ReadonlyArray<number>;
	  }
	| {
			readonly id: number;
			readonly type: 'typed-array';
			readonly arrayType: TypedArrayName;
			readonly buffer: SerializedSlot;
			readonly byteOffset: number;
			readonly length: number;
	  }
	| {
			readonly id: number;
			readonly type: 'data-view';
			readonly buffer: SerializedSlot;
			readonly byteOffset: number;
			readonly byteLength: number;
	  };

export type TypedArrayName =
	| 'Int8Array'
	| 'Uint8Array'
	| 'Uint8ClampedArray'
	| 'Int16Array'
	| 'Uint16Array'
	| 'Int32Array'
	| 'Uint32Array'
	| 'Float32Array'
	| 'Float64Array'
	| 'BigInt64Array'
	| 'BigUint64Array';

export type SerializedGraphPayload = {
	readonly version: 1;
	readonly root: SerializedSlot;
	readonly records: ReadonlyArray<SerializedRecord>;
};

export type SerializationDiagnostic = {
	readonly code: 'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE';
	readonly severity: 'error';
	readonly phase: 'serialization';
	readonly title: 'Cannot serialize graph state value';
	readonly path: ReadonlyArray<string>;
	readonly statePath: string;
	readonly valueKind: string;
	readonly message: string;
	readonly why: string;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export type SerializationResult =
	| {
			readonly ok: true;
			readonly payload: SerializedGraphPayload;
			readonly diagnostics: readonly [];
	  }
	| {
			readonly ok: false;
			readonly diagnostics: ReadonlyArray<SerializationDiagnostic>;
	  };

export function serializeGraphValue(value: unknown): SerializationResult {
	const diagnostics: SerializationDiagnostic[] = [];
	const seen = new WeakMap<object, number>();
	const records: SerializedRecord[] = [];

	const root = encodeSlot(value, [], seen, records, diagnostics);
	if (diagnostics.length > 0) {
		return {
			ok: false,
			diagnostics,
		};
	}

	return {
		ok: true,
		payload: {
			version: 1,
			root,
			records,
		},
		diagnostics: [],
	};
}

export function deserializeGraphValue(payload: SerializedGraphPayload): unknown {
	const shells = new Map<number, unknown>();

	for (const record of payload.records) {
		if (record.type === 'object') shells.set(record.id, {});
		if (record.type === 'array') shells.set(record.id, []);
		if (record.type === 'map') shells.set(record.id, new Map());
		if (record.type === 'set') shells.set(record.id, new Set());
		if (record.type === 'date') shells.set(record.id, new Date(record.value));
		if (record.type === 'regexp') {
			shells.set(record.id, new RegExp(record.source, record.flags));
		}
		if (record.type === 'url') shells.set(record.id, new URL(record.value));
		if (record.type === 'array-buffer') {
			shells.set(record.id, new Uint8Array(record.bytes).buffer);
		}
	}

	for (const record of payload.records) {
		if (record.type === 'typed-array') {
			shells.set(record.id, createTypedArray(record, shells));
		}
		if (record.type === 'data-view') {
			shells.set(record.id, createDataView(record, shells));
		}
	}

	for (const record of payload.records) {
		const shell = shells.get(record.id);

		if (record.type === 'object') {
			const object = shell as Record<string, unknown>;
			for (const [key, slot] of record.fields) {
				object[key] = decodeSlot(slot, shells);
			}
		}

		if (record.type === 'array') {
			const array = shell as unknown[];
			for (const item of record.items) {
				array.push(decodeSlot(item, shells));
			}
		}

		if (record.type === 'map') {
			const map = shell as Map<unknown, unknown>;
			for (const [key, value] of record.entries) {
				map.set(decodeSlot(key, shells), decodeSlot(value, shells));
			}
		}

		if (record.type === 'set') {
			const set = shell as Set<unknown>;
			for (const value of record.values) {
				set.add(decodeSlot(value, shells));
			}
		}
	}

	return decodeSlot(payload.root, shells);
}

function encodeSlot(
	value: unknown,
	path: ReadonlyArray<string>,
	seen: WeakMap<object, number>,
	records: SerializedRecord[],
	diagnostics: SerializationDiagnostic[],
): SerializedSlot | null {
	if (value === null) return null;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'undefined') return { $type: 'undefined' };
	if (typeof value === 'bigint') return { $type: 'bigint', value: String(value) };

	if (typeof value === 'function' || typeof value === 'symbol') {
		diagnostics.push(unsupportedDiagnostic(value, path));
		return null;
	}

	if (!isObject(value)) {
		diagnostics.push(unsupportedDiagnostic(value, path));
		return null;
	}

	if (value instanceof Date) {
		const existingId = seen.get(value);
		if (existingId !== undefined) return { $ref: existingId };

		const id = records.length;
		seen.set(value, id);
		records.push({ id, type: 'date', value: value.toISOString() });
		return { $ref: id };
	}
	if (value instanceof RegExp) {
		const existingId = seen.get(value);
		if (existingId !== undefined) return { $ref: existingId };

		const id = records.length;
		seen.set(value, id);
		records.push({ id, type: 'regexp', source: value.source, flags: value.flags });
		return { $ref: id };
	}
	if (value instanceof URL) {
		const existingId = seen.get(value);
		if (existingId !== undefined) return { $ref: existingId };

		const id = records.length;
		seen.set(value, id);
		records.push({ id, type: 'url', value: value.toString() });
		return { $ref: id };
	}

	if (value instanceof ArrayBuffer) {
		const existingId = seen.get(value);
		if (existingId !== undefined) return { $ref: existingId };

		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: 'array-buffer',
			bytes: [...new Uint8Array(value)],
		});
		return { $ref: id };
	}

	const arrayType = typedArrayName(value);
	if (arrayType) {
		const existingId = seen.get(value);
		if (existingId !== undefined) return { $ref: existingId };

		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: 'typed-array',
			arrayType,
			buffer: encodeArrayBufferViewBuffer(value, path, seen, records, diagnostics),
			byteOffset: typedArrayByteOffset(value),
			length: typedArrayLength(value),
		});
		return { $ref: id };
	}
	if (value instanceof DataView) {
		const existingId = seen.get(value);
		if (existingId !== undefined) return { $ref: existingId };

		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: 'data-view',
			buffer: encodeArrayBufferViewBuffer(value, path, seen, records, diagnostics),
			byteOffset: value.byteOffset,
			byteLength: value.byteLength,
		});
		return { $ref: id };
	}

	const existingId = seen.get(value);
	if (existingId !== undefined) return { $ref: existingId };

	const id = records.length;
	seen.set(value, id);

	if (Array.isArray(value)) {
		const record: Extract<SerializedRecord, { readonly type: 'array' }> = {
			id,
			type: 'array',
			items: [],
		};
		records.push(record);
		(record.items as SerializedSlot[]).push(
			...value
				.map((item, index) =>
					encodeSlot(item, [...path, String(index)], seen, records, diagnostics),
				)
				.filter(isSerializedSlot),
		);
		return { $ref: id };
	}

	if (value instanceof Map) {
		const record: Extract<SerializedRecord, { readonly type: 'map' }> = {
			id,
			type: 'map',
			entries: [],
		};
		records.push(record);
		let index = 0;
		for (const [key, item] of value) {
			const keySlot = encodeSlot(
				key,
				[...path, `mapKey:${index}`],
				seen,
				records,
				diagnostics,
			);
			const valueSlot = encodeSlot(
				item,
				[...path, `mapValue:${index}`],
				seen,
				records,
				diagnostics,
			);
			if (keySlot && valueSlot) {
				(record.entries as Array<readonly [SerializedSlot, SerializedSlot]>).push([
					keySlot,
					valueSlot,
				]);
			}
			index++;
		}
		return { $ref: id };
	}

	if (value instanceof Set) {
		const record: Extract<SerializedRecord, { readonly type: 'set' }> = {
			id,
			type: 'set',
			values: [],
		};
		records.push(record);
		let index = 0;
		for (const item of value) {
			const slot = encodeSlot(item, [...path, `set:${index}`], seen, records, diagnostics);
			if (slot) (record.values as SerializedSlot[]).push(slot);
			index++;
		}
		return { $ref: id };
	}

	const record: Extract<SerializedRecord, { readonly type: 'object' }> = {
		id,
		type: 'object',
		fields: [],
	};
	records.push(record);

	for (const [key, item] of Object.entries(value)) {
		const slot = encodeSlot(item, [...path, key], seen, records, diagnostics);
		if (slot) (record.fields as Array<readonly [string, SerializedSlot]>).push([key, slot]);
	}

	return { $ref: id };
}

function decodeSlot(slot: SerializedSlot, shells: ReadonlyMap<number, unknown>): unknown {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	) {
		return slot;
	}

	if ('$ref' in slot) return shells.get(slot.$ref);
	if (slot.$type === 'undefined') return undefined;
	if (slot.$type === 'bigint') return BigInt(slot.value);
	if (slot.$type === 'date') return new Date(slot.value);
	if (slot.$type === 'regexp') return new RegExp(slot.source, slot.flags);
	if (slot.$type === 'url') return new URL(slot.value);

	return undefined;
}

function typedArrayName(value: object): TypedArrayName | null {
	if (value instanceof Int8Array) return 'Int8Array';
	if (value instanceof Uint8Array) return 'Uint8Array';
	if (value instanceof Uint8ClampedArray) return 'Uint8ClampedArray';
	if (value instanceof Int16Array) return 'Int16Array';
	if (value instanceof Uint16Array) return 'Uint16Array';
	if (value instanceof Int32Array) return 'Int32Array';
	if (value instanceof Uint32Array) return 'Uint32Array';
	if (value instanceof Float32Array) return 'Float32Array';
	if (value instanceof Float64Array) return 'Float64Array';
	if (typeof BigInt64Array !== 'undefined' && value instanceof BigInt64Array) {
		return 'BigInt64Array';
	}
	if (typeof BigUint64Array !== 'undefined' && value instanceof BigUint64Array) {
		return 'BigUint64Array';
	}

	return null;
}

function encodeArrayBufferViewBuffer(
	value: object,
	path: ReadonlyArray<string>,
	seen: WeakMap<object, number>,
	records: SerializedRecord[],
	diagnostics: SerializationDiagnostic[],
): SerializedSlot {
	const buffer = (value as ArrayBufferView).buffer;
	if (!(buffer instanceof ArrayBuffer)) {
		diagnostics.push(unsupportedDiagnostic(buffer, [...path, 'buffer']));
		return null;
	}

	return encodeSlot(buffer, [...path, 'buffer'], seen, records, diagnostics) ?? null;
}

function typedArrayByteOffset(value: object): number {
	return (value as ArrayBufferView).byteOffset;
}

function typedArrayLength(value: object): number {
	return (value as ArrayBufferView & { readonly length: number }).length;
}

function createTypedArray(
	record: Extract<SerializedRecord, { readonly type: 'typed-array' }>,
	shells: ReadonlyMap<number, unknown>,
): unknown {
	const buffer = decodeSlot(record.buffer, shells);
	if (!(buffer instanceof ArrayBuffer)) return undefined;

	if (record.arrayType === 'Int8Array') {
		return new Int8Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint8Array') {
		return new Uint8Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint8ClampedArray') {
		return new Uint8ClampedArray(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Int16Array') {
		return new Int16Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint16Array') {
		return new Uint16Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Int32Array') {
		return new Int32Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint32Array') {
		return new Uint32Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Float32Array') {
		return new Float32Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Float64Array') {
		return new Float64Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'BigInt64Array') {
		return new BigInt64Array(buffer, record.byteOffset, record.length);
	}

	return new BigUint64Array(buffer, record.byteOffset, record.length);
}

function createDataView(
	record: Extract<SerializedRecord, { readonly type: 'data-view' }>,
	shells: ReadonlyMap<number, unknown>,
): unknown {
	const buffer = decodeSlot(record.buffer, shells);
	if (!(buffer instanceof ArrayBuffer)) return undefined;

	return new DataView(buffer, record.byteOffset, record.byteLength);
}

function unsupportedDiagnostic(
	value: unknown,
	path: ReadonlyArray<string>,
): SerializationDiagnostic {
	const valueKind = typeof value;

	return {
		code: 'MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
		severity: 'error',
		phase: 'serialization',
		title: 'Cannot serialize graph state value',
		path,
		statePath: formatPath(path),
		valueKind,
		message: `Cannot serialize value at ${formatPath(path)} because ${valueKind} values are not durable graph state.`,
		why: 'Serialization is for durable graph state. Functions and host/runtime resources cannot be restored during resume.',
		suggestions: [
			{
				message:
					'Move runtime resources into attach={...}, make the value serializable state, or derive it with computed().',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SERIALIZE_UNSUPPORTED_VALUE',
	};
}

function formatPath(path: ReadonlyArray<string>): string {
	return path.length === 0 ? '<root>' : path.join('.');
}

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

function isSerializedSlot(value: SerializedSlot | null): value is SerializedSlot {
	return value !== null;
}

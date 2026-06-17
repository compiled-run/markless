export type RuntimeSerializerDiagnostic = {
	readonly code: 'ARCADE_SERIALIZE_WEAK_COLLECTION' | 'ARCADE_SERIALIZE_SECRET_LEAK';
	readonly severity: 'error' | 'warning';
	readonly phase: 'serialization';
	readonly statePath: string;
	readonly message: string;
};

export type RuntimeSerializerReceipt = {
	readonly stage: 'serializer-roundtrip' | 'serializer-diagnostic';
	readonly inspectable: true;
	readonly summary: string;
	readonly details: Readonly<Record<string, unknown>>;
};

export type RuntimeSerializerArtifact<T> = {
	readonly roundTrip: T;
	readonly diagnostics: ReadonlyArray<RuntimeSerializerDiagnostic>;
	readonly receipts: ReadonlyArray<RuntimeSerializerReceipt>;
};

type CloneContext = {
	readonly seen: Map<object, unknown>;
	readonly diagnostics: RuntimeSerializerDiagnostic[];
};

export function roundTripRuntimeValueGraph<T>(value: T): RuntimeSerializerArtifact<T> {
	const diagnostics: RuntimeSerializerDiagnostic[] = [];
	const roundTrip = cloneValue(
		value,
		{
			seen: new Map(),
			diagnostics,
		},
		'',
	) as T;
	const receipts: RuntimeSerializerReceipt[] = [
		{
			stage: 'serializer-roundtrip',
			inspectable: true,
			summary: 'Runtime serializer POC round-tripped a value graph.',
			details: {
				diagnosticCount: diagnostics.length,
			},
		},
		...diagnostics.map((diagnostic) => ({
			stage: 'serializer-diagnostic' as const,
			inspectable: true as const,
			summary: 'Runtime serializer POC emitted a diagnostic.',
			details: diagnostic,
		})),
	];

	return {
		roundTrip,
		diagnostics,
		receipts,
	};
}

function cloneValue(value: unknown, context: CloneContext, statePath: string): unknown {
	if (typeof value === 'string') {
		if (looksSecret(value) || looksSecretPath(statePath)) {
			context.diagnostics.push({
				code: 'ARCADE_SERIALIZE_SECRET_LEAK',
				severity: 'warning',
				phase: 'serialization',
				statePath,
				message: 'Do not store durable secrets in resumable state.',
			});
		}

		return value;
	}

	if (
		value === null ||
		typeof value === 'undefined' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	) {
		return value;
	}

	if (typeof value !== 'object') {
		return value;
	}

	if (context.seen.has(value)) {
		return context.seen.get(value);
	}

	if (value instanceof WeakMap || value instanceof WeakSet) {
		context.diagnostics.push({
			code: 'ARCADE_SERIALIZE_WEAK_COLLECTION',
			severity: 'error',
			phase: 'serialization',
			statePath,
			message: 'Weak collections cannot be restored from durable resumable state.',
		});
		return undefined;
	}

	if (value instanceof Date) {
		const cloned = new Date(value.getTime());
		context.seen.set(value, cloned);
		return cloned;
	}

	if (value instanceof URL) {
		const cloned = new URL(value.href);
		context.seen.set(value, cloned);
		return cloned;
	}

	if (value instanceof RegExp) {
		const cloned = new RegExp(value.source, value.flags);
		context.seen.set(value, cloned);
		return cloned;
	}

	if (value instanceof ArrayBuffer) {
		const cloned = value.slice(0);
		context.seen.set(value, cloned);
		return cloned;
	}

	if (ArrayBuffer.isView(value)) {
		const cloned = cloneArrayBufferView(value);
		context.seen.set(value, cloned);
		return cloned;
	}

	if (value instanceof Map) {
		const cloned = new Map();
		context.seen.set(value, cloned);

		for (const [entryKey, entryValue] of value) {
			cloned.set(
				cloneValue(entryKey, context, `${statePath}.<key>`),
				cloneValue(entryValue, context, `${statePath}.${String(entryKey)}`),
			);
		}

		return cloned;
	}

	if (value instanceof Set) {
		const cloned = new Set();
		context.seen.set(value, cloned);

		for (const entry of value) {
			cloned.add(cloneValue(entry, context, `${statePath}.*`));
		}

		return cloned;
	}

	if (Array.isArray(value)) {
		const cloned: unknown[] = [];
		context.seen.set(value, cloned);

		for (let index = 0; index < value.length; index++) {
			cloned[index] = cloneValue(value[index], context, pathFor(statePath, String(index)));
		}

		return cloned;
	}

	const prototype = Object.getPrototypeOf(value);
	const cloned = Object.create(prototype ?? Object.prototype) as Record<string, unknown>;
	context.seen.set(value, cloned);

	for (const key of Object.keys(value)) {
		cloned[key] = cloneValue(
			(value as Record<string, unknown>)[key],
			context,
			pathFor(statePath, key),
		);
	}

	return cloned;
}

function cloneArrayBufferView(value: ArrayBufferView): ArrayBufferView {
	if (value instanceof DataView) {
		return new DataView(
			value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
		);
	}

	const constructor = value.constructor as {
		new (source: ArrayBufferView): ArrayBufferView;
	};
	return new constructor(value);
}

function pathFor(parent: string, key: string): string {
	return parent ? `${parent}.${key}` : key;
}

function looksSecret(value: string): boolean {
	return /^(sk|pk)_(live|test)_/.test(value) || /secret|token/i.test(value);
}

function looksSecretPath(statePath: string): boolean {
	return /secret|token|password|credential/i.test(statePath);
}

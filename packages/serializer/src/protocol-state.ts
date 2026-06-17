import { ASYNC_PROTOCOL_VERSION, type ProtocolStatePayload } from '@arcadejs/protocol';
import {
	serializeGraphValue,
	type SerializedGraphPayload,
	type SerializationDiagnostic,
} from './value.ts';

export type ProtocolAsyncComputedSnapshotInput =
	| {
			readonly status: 'idle';
			readonly version: 0;
	  }
	| {
			readonly status: 'pending';
			readonly version: number;
			readonly key: unknown;
	  }
	| {
			readonly status: 'fulfilled';
			readonly version: number;
			readonly key: unknown;
			readonly value: unknown;
	  }
	| {
			readonly status: 'rejected';
			readonly version: number;
			readonly key: unknown;
			readonly error: unknown;
	  };

export type ProtocolStatePayloadInput = {
	readonly cells: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly name: string;
		readonly valueKind: 'scalar' | 'object' | 'array' | 'unknown';
		readonly value: unknown;
	}>;
	readonly computed?: ReadonlyArray<
		Omit<ProtocolStatePayload['computed'][number], 'snapshot'> & {
			readonly snapshot?: ProtocolAsyncComputedSnapshotInput;
		}
	>;
	readonly sharedDefinitions?: ProtocolStatePayload['sharedDefinitions'];
};

export type ProtocolStateSerializationDiagnostic = SerializationDiagnostic & {
	readonly graphNodeId: string;
	readonly cellName: string;
};

export class ProtocolStateSerializationError
	extends Error
	implements ProtocolStateSerializationDiagnostic
{
	readonly code: SerializationDiagnostic['code'];
	readonly severity: SerializationDiagnostic['severity'];
	readonly phase: SerializationDiagnostic['phase'];
	readonly title: SerializationDiagnostic['title'];
	readonly path: SerializationDiagnostic['path'];
	readonly statePath: SerializationDiagnostic['statePath'];
	readonly valueKind: SerializationDiagnostic['valueKind'];
	readonly why: SerializationDiagnostic['why'];
	readonly suggestions: SerializationDiagnostic['suggestions'];
	readonly docsUrl: SerializationDiagnostic['docsUrl'];
	readonly graphNodeId: string;
	readonly cellName: string;

	constructor(diagnostic: ProtocolStateSerializationDiagnostic) {
		super(diagnostic.message);
		this.name = 'ProtocolStateSerializationError';
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.path = diagnostic.path;
		this.statePath = diagnostic.statePath;
		this.valueKind = diagnostic.valueKind;
		this.why = diagnostic.why;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
		this.graphNodeId = diagnostic.graphNodeId;
		this.cellName = diagnostic.cellName;
	}
}

export function createProtocolStatePayload(input: ProtocolStatePayloadInput): ProtocolStatePayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		cells: input.cells.map((cell) => {
			const result = serializeGraphValue(cell.value);
			if (!result.ok) {
				throw protocolStateSerializationError(cell, result.diagnostics[0]);
			}

			return {
				graphNodeId: cell.graphNodeId,
				name: cell.name,
				valueKind: cell.valueKind,
				value: result.payload,
			};
		}),
		computed: (input.computed ?? []).map(serializeComputedSnapshot),
		sharedDefinitions: input.sharedDefinitions,
	};
}

function serializeComputedSnapshot(
	computed: NonNullable<ProtocolStatePayloadInput['computed']>[number],
): ProtocolStatePayload['computed'][number] {
	if (!computed.snapshot) return computed;
	if (computed.snapshot.status === 'idle')
		return computed as ProtocolStatePayload['computed'][number];

	const key = serializeProtocolStateField(computed, 'key', computed.snapshot.key);
	if (computed.snapshot.status === 'pending') {
		return {
			...computed,
			snapshot: {
				status: computed.snapshot.status,
				version: computed.snapshot.version,
				key,
			},
		};
	}

	if (computed.snapshot.status === 'fulfilled') {
		return {
			...computed,
			snapshot: {
				status: computed.snapshot.status,
				version: computed.snapshot.version,
				key,
				value: serializeProtocolStateField(computed, 'value', computed.snapshot.value),
			},
		};
	}

	return {
		...computed,
		snapshot: {
			status: computed.snapshot.status,
			version: computed.snapshot.version,
			key,
			error: serializeProtocolStateField(computed, 'error', computed.snapshot.error),
		},
	};
}

function serializeProtocolStateField(
	computed: NonNullable<ProtocolStatePayloadInput['computed']>[number],
	field: string,
	value: unknown,
): SerializedGraphPayload {
	const result = serializeGraphValue(value);
	if (!result.ok) {
		throw protocolStateSerializationError(
			{
				graphNodeId: computed.graphNodeId,
				name: `${computed.name}.snapshot.${field}`,
				valueKind: 'unknown',
				value,
			},
			result.diagnostics[0],
		);
	}

	return result.payload;
}

function protocolStateSerializationError(
	cell: ProtocolStatePayloadInput['cells'][number],
	diagnostic: SerializationDiagnostic | undefined,
): ProtocolStateSerializationError {
	const cellPrefix = cell.name === '' ? cell.graphNodeId : cell.name;
	const base = diagnostic ?? {
		code: 'ARCADE_SERIALIZE_UNSUPPORTED_VALUE' as const,
		severity: 'error' as const,
		phase: 'serialization' as const,
		title: 'Cannot serialize graph state value' as const,
		path: [],
		statePath: cellPrefix,
		valueKind: 'unknown',
		message: `Cannot serialize value at ${cellPrefix} because unknown values are not durable graph state.`,
		why: 'Serialization is for durable graph state. Functions and host/runtime resources cannot be restored during resume.',
		suggestions: [
			{
				message:
					'Move runtime resources into attach={...}, make the value serializable state, or derive it with computed().',
			},
		],
		docsUrl: 'https://arcadejs.com/errors/ARCADE_SERIALIZE_UNSUPPORTED_VALUE',
	};
	const statePath = base.statePath === '<root>' ? cellPrefix : `${cellPrefix}.${base.statePath}`;

	return new ProtocolStateSerializationError({
		...base,
		graphNodeId: cell.graphNodeId,
		cellName: cell.name,
		statePath,
		message: `Cannot serialize value at ${statePath} because ${base.valueKind} values are not durable graph state.`,
	});
}

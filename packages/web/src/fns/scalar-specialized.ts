import { marklessUpdateText } from './update-text.ts';
import { marklessWriteScalar } from './write-scalar.ts';

type ScalarGraph = {
	hasCell(graphNodeId: string): boolean;
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
	write(write: { readonly graphNodeId: string; readonly path?: ReadonlyArray<string>; readonly value: unknown }): void;
	update(update: { readonly graphNodeId: string; readonly path?: ReadonlyArray<string>; readonly returnValue?: 'previous' | 'next'; readonly update: (value: unknown) => unknown }): unknown;
	call(): never;
	flush(): Promise<void>;
};

export type ScalarSpecializedState = {
	value: unknown;
	dirty: boolean;
	readonly graph: ScalarGraph;
};

export function marklessFindElementAtDomOrderIndex(root: { readonly nodeType: number; readonly childNodes?: ArrayLike<unknown> }, expectedIndex: number, tagName: string): any {
	let index = 0, found: any;
	const visit = (node: { readonly nodeType: number; readonly childNodes?: ArrayLike<unknown> }) => {
		if (found) return;
		if (node.nodeType === 1) {
			if (index === expectedIndex) found = node;
			index++;
		}
		for (const child of Array.from(node.childNodes ?? [])) visit(child as never);
	};
	visit(root);
	return found && (tagName === '*' || found.tagName.toLowerCase() === tagName.toLowerCase()) ? found : undefined;
}

export function marklessCreateScalarSpecializedState(graphNodeId: string, value: unknown): ScalarSpecializedState {
	const state = { value, dirty: false } as ScalarSpecializedState;
	const graph: ScalarGraph = {
		hasCell(candidate) { return candidate === graphNodeId; },
		read(candidate, path = []) {
			if (candidate !== graphNodeId || path.length) return marklessScalarSpecializedEscalate('read');
			return state.value;
		},
		write(write) {
			if (write.graphNodeId !== graphNodeId || (write.path?.length ?? 0)) return marklessScalarSpecializedEscalate('write');
			if (Object.is(state.value, write.value)) return;
			state.value = write.value;
			state.dirty = true;
		},
		update(update) {
			if (update.graphNodeId !== graphNodeId || (update.path?.length ?? 0)) return marklessScalarSpecializedEscalate('update');
			const previous = state.value;
			const next = update.update(previous);
			if (!Object.is(previous, next)) {
				state.value = next;
				state.dirty = true;
			}
			return update.returnValue === 'previous' ? previous : update.returnValue === 'next' ? next : undefined;
		},
		call() { return marklessScalarSpecializedEscalate('call'); },
		async flush() {},
	};
	return Object.assign(state, { graph });
}

export function marklessScalarSpecializedIncrement(graph: ScalarGraph, graphNodeId: string, delta: 1 | -1): unknown {
	return marklessWriteScalar({ graph }, {
		graphNodeId,
		returnValue: 'next',
		update(value) { return Number(value) + delta; },
	});
}

export function marklessScalarSpecializedAssign(graph: ScalarGraph, graphNodeId: string, value: unknown): unknown {
	return marklessWriteScalar({ graph }, { graphNodeId, value });
}

export function marklessScalarSpecializedTextValue(hostNodeId: string, value: unknown): unknown {
	return marklessUpdateText({ domUpdate: { hostNodeId }, value }, hostNodeId).value;
}

export function marklessScalarSpecializedShadowGraph(graph: ScalarGraph): ScalarGraph {
	return {
		...graph,
		write() {},
		update(update) {
			const value = graph.read(update.graphNodeId, update.path ?? []);
			return update.returnValue === 'previous' || update.returnValue === 'next' ? value : undefined;
		},
	};
}

export function marklessScalarSlotText(value: unknown): string {
	return value == null ? '' : String(value);
}

export function marklessDecodeScalarSlot(slot: any): unknown {
	if (slot === null || typeof slot === 'string' || typeof slot === 'number' || typeof slot === 'boolean') return slot;
	if (slot?.$type === 'undefined') return undefined;
	if (slot?.$type === 'bigint') return BigInt(slot.value);
	return new Date(slot.value);
}

export function marklessAssertScalarCell(cell: any, graphNodeId: string, site: string): void {
	if (!cell || cell.graphNodeId !== graphNodeId || cell.valueKind !== 'scalar') throw marklessScalarPayloadInvalid(`Invalid ${site}: expected scalar cell.`, site);
	const value = cell.value;
	if (!value || value.version !== 1 || !Array.isArray(value.records) || value.records.length !== 0) throw marklessScalarPayloadInvalid(`Invalid ${site}.value: expected scalar value payload.`, `${site}.value`);
	const slot = value.root;
	if (slot === null || typeof slot === 'string' || typeof slot === 'number' || typeof slot === 'boolean') return;
	if (!slot || typeof slot !== 'object') throw marklessScalarPayloadInvalid(`Invalid ${site}.value.root: expected serialized scalar slot.`, `${site}.value.root`);
	if (slot.$type === 'undefined') return;
	if (slot.$type === 'bigint' && typeof slot.value === 'string') {
		try {
			BigInt(slot.value);
			return;
		} catch {}
	}
	if (slot.$type === 'date' && typeof slot.value === 'string' && !Number.isNaN(new Date(slot.value).getTime())) return;
	throw marklessScalarPayloadInvalid(`Invalid ${site}.value.root: expected serialized scalar slot.`, `${site}.value.root`);
}

export function marklessScalarSpecializedHostMiss(_input: unknown, site: string): never {
	throw Object.assign(new Error('MARKLESS_SCALAR_SPECIALIZED_HOST_MISS'), { code: 'MARKLESS_SCALAR_SPECIALIZED_HOST_MISS', site });
}

export function marklessScalarSpecializedEscalate(site: string): never {
	throw Object.assign(new Error('MARKLESS_SCALAR_SPECIALIZED_ESCALATE'), { code: 'MARKLESS_SCALAR_SPECIALIZED_ESCALATE', site });
}

export function marklessResolve<T>(value: T | Promise<T>): Promise<T> {
	return value && (typeof value === 'object' || typeof value === 'function') && typeof (value as { readonly then?: unknown }).then === 'function'
		? value as Promise<T>
		: Promise.resolve(value);
}

function marklessScalarPayloadInvalid(message: string, site: string): Error {
	return Object.assign(new Error(message), { code: 'MARKLESS_PAYLOAD_INVALID', severity: 'error', phase: 'payload', title: 'Invalid resumability payload', message, why: 'The markless/state payload did not match the resumability protocol shape required by this runtime.', payloadType: 'markless/state', payloadScript: 'script[type="markless/state"]', suggestions: [{ message: 'Regenerate the markless/state payload with the matching markless compiler/runtime version.' }], docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID', site });
}

import { marklessUpdateText } from './update-text.ts';

export function marklessCreateScalarCoreGraph(plan, elementsByHostId, _loadSymbol) {
	const values = new Map(plan.cells.map((cell) => [cell.graphNodeId, marklessDecodeScalarSlot(cell.value?.root)]));
	const dirty: string[] = [];
	const graph = {
		read(graphNodeId) {
			return values.get(graphNodeId);
		},
		write(write) {
			if ((write.path?.length ?? 0) > 0) return marklessScalarCoreError('write-path');
			if (Object.is(values.get(write.graphNodeId), write.value)) return;
			values.set(write.graphNodeId, write.value);
			dirty.push(write.graphNodeId);
		},
		update(update) {
			if ((update.path?.length ?? 0) > 0) return marklessScalarCoreError('update-path');
			const previous = values.get(update.graphNodeId);
			const next = update.update(previous);
			if (!Object.is(previous, next)) {
				values.set(update.graphNodeId, next);
				dirty.push(update.graphNodeId);
			}
			return update.returnValue === 'previous' ? previous : update.returnValue === 'next' ? next : undefined;
		},
		call() {
			return marklessScalarCoreError('graph-call');
		},
		async flush() {
			while (dirty.length > 0) {
				const pending = dirty.splice(0);
				for (const update of plan.domUpdates) {
					if (!pending.includes(update.graphNodeId) || !update.symbolId) continue;
					const element = elementsByHostId.get(update.hostNodeId);
					if (!element) continue;
					const result = marklessUpdateText({
						domUpdate: update,
						value: values.get(update.graphNodeId),
					}, update.hostNodeId);
					marklessApplySetText(result, elementsByHostId);
				}
			}
		},
	};
	return graph;
}

function marklessDecodeScalarSlot(slot) {
	if (slot === null || typeof slot === 'string' || typeof slot === 'number' || typeof slot === 'boolean') return slot;
	if (slot?.$type === 'undefined') return undefined;
	if (slot?.$type === 'bigint') return BigInt(slot.value);
	if (slot?.$type === 'date') return new Date(slot.value);
	return undefined;
}

function marklessScalarCoreError(site: string): never {
	throw Object.assign(new Error('MARKLESS_SCALAR_LEAN_ESCALATE'), {
		code: 'MARKLESS_SCALAR_LEAN_ESCALATE',
		site,
	});
}

function marklessApplySetText(result, elementsByHostId): void {
	if (!result || typeof result === 'function') return;
	const entries = Array.isArray(result) ? result : [result];
	for (const entry of entries) {
		if (entry.type !== 'setText') throw marklessScalarCoreError('journal-type');
		const target = elementsByHostId.get(entry.locator);
		if (target) target.textContent = entry.value == null ? '' : String(entry.value);
	}
}

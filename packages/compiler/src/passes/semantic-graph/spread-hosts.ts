import type {
	ModuleGraphInterfaceSpreadHost,
	SemanticMarkupChunk,
} from '../../artifacts.ts';

/**
 * The elements of one component's markup that spread the component's own props,
 * reported on the module-graph interface so a parent can join them against the
 * props it passes. The slot says what the spread can never carry; the host at
 * the same coordinate says which element it lands on.
 */
export function spreadHostsField(
	chunks: ReadonlyArray<SemanticMarkupChunk>,
): { readonly spreadHosts?: ReadonlyArray<ModuleGraphInterfaceSpreadHost> } {
	const spreadHosts = chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => {
			if (slot.kind !== 'spread-attributes') return [];
			const host = chunk.hosts.find(
				(candidate) =>
					candidate.coordinate.kind === slot.coordinate.kind &&
					samePath(candidate.coordinate.path, slot.coordinate.path),
			);
			return host
				? [
						{
							hostNodeId: host.hostNodeId,
							excludeNames: slot.excludeNames,
							destructuredNames: slot.destructuredNames ?? [],
						},
					]
				: [];
		}),
	);
	return spreadHosts.length > 0 ? { spreadHosts } : {};
}

function samePath(left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean {
	return left.length === right.length && left.every((step, index) => step === right[index]);
}

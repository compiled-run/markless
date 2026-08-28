import {
	protocolElementHandleReadId,
	type ProtocolBranchIdrefSite,
} from '@markless/serializer/protocol';
import type { SsrDataChunk } from './renderer.ts';

/**
 * The two fields a served branch record carries when its arms bind an element()
 * handle an IDREF names: the ids THIS render minted, and the positions outside
 * the arms that name them.
 *
 * A minted id is the rendered widget's instance token plus the handle, and that
 * token is a seed-map value no flip can reach — so the render that served the
 * arm has to resolve the id and file it. The served twin resolves the same two
 * fields while emitting `marklessSsrBranches.push`; this is the browser side of
 * the same answer, read off the same chunk data.
 *
 * Both stay absent for a branch whose arms bind no such handle, which is what
 * keeps every other page's records byte-identical.
 */
export type BranchArmIdrefResolution = {
	readonly elementHandleIds?: Readonly<Record<string, string>>;
	readonly idrefSites?: ReadonlyArray<ProtocolBranchIdrefSite>;
};

/** Every handle this branch's arms bind, against the arm that binds it. */
function armMintedHandles(
	chunks: ReadonlyArray<SsrDataChunk>,
	armChunkIds: ReadonlyArray<string>,
): ReadonlyMap<string, number> {
	const handles = new Map<string, number>();
	for (const [armIndex, chunkId] of armChunkIds.entries())
		for (const slot of chunks.find((candidate) => candidate.id === chunkId)?.slots ?? [])
			if (
				slot.kind === 'attribute' &&
				slot.residue.kind === 'element-handle-id' &&
				slot.residue.idref !== true &&
				!handles.has(slot.residue.handleGraphNodeId)
			)
				handles.set(slot.residue.handleGraphNodeId, armIndex);
	return handles;
}

export function branchArmIdrefResolution(
	chunks: ReadonlyArray<SsrDataChunk>,
	armChunkIds: ReadonlyArray<string>,
	idPrefix: string,
	mint: (handleGraphNodeId: string) => unknown,
): BranchArmIdrefResolution {
	const handles = armMintedHandles(chunks, armChunkIds);
	if (handles.size === 0) return {};
	const sites: Array<ProtocolBranchIdrefSite> = [];
	for (const chunk of chunks)
		for (const slot of chunk.slots) {
			if (slot.kind !== 'attribute' || slot.residue.kind !== 'element-handle-id') continue;
			if (slot.residue.idref !== true) continue;
			const armIndex = handles.get(slot.residue.handleGraphNodeId);
			if (armIndex === undefined) continue;
			// An attribute slot's coordinate is its host's own position, so the host
			// it sits on is the one at the same path in the same chunk.
			const path = slot.coordinate.path.join('.');
			const host = chunk.hosts.find((candidate) => candidate.coordinate.path.join('.') === path);
			if (host)
				sites.push({
					hostNodeId: idPrefix + host.hostNodeId,
					attributeName: slot.name,
					handleReadId: protocolElementHandleReadId(slot.residue.handleGraphNodeId),
					armIndex,
				});
		}
	if (sites.length === 0) return {};
	const elementHandleIds: Record<string, string> = {};
	for (const handle of handles.keys()) {
		const id = mint(handle);
		if (typeof id === 'string') elementHandleIds[protocolElementHandleReadId(handle)] = id;
	}
	return { elementHandleIds, idrefSites: sites };
}

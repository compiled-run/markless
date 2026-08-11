import type { ProtocolViewPayload } from '@markless/serializer';
import type { RenderDataArtifact } from '../../artifacts.ts';

// Keeps the direct browser module data-only: native markup comes from renderData
// chunks, while the temporary repeat patch details retain the proven T009a plan
// residue until the standard CSR swap owns that shared migration.
export function directChunkBootstrapData(input: {
	readonly renderData: RenderDataArtifact;
	readonly protocolView: ProtocolViewPayload;
}) {
	const rootChunkId = input.renderData.root?.templateId;
	if (!rootChunkId) return null;
	const repeatChunkIds = new Set(
		input.renderData.repeats.flatMap((repeat) =>
			repeat.emptyChunkId
				? [repeat.rowChunkId, repeat.emptyChunkId]
				: [repeat.rowChunkId],
		),
	);
	const chunks = input.renderData.chunks
		.filter((chunk) => chunk.id === rootChunkId || repeatChunkIds.has(chunk.id))
		.map((chunk) => ({
			id: chunk.id,
			statics: chunk.statics,
			slots: chunk.slots,
		}));
	const repeatData = new Map(input.renderData.repeats.map((repeat) => [repeat.repeatId, repeat]));

	return {
		rootChunkId,
		chunks,
		events: input.renderData.interactions.flatMap((interaction) => {
			const host = input.renderData.chunks
				.find((chunk) => chunk.id === rootChunkId)
				?.hosts.find((candidate) => candidate.hostNodeId === interaction.hostNodeId);
			if (!host) return [];
			return [{
				eventName: interaction.eventName,
				hostNodeId: interaction.hostNodeId,
				hostPath: host.coordinate.path[0] === 0
					? host.coordinate.path.slice(1)
					: host.coordinate.path,
				symbolIds: interaction.symbolIds,
			}];
		}),
		repeats: input.renderData.repeats.flatMap((repeat) => {
			const chunk = repeatData.get(repeat.repeatId);
			if (!chunk || !repeat.parentPath || !repeat.collectionGraphNodeId) return [];
			return {
				repeatId: repeat.repeatId,
				parentPath: repeat.parentPath,
				itemName: repeat.itemName,
				collectionGraphNodeId: repeat.collectionGraphNodeId,
				collectionPath: repeat.collectionPath,
				keyPath: repeat.keyPath,
				rowChunkId: chunk.rowChunkId,
				...(chunk.emptyChunkId ? { emptyChunkId: chunk.emptyChunkId } : {}),
				classWrites: repeat.classWrites ?? [],
				eventControls: repeat.eventControls ?? [],
				...(repeat.rowElementHandles ? { rowElementHandles: repeat.rowElementHandles } : {}),
				...(repeat.rowBehaviors ? { rowBehaviors: repeat.rowBehaviors } : {}),
			};
		}),
	};
}

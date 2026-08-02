import type { PublicRenderPlanArtifact, RenderDataArtifact } from '../../artifacts.ts';

// Keeps the direct browser module data-only: native markup comes from renderData
// chunks, while the temporary repeat patch details retain the proven T009a plan
// residue until the standard CSR swap owns that shared migration.
export function directChunkBootstrapData(input: {
	readonly renderData: RenderDataArtifact;
	readonly publicRenderPlan: PublicRenderPlanArtifact;
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
		events: input.publicRenderPlan.staticEventControls,
		repeats: input.publicRenderPlan.keyedRepeats.map((repeat) => {
			const chunk = repeatData.get(repeat.repeatId);
			if (!chunk) throw new Error(`Missing renderData repeat ${repeat.repeatId}.`);
			return {
				repeatId: repeat.repeatId,
				parentPath: repeat.parentPath,
				itemName: repeat.itemName,
				collectionGraphNodeId: repeat.collectionGraphNodeId,
				collectionPath: repeat.collectionPath,
				keyPath: repeat.keyPath,
				rowChunkId: chunk.rowChunkId,
				...(chunk.emptyChunkId ? { emptyChunkId: chunk.emptyChunkId } : {}),
				classWrites: repeat.classWrites,
				eventControls: repeat.eventControls,
				...(repeat.rowElementHandles
					? { rowElementHandles: repeat.rowElementHandles }
					: {}),
				...(repeat.rowBehaviors ? { rowBehaviors: repeat.rowBehaviors } : {}),
			};
		}),
	};
}

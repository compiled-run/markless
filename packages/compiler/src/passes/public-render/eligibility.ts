import type { PublicRenderModuleInput, RenderDataArtifact } from '../../artifacts.ts';

type ProtocolState = PublicRenderModuleInput['protocolState'];
type ProtocolView = PublicRenderModuleInput['protocolView'];

export function canEmitPublicRenderModule(renderData: RenderDataArtifact): boolean {
	if (!renderData.root) return false;
	const root = renderData.chunks.find((chunk) => chunk.id === renderData.root?.templateId);
	if (!root) return false;
	const directChunkIds = new Set([
		root.id,
		...renderData.repeats.flatMap((repeat) => [
			repeat.rowChunkId,
			...(repeat.emptyChunkId ? [repeat.emptyChunkId] : []),
		]),
	]);
	const rootHosts = root.hosts.map((host) => host.coordinate.path[0] === 0 ? host.coordinate.path.slice(1) : host.coordinate.path);
	const repeatsSupported = renderData.repeats.every((repeat) => {
		if (!repeat.directSupported || repeat.collectionGraphNodeId === undefined || !repeat.parentPath) return false;
		return !rootHosts.some((path) =>
			path.length > repeat.parentPath!.length &&
			repeat.parentPath!.every((segment, index) => path[index] === segment),
		);
	});
	return repeatsSupported &&
		renderData.chunks
			.filter((chunk) => directChunkIds.has(chunk.id))
			.every((chunk) => chunk.slots.every((slot) => {
				if (slot.kind === 'repeat') return true;
				if (slot.kind === 'attribute' && slot.name === 'class') {
					return slot.directClassMatch !== undefined;
				}
				if (slot.kind !== 'text') return false;
				return slot.residue.kind !== 'authored-expression';
			}));
}

export function canUseDirectPublicRuntime(
	protocolState: ProtocolState,
	publicView: ProtocolView,
): boolean {
	if ((protocolState.sharedDefinitions?.length ?? 0) > 0) return false;
	if (protocolState.computed.length > 0) return false;
	if (publicView.domUpdates.length > 0) return false;
	if (publicView.behaviors.length > 0) return false;
	if (publicView.elementHandles.length > 0) return false;
	if (publicView.asyncBoundaries.length > 0) return false;
	return publicView.events.every((event) => !event.syncPolicy);
}

import type { PublicRenderModuleInput, RenderDataArtifact } from '../../artifacts.ts';

type ProtocolView = PublicRenderModuleInput['protocolView'];

export function createPublicProtocolView(
	protocolView: ProtocolView,
	renderData: RenderDataArtifact,
): ProtocolView {
	const rootChunk = renderData.chunks.find((chunk) => chunk.id === renderData.root?.templateId);
	const hostNodeIds = new Set((rootChunk?.hosts ?? []).map((host) => host.hostNodeId));
	const hostNodeIndexes = new Map(
		[...(rootChunk?.hosts ?? [])].map((host, index) => [host.hostNodeId, index]),
	);

	return {
		...protocolView,
		locators: protocolView.locators
			.filter((locator) => hostNodeIds.has(locator.hostNodeId))
			.map((locator) => ({
				...locator,
				index: hostNodeIndexes.get(locator.hostNodeId) ?? locator.index,
			})),
		events: protocolView.events.filter((event) => hostNodeIds.has(event.hostNodeId)),
		domUpdates: protocolView.domUpdates.filter(
			(update) => hostNodeIds.has(update.hostNodeId) && update.target?.kind !== 'text',
		),
	};
}

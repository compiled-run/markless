import type { PublicRenderModuleInput, PublicRenderPlanArtifact } from '../../artifacts.ts';
import { samePath } from './source-expressions.ts';

type ProtocolView = PublicRenderModuleInput['protocolView'];

export function createPublicProtocolView(
	protocolView: ProtocolView,
	publicRenderPlan: PublicRenderPlanArtifact,
): ProtocolView {
	const hostNodeIds = new Set(publicRenderPlan.staticHostNodeIds);
	const hostNodeIndexes = new Map(
		publicRenderPlan.staticHostNodeIds.map((hostNodeId, index) => [hostNodeId, index]),
	);
	const handledStaticTextUpdates = publicRenderPlan.staticTextWrites.map((write) => ({
		graphNodeId: write.graphNodeId,
		path: write.path,
		source: write.source,
	}));

	return {
		...protocolView,
		locators: protocolView.locators
			.filter((locator) => hostNodeIds.has(locator.hostNodeId))
			.map((locator) => ({
				...locator,
				index: hostNodeIndexes.get(locator.hostNodeId) ?? locator.index,
			})),
		events: protocolView.events.filter((event) => hostNodeIds.has(event.hostNodeId)),
		domUpdates: protocolView.domUpdates.filter((update) => {
			if (!hostNodeIds.has(update.hostNodeId)) return false;
			if (update.target?.kind !== 'text') return true;
			return !handledStaticTextUpdates.some(
				(write) =>
					write.graphNodeId === update.graphNodeId &&
					write.source === update.source &&
					samePath(write.path, update.path),
			);
		}),
	};
}

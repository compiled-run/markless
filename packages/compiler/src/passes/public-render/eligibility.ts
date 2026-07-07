import type { PublicRenderModuleInput, PublicRenderPlanArtifact } from '../../artifacts.ts';

type ProtocolState = PublicRenderModuleInput['protocolState'];
type ProtocolView = PublicRenderModuleInput['protocolView'];

export function canEmitPublicRenderModule(publicRenderPlan: PublicRenderPlanArtifact): boolean {
	// Arm-scoped repeats render via in-scope SSR/CSR arm mapping and carry no
	// top-level planned record by design.
	const planNeeded = publicRenderPlan.repeatGates.filter(
		(gate) => !(gate.supported && gate.armScoped === true),
	);
	return (
		(!publicRenderPlan.repeatGates.some((gate) => !gate.supported) &&
			publicRenderPlan.keyedRepeats.length === planNeeded.length) ||
		publicRenderPlan.repeatGates.length === 0
	);
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

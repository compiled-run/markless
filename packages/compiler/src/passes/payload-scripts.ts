import { renderPayloadScripts } from '@arcade/serializer';
import type { PayloadScriptsArtifact, PayloadScriptsInput } from '../artifacts.ts';

export function renderPayloadScriptArtifact(input: PayloadScriptsInput): PayloadScriptsArtifact {
	const payloadScripts = renderPayloadScripts({
		state: input.protocolState,
		view: input.protocolView,
	});

	return {
		payloadScripts,
		renderShell: `${payloadScripts.stateScript}${payloadScripts.viewScript}`,
	};
}

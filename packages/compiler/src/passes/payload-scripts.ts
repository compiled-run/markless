import { renderPayloadScripts } from '@arcade/serializer';
import type { PayloadScriptsArtifact, PayloadScriptsInput } from '../artifacts.ts';

export function renderPayloadScriptArtifact(input: PayloadScriptsInput): PayloadScriptsArtifact {
	return {
		payloadScripts: renderPayloadScripts({
			state: input.protocolState,
			view: input.protocolView,
		}),
	};
}

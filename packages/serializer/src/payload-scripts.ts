import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';
import type { RuntimePayloadType } from './protocol-client.ts';

export type RenderPayloadScriptsInput = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type RenderedPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly stateScript: string;
	readonly viewScript: string;
};

/** How a payload's record lists are written; a served page passes encodeProtocolPayloadLists. */
export type PayloadListEncoder = <T extends object>(type: RuntimePayloadType, payload: T) => T;

export function renderPayloadScripts(
	input: RenderPayloadScriptsInput,
	encodeLists?: PayloadListEncoder,
): RenderedPayloadScripts {
	return {
		state: input.state,
		view: input.view,
		stateScript: renderDataScript('markless/state', input.state, encodeLists),
		viewScript: renderDataScript('markless/view', input.view, encodeLists),
	};
}

function renderDataScript(
	type: RuntimePayloadType,
	payload: object,
	encodeLists: PayloadListEncoder | undefined,
): string {
	const served = encodeLists ? encodeLists(type, payload) : payload;
	return `<script type="${type}">${escapeScriptJson(JSON.stringify(served))}</script>`;
}

// Only `</` and `<!` can end or escape a script's raw text; any other `<` is inert there.
export function escapeScriptJson(value: string): string {
	return value.replace(/<(?=[/!])/g, '\\u003C');
}

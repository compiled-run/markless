import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';
import {
	MARKLESS_STATE_SCRIPT_TYPE,
	MARKLESS_VIEW_SCRIPT_TYPE,
	type MarklessPayloadScriptType,
} from './protocol-constants.ts';

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

export function renderPayloadScripts(input: RenderPayloadScriptsInput): RenderedPayloadScripts {
	return {
		state: input.state,
		view: input.view,
		stateScript: renderDataScript(MARKLESS_STATE_SCRIPT_TYPE, input.state),
		viewScript: renderDataScript(MARKLESS_VIEW_SCRIPT_TYPE, input.view),
	};
}

function renderDataScript(type: MarklessPayloadScriptType, payload: unknown): string {
	return `<script type="${type}">${escapeScriptJson(JSON.stringify(payload))}</script>`;
}

function escapeScriptJson(value: string): string {
	return value.replace(/</g, '\\u003C');
}

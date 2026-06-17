import type { ProtocolStatePayload, ProtocolViewPayload } from '@arcade/protocol';

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
		stateScript: renderDataScript('arcade/state', input.state),
		viewScript: renderDataScript('arcade/view', input.view),
	};
}

function renderDataScript(type: 'arcade/state' | 'arcade/view', payload: unknown): string {
	return `<script type="${type}">${escapeScriptJson(JSON.stringify(payload))}</script>`;
}

function escapeScriptJson(value: string): string {
	return value.replace(/</g, '\\u003C');
}

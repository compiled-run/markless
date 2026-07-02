import type { ProtocolStatePayload, ProtocolViewPayload } from './protocol.ts';

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
		stateScript: renderDataScript('markless/state', input.state),
		viewScript: renderDataScript('markless/view', input.view),
	};
}

function renderDataScript(type: 'markless/state' | 'markless/view', payload: unknown): string {
	return `<script type="${type}">${escapeScriptJson(JSON.stringify(payload))}</script>`;
}

function escapeScriptJson(value: string): string {
	return value.replace(/</g, '\\u003C');
}

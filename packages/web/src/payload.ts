import {
	RuntimePayloadError,
	decodePayloadScripts,
	payloadInvalidError,
	payloadScriptSelector,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
} from '../../serializer/src/protocol-client.ts';
import {
	MARKLESS_STATE_SCRIPT_TYPE,
	MARKLESS_VIEW_SCRIPT_TYPE,
} from '../../serializer/src/protocol-constants.ts';
import type {
	ResumePayloadDocumentInput,
	ResumePayloadScriptsInput,
	ResumePayloadScriptsResult,
} from './payload-full.ts';

export {
	RuntimePayloadError,
	decodePayloadScripts,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type RuntimePayloadDiagnostic,
	type RuntimePayloadErrorCode,
	type RuntimePayloadType,
};

export type PayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type PayloadScriptDocument = {
	readonly querySelector: (selector: string) => PayloadScriptElement | null;
};

export function readPayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): EncodedPayloadScripts {
	return {
		stateScript: readPayloadScriptFromDocument(document, MARKLESS_STATE_SCRIPT_TYPE),
		viewScript: readPayloadScriptFromDocument(document, MARKLESS_VIEW_SCRIPT_TYPE),
	};
}

export function decodePayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): DecodedPayloadScripts {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const full = await import('./payload-full.ts');
	return full.resumeFromPayloadScripts(input);
}

export async function resumeFromPayloadDocument(
	input: ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	const full = await import('./payload-full.ts');
	return full.resumeFromPayloadDocument(input);
}

function readPayloadScriptFromDocument(
	document: PayloadScriptDocument,
	type: RuntimePayloadType,
): string {
	const selector = payloadScriptSelector(type);
	const element = document.querySelector(selector);
	if (!element) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script.`,
			`Browser resume requires the ${selector} script to exist before decoding.`,
			[{ message: `Include a ${selector} script in the rendered document.` }],
		);
	}

	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script content.`,
			`Browser resume found ${selector}, but it did not expose text content.`,
			[{ message: `Render JSON payload content inside ${selector}.` }],
		);
	}

	return `<script type="${type}">${text}</script>`;
}

import {
	decodePayloadScripts,
	payloadInvalidError,
	payloadScriptSelector,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type RuntimePayloadType,
} from '../../../serializer/src/protocol-validation.ts';

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
		stateScript: readPayloadScriptFromDocument(document, 'markless/state'),
		viewScript: readPayloadScriptFromDocument(document, 'markless/view'),
	};
}

export function decodePayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): DecodedPayloadScripts {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}

function readPayloadScriptFromDocument(
	document: PayloadScriptDocument,
	type: RuntimePayloadType,
): string {
	const element = document.querySelector(`script[type="${type}"]`);
	if (!element) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script.`,
			`Browser resume requires the ${payloadScriptSelector(type)} script to exist before the runtime can decode the resumability payload.`,
			[
				{
					message: `Include a ${payloadScriptSelector(type)} script in the rendered document.`,
				},
			],
		);
	}

	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script content.`,
			`Browser resume found ${payloadScriptSelector(type)}, but the script did not expose text content for the runtime to decode.`,
			[
				{
					message: `Render JSON payload content inside ${payloadScriptSelector(type)}.`,
				},
			],
		);
	}

	return `<script type="${type}">${text}</script>`;
}

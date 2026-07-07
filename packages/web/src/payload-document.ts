import {
	RuntimePayloadError,
	type DecodedPayloadScripts,
	type EncodedPayloadScripts,
	type RuntimePayloadType,
} from '../../serializer/src/protocol-client.ts';
import type { ResumeRuntimeInput } from './resume.ts';
import { getAlreadyResumedPayload } from './payload-resume-registry.ts';
import {
	decodePayloadScripts,
	resumeFromPayloadScripts,
	type ResumePayloadScriptsInput,
	type ResumePayloadScriptsResult,
} from './payload-full.ts';

export type PayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type PayloadScriptDocument = {
	readonly querySelector: (selector: string) => PayloadScriptElement | null;
};

export type ResumePayloadDocumentInput = Omit<
	ResumePayloadScriptsInput,
	'stateScript' | 'viewScript'
> & { readonly document: PayloadScriptDocument };

export async function resumeFromPayloadDocument(
	input: ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	const resumed = getAlreadyResumedPayload(input.root);
	if (resumed) return resumed;

	const scripts = readPayloadScriptsFromDocument(input.document);
	return resumeFromPayloadScripts({
		...scripts,
		root: input.root,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		createRemovalObserver: input.createRemovalObserver,
		applyDomJournal: input.applyDomJournal,
		renderBranchHtml: input.renderBranchHtml ?? documentTemplateBranchHtml(input.document),
	});
}

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
	const selector = `script[type="${type}"]`;
	const element = document.querySelector(selector);
	if (!element) {
		throw new RuntimePayloadError({
			code: 'MARKLESS_PAYLOAD_INVALID',
			severity: 'error',
			phase: 'payload',
			title: 'Invalid Markless payload',
			payloadType: type,
			payloadScript: '',
			message: `Missing ${type} payload script.`,
			why: `Browser resume requires the ${selector} script to exist before decoding.`,
			suggestions: [{ message: `Include a ${selector} script in the rendered document.` }],
			docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		});
	}

	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) {
		throw new RuntimePayloadError({
			code: 'MARKLESS_PAYLOAD_INVALID',
			severity: 'error',
			phase: 'payload',
			title: 'Invalid Markless payload',
			payloadType: type,
			payloadScript: '',
			message: `Missing ${type} payload script content.`,
			why: `Browser resume found ${selector}, but it did not expose text content.`,
			suggestions: [{ message: `Render JSON payload content inside ${selector}.` }],
			docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		});
	}

	return `<script type="${type}">${text}</script>`;
}

function documentTemplateBranchHtml(
	document: PayloadScriptDocument,
): ResumeRuntimeInput['renderBranchHtml'] {
	const documentLike = document as {
		readonly createElement?: (tagName: string) => {
			innerHTML: string;
			readonly content?: { readonly childNodes?: ArrayLike<unknown> };
		};
		readonly ownerDocument?: {
			readonly createElement?: (tagName: string) => {
				innerHTML: string;
				readonly content?: { readonly childNodes?: ArrayLike<unknown> };
			};
		};
	};
	const host = documentLike.createElement ? documentLike : documentLike.ownerDocument;
	if (!host?.createElement) return undefined;
	return (html) => {
		const template = host.createElement!('template');
		template.innerHTML = html;
		return Array.from(template.content?.childNodes ?? []) as ReturnType<
			NonNullable<ResumeRuntimeInput['renderBranchHtml']>
		>;
	};
}

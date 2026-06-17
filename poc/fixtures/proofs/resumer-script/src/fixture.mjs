import { FakeDocument, FakeElement, createClickEvent } from './fake-dom.mjs';
import { eventOnlyResumerSource } from './resumer-source.mjs';

export function renderStaticSsrHtml() {
	return '<section data-proof="static"><p>Static SSR</p></section>';
}

export function renderEventOnlySsrHtml() {
	const view = createViewPayload(createSymbolModuleUrl());
	const resumer = eventOnlyResumerSource();
	return [
		'<section data-async data-count="0">',
		'  <button type="button">Count 0</button>',
		`  <script type="arcade/view">${escapeHtml(JSON.stringify(view))}</script>`,
		`  <script data-async-resumer>${escapeScript(resumer)}</script>`,
		'</section>',
	].join('\n');
}

export async function createInteractiveDocument() {
	const state = {
		executions: {
			componentBodies: 0,
			appModules: 0,
			symbolModules: 0,
			handlers: 0,
		},
		receipts: [],
	};
	const root = new FakeElement('section', { 'data-async': '', 'data-count': '0' });
	const button = root.appendChild(new FakeElement('button', { type: 'button' }));
	button.textContent = 'Count 0';
	const viewScript = root.appendChild(new FakeElement('script', { type: 'arcade/view' }));
	viewScript.textContent = JSON.stringify(createViewPayload(createSymbolModuleUrl()));
	const resumerScript = root.appendChild(
		new FakeElement('script', { type: 'module', 'data-async-resumer': '' }),
	);
	resumerScript.textContent = eventOnlyResumerSource();
	const document = new FakeDocument(root);
	document.currentScript = resumerScript;

	return {
		async runStartup() {
			const previousDocument = globalThis.document;
			const previousProof = globalThis.__resumerProof;
			globalThis.document = document;
			globalThis.__resumerProof = state;
			try {
				new Function(resumerScript.textContent)();
			} finally {
				if (previousDocument === undefined) {
					delete globalThis.document;
				} else {
					globalThis.document = previousDocument;
				}
				if (previousProof === undefined) {
					delete globalThis.__resumerProof;
				} else {
					globalThis.__resumerProof = previousProof;
				}
			}
		},
		async clickButton() {
			const previousProof = globalThis.__resumerProof;
			globalThis.__resumerProof = state;
			try {
				await button.dispatchEvent(createClickEvent());
			} finally {
				if (previousProof === undefined) {
					delete globalThis.__resumerProof;
				} else {
					globalThis.__resumerProof = previousProof;
				}
			}
		},
		buttonText() {
			return button.textContent;
		},
		rootAttribute(name) {
			return root.getAttribute(name);
		},
		executions() {
			return { ...state.executions };
		},
		receipts() {
			return [...state.receipts];
		},
	};
}

function createViewPayload(symbolModuleUrl) {
	return [['click'], [[1, 0, 0, 0]], [symbolModuleUrl], ['onClick']];
}

function createSymbolModuleUrl() {
	const source = `
globalThis.__resumerProof.executions.symbolModules++;
globalThis.__resumerProof.receipts.push({ stage: 'lazy-symbol-loaded', symbol: 'click' });
export async function onClick({ element, root }) {
	const count = Number(root.getAttribute('data-count')) + 1;
	root.setAttribute('data-count', String(count));
	element.textContent = 'Count ' + count;
	globalThis.__resumerProof.executions.handlers++;
	globalThis.__resumerProof.receipts.push({ stage: 'handler-run', eventName: 'click', count });
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

function escapeHtml(value) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

function escapeScript(value) {
	return value.replaceAll('</script', '<\\/script');
}

import type { Page } from '@playwright/test';

// Scratch probe, not for merge: which dialog-naming markup VoiceOver and NVDA both speak.

export type ProbeReader = {
	next(): Promise<void>;
	lastSpokenPhrase(): Promise<string>;
	spokenPhraseLog(): Promise<string[]>;
	clearSpokenPhraseLog(): Promise<void>;
};

const TITLE = 'Vee title';
const inner = `<h2 id="t">${TITLE}</h2><p>Body</p><button id="c">Done</button>`;

// Each body has an Open button first and a dialog #d inside a plain <div> (the failing shape) unless it says main.
const nested = (dialog: string) => `<button id="open">Open</button><div id="w">${dialog}</div>`;
const direct = (dialog: string) => `<button id="open">Open</button>${dialog}`;

type Variant = {
	readonly name: string;
	readonly body: string;
	readonly reveal?: string;
	readonly focusDialog?: boolean;
};

export const VARIANTS: readonly Variant[] = [
	{ name: 'L labelledby only, nested', body: nested(`<div role="dialog" id="d" aria-labelledby="t">${inner}</div>`) },
	{ name: 'L labelledby only, under main', body: direct(`<div role="dialog" id="d" aria-labelledby="t">${inner}</div>`) },
	{ name: 'A labelledby + aria-label same, nested', body: nested(`<div role="dialog" id="d" aria-labelledby="t" aria-label="${TITLE}">${inner}</div>`) },
	{ name: 'A2 labelledby + aria-label different, nested', body: nested(`<div role="dialog" id="d" aria-labelledby="t" aria-label="Label wins">${inner}</div>`) },
	{ name: 'B aria-label only, nested', body: nested(`<div role="dialog" id="d" aria-label="${TITLE}">${inner}</div>`) },
	{ name: 'B aria-label only, under main', body: direct(`<div role="dialog" id="d" aria-label="${TITLE}">${inner}</div>`) },
	{
		name: 'B-late hidden, aria-label written at reveal, nested',
		body: nested(`<div role="dialog" id="d" hidden>${inner}</div>`),
		reveal: `d.setAttribute('aria-label', document.getElementById('t').textContent); d.hidden = false`,
	},
	{
		name: 'A-late hidden, labelledby + aria-label written at reveal, nested',
		body: nested(`<div role="dialog" id="d" aria-labelledby="t" hidden>${inner}</div>`),
		reveal: `d.setAttribute('aria-label', document.getElementById('t').textContent); d.hidden = false`,
	},
	{ name: 'C1 native dialog open + labelledby, nested', body: nested(`<dialog open id="d" aria-labelledby="t">${inner}</dialog>`) },
	{ name: 'C2 labelledby self + aria-label, nested', body: nested(`<div role="dialog" id="d" aria-labelledby="d" aria-label="${TITLE}">${inner}</div>`) },
	{
		name: 'MA modal focus dialog, labelledby + aria-label, nested',
		body: nested(`<div role="dialog" id="d" aria-modal="true" tabindex="-1" aria-labelledby="t" aria-label="${TITLE}" hidden>${inner}</div>`),
		reveal: `d.hidden = false; d.focus()`,
		focusDialog: true,
	},
	{
		name: 'MB modal focus dialog, aria-label only, nested',
		body: nested(`<div role="dialog" id="d" aria-modal="true" tabindex="-1" aria-label="${TITLE}" hidden>${inner}</div>`),
		reveal: `d.hidden = false; d.focus()`,
		focusDialog: true,
	},
	{
		name: 'ML modal focus dialog, labelledby only, nested',
		body: nested(`<div role="dialog" id="d" aria-modal="true" tabindex="-1" aria-labelledby="t" hidden>${inner}</div>`),
		reveal: `d.hidden = false; d.focus()`,
		focusDialog: true,
	},
];

export async function runVariants(
	label: string,
	page: Page,
	reader: ProbeReader,
	start: () => Promise<void>,
	toFocus: () => Promise<void>,
) {
	for (const variant of VARIANTS) {
		await page.setContent(
			`<!doctype html><html lang="en"><body><main><h1>Probe</h1>${variant.body}<p>After</p></main></body></html>`,
		);
		await start();
		for (let step = 0; step < 10; step++) {
			if ((await reader.lastSpokenPhrase()).includes('Open')) break;
			await reader.next();
		}
		await reader.clearSpokenPhraseLog();
		if (variant.reveal) {
			await page.evaluate(`(() => { const d = document.getElementById('d'); ${variant.reveal}; })()`);
			await page.waitForTimeout(2000);
		}
		if (variant.focusDialog) {
			console.log(`PROBE ${label} | ${variant.name} | heard on focus: ${JSON.stringify(await reader.spokenPhraseLog())}`);
			await toFocus();
			console.log(`PROBE ${label} | ${variant.name} | at focus: ${JSON.stringify(await reader.lastSpokenPhrase())}`);
		}
		for (let step = 0; step < 4; step++) {
			await reader.next();
			console.log(`PROBE ${label} | ${variant.name} | step ${step}: ${JSON.stringify(await reader.lastSpokenPhrase())}`);
		}
	}
}

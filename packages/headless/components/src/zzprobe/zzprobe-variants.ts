import type { Page } from '@playwright/test';

// Scratch probe, not for merge: which dialog-naming markup VoiceOver and NVDA both speak when focus enters the dialog.

export type ProbeReader = {
	capture<T>(action: () => Promise<T> | T): Promise<{ spokenPhrase: string; itemText: string }>;
	next(): Promise<void>;
	lastSpokenPhrase(): Promise<string>;
};

const ONLY_LATE = true;
const TITLE = 'Vee title';
const inner = `<h2 id="t">${TITLE}</h2><p>Body text</p><button id="c">Done</button>`;

type Markup = { readonly name: string; readonly attrs: string; readonly tag?: 'dialog' };

const MARKUP: readonly Markup[] = ONLY_LATE ? [] : [
	{ name: 'L labelledby only', attrs: `aria-labelledby="t"` },
	{ name: 'A labelledby + aria-label same text', attrs: `aria-labelledby="t" aria-label="${TITLE}"` },
	{ name: 'A2 labelledby + aria-label other text', attrs: `aria-labelledby="t" aria-label="Label text"` },
	{ name: 'B aria-label only', attrs: `aria-label="${TITLE}"` },
];

const dialogMarkup = (markup: Markup) =>
	markup.tag === 'dialog'
		? `<dialog id="d" tabindex="-1" ${markup.attrs}>${inner}</dialog>`
		: `<div role="dialog" id="d" tabindex="-1" hidden ${markup.attrs}>${inner}</div>`;

const reveal = (markup: Markup) => (markup.tag === 'dialog' ? `d.show()` : `d.hidden = false`);

type Case = {
	readonly label: string;
	readonly body: string;
	readonly action: string;
};

function cases(): Case[] {
	const out: Case[] = [];
	for (const markup of MARKUP) {
		for (const placement of ['nested', 'main'] as const) {
			for (const target of ['dialog', 'control'] as const) {
				const dialog = dialogMarkup(markup);
				out.push({
					label: `${markup.name} | ${placement} | focus ${target}`,
					body: placement === 'nested' ? `<div><div>${dialog}</div></div>` : dialog,
					action: `${reveal(markup)}; ${target === 'dialog' ? 'd' : "document.getElementById('c')"}.focus()`,
				});
			}
		}
	}
	// The family writes aria-label after the dialog shows (onVisible), and again when the title changes.
	for (const target of ['dialog', 'control'] as const) {
		const focus = target === 'dialog' ? 'd' : "document.getElementById('c')";
		out.push({
			label: `B-after label written 150ms after focus | nested | focus ${target}`,
			body: `<div><div><div role="dialog" id="d" tabindex="-1" hidden>${inner}</div></div></div>`,
			action: `d.hidden = false; ${focus}.focus(); return new Promise((done) => setTimeout(() => { d.setAttribute('aria-label', document.getElementById('t').textContent); done(); }, 150))`,
		});
		out.push({
			label: `A-after labelledby, label written 150ms after focus | nested | focus ${target}`,
			body: `<div><div><div role="dialog" id="d" tabindex="-1" aria-labelledby="t" hidden>${inner}</div></div></div>`,
			action: `d.hidden = false; ${focus}.focus(); return new Promise((done) => setTimeout(() => { d.setAttribute('aria-label', document.getElementById('t').textContent); done(); }, 150))`,
		});
		out.push({
			label: `H handover labelledby removed when label written 150ms after focus | nested | focus ${target}`,
			body: `<div><div><div role="dialog" id="d" tabindex="-1" aria-labelledby="t" hidden>${inner}</div></div></div>`,
			action: `d.hidden = false; ${focus}.focus(); return new Promise((done) => setTimeout(() => { d.setAttribute('aria-label', document.getElementById('t').textContent); d.removeAttribute('aria-labelledby'); done(); }, 150))`,
		});
	}
	return out;
}

export async function runVariants(label: string, page: Page, reader: ProbeReader, start: () => Promise<void>) {
	for (const probe of cases()) {
		await page.setContent(
			`<!doctype html><html lang="en"><body><main><h1>Probe</h1><button id="open">Open</button>${probe.body}<p>After</p></main></body></html>`,
		);
		await start();
		await page.focus('#open');
		await page.waitForTimeout(800);
		const opened = await reader.capture(() =>
			page.evaluate(`(async () => { const d = document.getElementById('d'); ${probe.action}; })()`).then(() => page.waitForTimeout(1500)),
		);
		console.log(`PROBE ${label} | ${probe.label} | on focus: ${JSON.stringify(opened.spokenPhrase)}`);
		// Renaming the title and label while focus stays inside; Tab-free: focus moves out to the dialog and back to the control.
		if (probe.label.startsWith('B aria-label only | nested')) {
			const renamed = await reader.capture(() =>
				page
					.evaluate(`(() => { const d = document.getElementById('d'); document.getElementById('t').textContent = 'Renamed title'; d.setAttribute('aria-label', 'Renamed title'); document.getElementById('open').focus(); document.getElementById('c').focus(); })()`)
					.then(() => page.waitForTimeout(1500)),
			);
			console.log(`PROBE ${label} | ${probe.label} | after rename, refocus: ${JSON.stringify(renamed.spokenPhrase)}`);
		}
	}
}

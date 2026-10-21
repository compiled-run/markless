import type { Page } from '@playwright/test';

// Scratch probe, not for merge: walking the reading cursor into a revealed, nested dialog.

export type ProbeReader = {
	next(): Promise<void>;
	lastSpokenPhrase(): Promise<string>;
};

const TITLE = 'Vee title';
const inner = `<h2 id="t">${TITLE}</h2><p>Body text</p><button id="c">Done</button>`;
const LATE = `setTimeout(() => d.setAttribute('aria-label', document.getElementById('t').textContent), 150)`;

const CASES: readonly { label: string; attrs: string; reveal: string }[] = [
	{ label: 'L labelledby only', attrs: `aria-labelledby="t"`, reveal: `d.hidden = false` },
	{ label: 'A labelledby + aria-label same text', attrs: `aria-labelledby="t" aria-label="${TITLE}"`, reveal: `d.hidden = false` },
	{ label: 'A2 labelledby + aria-label other text', attrs: `aria-labelledby="t" aria-label="Label text"`, reveal: `d.hidden = false` },
	{ label: 'B aria-label only', attrs: `aria-label="${TITLE}"`, reveal: `d.hidden = false` },
	{ label: 'A-late labelledby, aria-label 150ms after reveal', attrs: `aria-labelledby="t"`, reveal: `d.hidden = false; ${LATE}` },
	{ label: 'B-late aria-label 150ms after reveal', attrs: '', reveal: `d.hidden = false; ${LATE}` },
];

export async function runVariants(label: string, page: Page, reader: ProbeReader, start: () => Promise<void>) {
	for (const probe of CASES) {
		for (const placement of ['nested', 'main'] as const) {
			const dialog = `<div role="dialog" id="d" hidden ${probe.attrs}>${inner}</div>`;
			await page.setContent(
				`<!doctype html><html lang="en"><body><main><h1>Probe</h1><button id="open">Open</button>${placement === 'nested' ? `<div><div>${dialog}</div></div>` : dialog}<p>After</p></main></body></html>`,
			);
			await start();
			let at = '';
			for (let step = 0; step < 10; step++) {
				at = await reader.lastSpokenPhrase();
				if (at.includes('Open')) break;
				await reader.next();
			}
			await page.evaluate(`(() => { const d = document.getElementById('d'); ${probe.reveal}; })()`);
			await page.waitForTimeout(1500);
			const walked: string[] = [];
			for (let step = 0; step < 4; step++) {
				await reader.next();
				walked.push(await reader.lastSpokenPhrase());
			}
			console.log(`PROBE ${label} | ${probe.label} | ${placement} | from ${JSON.stringify(at)} walked ${JSON.stringify(walked)}`);
		}
	}
}

import { voiceOverTest, type VoiceOverPlaywright } from '@guidepup/playwright';
import type { Page } from '@playwright/test';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';

// Scratch probe, not for merge: the real gallery dialogs under VoiceOver, one naming markup at a time.

const MARKUP = {
	L: '',
	A: `d.setAttribute('aria-label', t.textContent)`,
	B: `d.setAttribute('aria-label', t.textContent); d.removeAttribute('aria-labelledby')`,
} as const;

async function toSection(page: Page, voiceOver: VoiceOverPlaywright, heading: string) {
	await voiceOver.navigateToWebContent();
	for (let step = 0; step < 80; step++) {
		await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading);
		if ((await voiceOver.lastSpokenPhrase()) === `heading level 2 ${heading}`) return true;
	}
	return false;
}

voiceOverTest('probe: gallery dialogs under VoiceOver by naming markup', async ({ page, voiceOver }) => {
	voiceOverTest.setTimeout(55 * 60_000);
	for (const [family, heading] of [['popover', 'Popover'], ['modal', 'Modal'], ['drawer', 'Drawer']] as const) {
		for (const [name, mutate] of Object.entries(MARKUP)) {
			await page.goto(`${PREVIEW_ORIGIN}/#${family}`);
			await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
			const shape = await page.evaluate(
				`(() => { const d = document.querySelector('#${family} [role="dialog"]'); const t = document.getElementById(d.getAttribute('aria-labelledby')); ${mutate}; return { label: d.getAttribute('aria-label'), labelledby: d.getAttribute('aria-labelledby'), parent: d.parentElement.tagName }; })()`,
			);
			const found = await toSection(page, voiceOver, heading);
			await voiceOver.next();
			const on = await voiceOver.lastSpokenPhrase();
			await voiceOver.clearSpokenPhraseLog();
			await voiceOver.press('Enter');
			await page.waitForTimeout(2500);
			const heard = await voiceOver.spokenPhraseLog();
			const walked: string[] = [];
			for (let step = 0; step < 4; step++) {
				await voiceOver.next();
				walked.push(await voiceOver.lastSpokenPhrase());
			}
			console.log(`PROBE gallery ${family} ${name} | shape ${JSON.stringify(shape)} | section ${found} | on ${JSON.stringify(on)} | heard ${JSON.stringify(heard)} | walked ${JSON.stringify(walked)}`);
		}
	}

	// Probe 5's own setup: the gallery origin first, then plain markup in one wrapping div.
	for (const [name, attrs] of [['L', 'aria-labelledby="t"'], ['B', 'aria-label="Vee title"']] as const) {
		await page.goto(PREVIEW_ORIGIN);
		await page.setContent(
			`<!doctype html><html lang="en"><body><main><h1>Probe five</h1><button id="open">Open</button><div id="w" hidden><div role="dialog" id="d" ${attrs}><h2 id="t">Vee title</h2><p>Body</p><button id="c">Done</button></div></div><p>After</p></main></body></html>`,
		);
		await voiceOver.navigateToWebContent();
		for (let step = 0; step < 8; step++) {
			if ((await voiceOver.lastSpokenPhrase()).includes('button')) break;
			await voiceOver.next();
		}
		await page.evaluate(`document.getElementById('w').hidden = false`);
		await page.waitForTimeout(1500);
		const walked: string[] = [];
		for (let step = 0; step < 3; step++) {
			await voiceOver.next();
			walked.push(await voiceOver.lastSpokenPhrase());
		}
		console.log(`PROBE probe5-setup ${name} | walked ${JSON.stringify(walked)}`);
	}
});

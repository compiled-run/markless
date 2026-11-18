// Rewrites @markless/serializer's validation messages from Chromium itself: `node packages/mobile/test/write-validation-messages.ts`
// (macOS). For each language Chrome for Testing ships, it sets that app's AppleLanguages, reads `validationMessage` of a
// required text field, checkbox and radio, and restores the setting.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const executable = chromium.executablePath();
const app = join(dirname(executable), '..', '..');
const bundle = execFileSync(
	'defaults',
	['read', join(app, 'Contents', 'Info'), 'CFBundleIdentifier'],
	{ encoding: 'utf8' },
).trim();
const locales = readdirSync(join(app, 'Contents', 'Resources'))
	.filter((entry) => entry.endsWith('.lproj'))
	.map((entry) => entry.slice(0, -'.lproj'.length).replace('_', '-'))
	.sort();
const kept = (() => {
	try {
		return execFileSync('defaults', ['export', bundle, '-'], { encoding: 'utf8' });
	} catch {
		return undefined;
	}
})();
const table: Record<string, { text: string; checkbox: string; radio: string }> = {};
try {
	for (const locale of locales) {
		execFileSync('defaults', ['write', bundle, 'AppleLanguages', '-array', locale]);
		const browser = await chromium.launch({ channel: 'chromium' });
		const page = await browser.newPage();
		await page.setContent(
			'<input id="text" required><input id="checkbox" type="checkbox" required><input id="radio" type="radio" name="group" required>',
		);
		const [text, checkbox, radio] = await page.evaluate(() =>
			['text', 'checkbox', 'radio'].map(
				(id) => (document.getElementById(id) as HTMLInputElement).validationMessage,
			),
		);
		await browser.close();
		table[locale] = { text: text!, checkbox: checkbox!, radio: radio! };
	}
} finally {
	execFileSync('defaults', ['delete', bundle, 'AppleLanguages']);
	if (kept !== undefined) execFileSync('defaults', ['import', bundle, '-'], { input: kept });
}
writeFileSync(
	new URL('../../serializer/src/native-validation-messages.ts', import.meta.url),
	`// Written by packages/mobile/test/write-validation-messages.ts from ${await chromium
		.launch({ channel: 'chromium' })
		.then(async (browser) => {
			const version = browser.version();
			await browser.close();
			return `Chromium ${version}`;
		})}; do not edit.\n\n/** Chromium's \`validationMessage\` for a required field with no value, by the language Chromium shows its own text in. */\nexport const NATIVE_VALUE_MISSING_BY_LOCALE: Readonly<Record<string, { readonly text: string; readonly checkbox: string; readonly radio: string }>> = ${JSON.stringify(table, null, '\t')};\n`,
);

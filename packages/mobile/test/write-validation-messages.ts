// Rewrites @markless/serializer's validation messages from Chromium itself: `node packages/mobile/test/write-validation-messages.ts`
// (macOS). For each language Chrome for Testing ships, it sets that app's AppleLanguages, reads `validationMessage` of a
// required text field, checkbox and radio, and of an edited text field longer than its maxlength, and restores the setting.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import {
	nativeEmailMismatch,
	nativeTooLongMessage,
	type NativeEmailMismatch,
} from '@markless/serializer/native-view';

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
const tooLong: Record<string, { text: string; digits?: string }> = {};
const emailMismatch: Record<string, NativeEmailMismatch> = {};
/** An email field's message for `value`, with `part` (which the message quotes) written back as `{name}`. */
const emailMessage = async (page: Page, value: string, part: string, name: string) => {
	const message = await page.evaluate((typed) => {
		const field = document.getElementById('email') as HTMLInputElement;
		field.value = typed;
		return field.validationMessage;
	}, value);
	if (part !== '' && message.split(part).length !== 2)
		throw new Error(`expected ${JSON.stringify(part)} once in ${JSON.stringify(message)}`);
	return part === '' ? message : message.replace(part, `{${name}}`);
};
/** Values whose messages a recorded table must reproduce, beyond the ones it is recorded from. */
const EMAIL_CHECKS = ['abc', '@x', 'a@', 'a,b@c', 'a@b_c', 'a@b..c', 'a@b-', 'a@@b', 'ü@b', 'a@b'];
/** The message for an edited field of `length` characters whose maxlength is `max`. */
const tooLongMessage = async (page: Page, max: number, length: number) => {
	await page.setContent(`<input id="long" maxlength="${max}">`);
	await page.evaluate((count) => {
		(document.getElementById('long') as HTMLInputElement).value = 'x'.repeat(count);
	}, length + 1);
	await page.click('#long');
	await page.keyboard.press('End');
	await page.keyboard.press('Backspace');
	return page.evaluate(
		() => (document.getElementById('long') as HTMLInputElement).validationMessage,
	);
};
/** Splits a message into its text and its two numbers, told apart by how many digits each has. */
const numbersOf = (message: string, locale: string) => {
	const runs = [...message.matchAll(/\p{Nd}+/gu)].map((match) => match[0]);
	if (runs.length !== 2)
		throw new Error(`${locale}: expected two numbers in ${JSON.stringify(message)}`);
	return runs;
};
try {
	for (const locale of locales) {
		execFileSync('defaults', ['write', bundle, 'AppleLanguages', '-array', locale]);
		const browser = await chromium.launch({ channel: 'chromium' });
		const page = await browser.newPage();
		await page.setContent(
			'<input id="text" required><input id="checkbox" type="checkbox" required><input id="radio" type="radio" name="group" required><input id="email" type="email">',
		);
		const [text, checkbox, radio] = await page.evaluate(() =>
			['text', 'checkbox', 'radio'].map(
				(id) => (document.getElementById(id) as HTMLInputElement).validationMessage,
			),
		);
		// ǂ is a character neither part of an address allows, and qqzz text no message spells.
		const email: NativeEmailMismatch = {
			noAt: await emailMessage(page, 'qqzz', 'qqzz', 'value'),
			emptyLocal: await emailMessage(page, '@qqzz', '@qqzz', 'value'),
			emptyDomain: await emailMessage(page, 'qqzz@', 'qqzz@', 'value'),
			invalidLocal: await emailMessage(page, 'qǂz@b', 'ǂ', 'symbol'),
			invalidDomain: await emailMessage(page, 'a@qǂz', 'ǂ', 'symbol'),
			invalidDots: await emailMessage(page, 'a@.qqzz', '.qqzz', 'domain'),
			other: await emailMessage(page, 'a@-b', '', ''),
		};
		for (const value of EMAIL_CHECKS) {
			const chromium = await emailMessage(page, value, '', '');
			const ours = nativeEmailMismatch(email, value) ?? '';
			if (ours !== chromium)
				throw new Error(
					`${locale}: ${JSON.stringify(value)} gives ${JSON.stringify(ours)}, Chromium ${JSON.stringify(chromium)}`,
				);
		}
		emailMismatch[locale] = email;
		const wide = await tooLongMessage(page, 1234, 56789);
		const narrow = await tooLongMessage(page, 10, 100);
		await browser.close();
		table[locale] = { text: text!, checkbox: checkbox!, radio: radio! };
		const [max, length] = numbersOf(wide, locale).sort((a, b) => a.length - b.length) as [
			string,
			string,
		];
		const [ten, hundred] = numbersOf(narrow, locale).sort((a, b) => a.length - b.length) as [
			string,
			string,
		];
		const digits = [...ten][1]! + [...max, ...length].join('');
		const entry = {
			text: wide.replace(max, '{max}').replace(length, '{length}'),
			...(digits === '0123456789' ? {} : { digits }),
		};
		if (
			nativeTooLongMessage(entry, 10, 100) !== narrow ||
			hundred !== [...ten][0]! + digits[0]! + digits[0]!
		)
			throw new Error(
				`${locale}: ${JSON.stringify(entry)} does not give ${JSON.stringify(narrow)}`,
			);
		tooLong[locale] = entry;
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
		})}; do not edit.\n\nimport type { NativeEmailMismatch, NativeTooLong } from './native-view.ts';\n\n/** Chromium's \`validationMessage\` for a required field with no value, by the language Chromium shows its own text in. */\nexport const NATIVE_VALUE_MISSING_BY_LOCALE: Readonly<Record<string, { readonly text: string; readonly checkbox: string; readonly radio: string }>> = ${JSON.stringify(table, null, '\t')};\n\n/** Chromium's \`validationMessage\` for a text field a person edited to longer than its maxlength, with \`{max}\` and \`{length}\` for the numbers. */\nexport const NATIVE_TOO_LONG_BY_LOCALE: Readonly<Record<string, NativeTooLong>> = ${JSON.stringify(tooLong, null, '\t')};\n\n/** Chromium's \`validationMessage\` for an email field whose value is not an email address, one per reason. */\nexport const NATIVE_EMAIL_MISMATCH_BY_LOCALE: Readonly<Record<string, NativeEmailMismatch>> = ${JSON.stringify(emailMismatch, null, '\t')};\n`,
);

// Rewrites @markless/serializer's validation messages from Chromium itself: `node packages/mobile/test/write-validation-messages.ts`
// (macOS). For each language Chrome for Testing ships, it sets that app's AppleLanguages, reads `validationMessage` of a
// required text field, checkbox and radio, and of an edited text field longer than its maxlength, and restores the setting.
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import {
	nativeEmailMismatch,
	nativeNumberMessage,
	nativeTooLongMessage,
	type NativeEmailMismatch,
	type NativeNumberMessages,
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
const numbers: Record<string, NativeNumberMessages> = {};
/** A number field's `validationMessage` with these attributes and this value set by script, or this text typed. */
const numberMessage = async (page: Page, attributes: string, value: { set?: string; typed?: string }) => {
	await page.setContent(`<input id="number" type="number" ${attributes}>`);
	if (value.set !== undefined)
		await page.evaluate((set) => {
			(document.getElementById('number') as HTMLInputElement).value = set;
		}, value.set);
	if (value.typed !== undefined) {
		await page.click('#number');
		await page.keyboard.type(value.typed);
	}
	return page.evaluate(() => (document.getElementById('number') as HTMLInputElement).validationMessage);
};
/** `message` with each number in `values` (as Chromium writes them in `locale`) replaced by its `{name}`. */
const numberTemplate = (message: string, values: Record<string, string>, locale: string) => {
	let text = message;
	for (const [name, written] of Object.entries(values)) {
		if (!text.includes(written)) throw new Error(`${locale}: ${JSON.stringify(message)} does not hold ${written}`);
		text = text.replace(written, `{${name}}`);
	}
	return text;
};
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
		const underflow = await numberMessage(page, 'min="1234"', { set: '5' });
		const overflow = await numberMessage(page, 'max="1234"', { set: '5678' });
		const twoNearest = await numberMessage(page, 'min="1000" step="250"', { set: '1100' });
		const oneNearest = await numberMessage(page, 'min="1000" step="250" max="1200"', { set: '1100' });
		const fraction = await numberMessage(page, 'min="1.5"', { set: '1' });
		const badInput = await numberMessage(page, '', { typed: '1e' });
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
		const write = (value: string) => value.replace(/[0-9]/g, (digit) => digits[Number(digit)]!);
		// The decimal separator is what stands between the 1 and the 5 of 1.5, as this language writes it.
		const one = write('1');
		const five = write('5');
		const at = fraction.indexOf(one);
		const decimal = at < 0 ? undefined : fraction.slice(at + one.length, fraction.indexOf(five, at));
		if (!decimal) throw new Error(`${locale}: no decimal separator in ${JSON.stringify(fraction)}`);
		const number: NativeNumberMessages = {
			underflow: numberTemplate(underflow, { min: write('1234') }, locale),
			overflow: numberTemplate(overflow, { max: write('1234') }, locale),
			step: numberTemplate(twoNearest, { low: write('1000'), high: write('1250') }, locale),
			stepOne: numberTemplate(oneNearest, { value: write('1000') }, locale),
			badInput,
			...(digits === '0123456789' ? {} : { digits }),
			...(decimal === '.' ? {} : { decimal }),
		};
		if (
			nativeNumberMessage(number.underflow, number, { min: 1.5 }) !== fraction ||
			nativeNumberMessage(number.step, number, { low: 1000, high: 1250 }) !== twoNearest
		)
			throw new Error(`${locale}: ${JSON.stringify(number)} does not give ${JSON.stringify(fraction)}`);
		numbers[locale] = number;
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
		})}; do not edit.\n\nimport type { NativeEmailMismatch, NativeNumberMessages, NativeTooLong } from './native-view.ts';\n\n/** Chromium's \`validationMessage\` for a required field with no value, by the language Chromium shows its own text in. */\nexport const NATIVE_VALUE_MISSING_BY_LOCALE: Readonly<Record<string, { readonly text: string; readonly checkbox: string; readonly radio: string }>> = ${JSON.stringify(table, null, '\t')};\n\n/** Chromium's \`validationMessage\` for a text field a person edited to longer than its maxlength, with \`{max}\` and \`{length}\` for the numbers. */\nexport const NATIVE_TOO_LONG_BY_LOCALE: Readonly<Record<string, NativeTooLong>> = ${JSON.stringify(tooLong, null, '\t')};\n\n/** Chromium's \`validationMessage\` for a number field out of its range, off its step, or holding text that is no number, with \`{min}\`, \`{max}\`, \`{low}\`, \`{high}\` and \`{value}\` for the numbers. */\nexport const NATIVE_NUMBER_MESSAGES_BY_LOCALE: Readonly<Record<string, NativeNumberMessages>> = ${JSON.stringify(numbers, null, '\t')};\n\n/** Chromium's \`validationMessage\` for an email field whose value is not an email address, one per reason. */\nexport const NATIVE_EMAIL_MISMATCH_BY_LOCALE: Readonly<Record<string, NativeEmailMismatch>> = ${JSON.stringify(emailMismatch, null, '\t')};\n`,
);

// Rewrites @markless/serializer's validation messages from Chromium itself: `node packages/mobile/test/write-validation-messages.ts`
// (macOS). For each language Chrome for Testing ships, it sets that app's AppleLanguages, reads `validationMessage` of a
// required text field, checkbox and radio, of an edited text field longer than its maxlength, and of an email field for
// each way its value is not an email address, and the label of an <input type="submit"> without a value (the text of
// its user-agent shadow tree, which neither the DOM nor its accessible name gives), and restores the setting.
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
const submitLabel: Record<string, string> = {};
/** The text in `page`'s first <input type="submit">, read through its user-agent shadow tree. */
const submitLabelOf = async (page: Page) => {
	await page.setContent('<input type="submit">');
	const session = await page.context().newCDPSession(page);
	const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
	type DomNode = {
		nodeType: number;
		nodeValue: string;
		children?: DomNode[];
		shadowRoots?: DomNode[];
	};
	const texts = (node: DomNode): string[] => [
		...(node.nodeType === 3 ? [node.nodeValue] : []),
		...[...(node.children ?? []), ...(node.shadowRoots ?? [])].flatMap(texts),
	];
	const found = texts(root as DomNode);
	await session.detach();
	if (found.length !== 1)
		throw new Error(`expected one label text, found ${JSON.stringify(found)}`);
	return found[0]!;
};
/** A value for each of Chromium's email messages, and what in the message stands for it; none of them occurs in a translation. */
const EMAIL_SAMPLES = {
	missingAt: ['qzxwv', { '{value}': 'qzxwv' }],
	noLocal: ['@qzxwv', { '{value}': '@qzxwv' }],
	noDomain: ['qzxwv@', { '{value}': 'qzxwv@' }],
	localSymbol: ['q§z@x.w', { '{symbol}': '§' }],
	domainSymbol: ['q@x§z.w', { '{symbol}': '§' }],
	dot: ['q@xz..wv', { '{domain}': 'xz..wv' }],
	other: ['q@-xz.wv', {}],
} as const;
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
			'<input id="text" required><input id="checkbox" type="checkbox" required><input id="radio" type="radio" name="group" required>',
		);
		const [text, checkbox, radio] = await page.evaluate(() =>
			['text', 'checkbox', 'radio'].map(
				(id) => (document.getElementById(id) as HTMLInputElement).validationMessage,
			),
		);
		const emails: Record<string, string> = {};
		for (const [kind, [value]] of Object.entries(EMAIL_SAMPLES)) {
			await page.setContent('<input id="email" type="email">');
			emails[kind] = await page.evaluate((given) => {
				const field = document.getElementById('email') as HTMLInputElement;
				field.value = given;
				return field.validationMessage;
			}, value);
		}
		submitLabel[locale] = await submitLabelOf(page);
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
		const templates = Object.fromEntries(
			Object.entries(EMAIL_SAMPLES).map(([kind, [, stands]]) => {
				let message = emails[kind]!;
				for (const [placeholder, value] of Object.entries(stands)) {
					if (!message.includes(value))
						throw new Error(
							`${locale}: ${kind} ${JSON.stringify(message)} has no ${value}`,
						);
					message = message.replace(value, placeholder);
				}
				return [kind, message];
			}),
		) as unknown as NativeEmailMismatch;
		for (const [kind, [value]] of Object.entries(EMAIL_SAMPLES))
			if (nativeEmailMismatch(templates, value) !== emails[kind])
				throw new Error(
					`${locale}: ${kind} gives ${JSON.stringify(nativeEmailMismatch(templates, value))}, not ${JSON.stringify(emails[kind])}`,
				);
		emailMismatch[locale] = templates;
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
		})}; do not edit.\n\nimport type { NativeEmailMismatch, NativeTooLong } from './native-view.ts';\n\n/** Chromium's \`validationMessage\` for a required field with no value, by the language Chromium shows its own text in. */\nexport const NATIVE_VALUE_MISSING_BY_LOCALE: Readonly<Record<string, { readonly text: string; readonly checkbox: string; readonly radio: string }>> = ${JSON.stringify(table, null, '\t')};\n\n/** Chromium's \`validationMessage\` for a text field a person edited to longer than its maxlength, with \`{max}\` and \`{length}\` for the numbers. */\nexport const NATIVE_TOO_LONG_BY_LOCALE: Readonly<Record<string, NativeTooLong>> = ${JSON.stringify(tooLong, null, '\t')};\n\n/** Chromium's \`validationMessage\` for an email field whose value is not an email address, one template for each way it is not. */\nexport const NATIVE_EMAIL_MISMATCH_BY_LOCALE: Readonly<Record<string, NativeEmailMismatch>> = ${JSON.stringify(emailMismatch, null, '\t')};\n\n/** The label Chromium draws on an \`<input type="submit">\` with no \`value\`. */\nexport const NATIVE_SUBMIT_LABEL_BY_LOCALE: Readonly<Record<string, string>> = ${JSON.stringify(submitLabel, null, '\t')};\n`,
);

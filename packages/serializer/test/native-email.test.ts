import { expect, test } from 'vitest';
import { nativeEmailMismatch, nativeEmailValue } from '../src/native-view.ts';

const english = {
	missingAt: "Please include an '@' in the email address. '{value}' is missing an '@'.",
	noLocal: "Please enter a part followed by '@'. '{value}' is incomplete.",
	noDomain: "Please enter a part following '@'. '{value}' is incomplete.",
	localSymbol: "A part followed by '@' should not contain the symbol '{symbol}'.",
	domainSymbol: "A part following '@' should not contain the symbol '{symbol}'.",
	dot: "'.' is used at a wrong position in '{domain}'.",
	other: 'Please enter an email address.',
};

// Each value set on an <input type="email"> in Chromium 156: its sanitized `value` and its `validationMessage`.
const measured: ReadonlyArray<readonly [string, string, string]> = [
	['abc', 'abc', "Please include an '@' in the email address. 'abc' is missing an '@'."],
	['abc@', 'abc@', "Please enter a part following '@'. 'abc@' is incomplete."],
	['@abc', '@abc', "Please enter a part followed by '@'. '@abc' is incomplete."],
	['a b@c', 'a b@c', "A part followed by '@' should not contain the symbol ' '."],
	['a@b c', 'a@b c', "A part following '@' should not contain the symbol ' '."],
	['a@b..c', 'a@b..c', "'.' is used at a wrong position in 'b..c'."],
	['a@.b', 'a@.b', "'.' is used at a wrong position in '.b'."],
	['a@b.', 'a@b.', "'.' is used at a wrong position in 'b.'."],
	['a@b', 'a@b', ''],
	['a@b.c', 'a@b.c', ''],
	[' a@b.c ', 'a@b.c', ''],
	['a\n@b.c', 'a@b.c', ''],
	['ä@b.c', 'ä@b.c', "A part followed by '@' should not contain the symbol 'ä'."],
	['a@ä.c', 'a@ä.c', "A part following '@' should not contain the symbol 'ä'."],
	['a,b@c', 'a,b@c', "A part followed by '@' should not contain the symbol ','."],
	['a@b,c', 'a@b,c', "A part following '@' should not contain the symbol ','."],
	['a@-b.c', 'a@-b.c', 'Please enter an email address.'],
	['a@b-.c', 'a@b-.c', 'Please enter an email address.'],
	['a(b@c', 'a(b@c', "A part followed by '@' should not contain the symbol '('."],
	['a@b@c', 'a@b@c', "A part following '@' should not contain the symbol '@'."],
	['', '', ''],
	['a@b_c', 'a@b_c', "A part following '@' should not contain the symbol '_'."],
];

test.each(measured)(
	'an email field set to %j has the value and message Chromium gives it',
	(given, value, message) => {
		expect(nativeEmailValue(given)).toBe(value);
		expect(nativeEmailMismatch(english, value) ?? '').toBe(message);
	},
);

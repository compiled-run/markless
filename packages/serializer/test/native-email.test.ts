import { describe, expect, it } from 'vitest';
import {
	NATIVE_EMAIL_MISMATCH_BY_LOCALE,
	nativeEmailMismatch,
	nativeEmailValue,
} from '../src/native-view.ts';

// What Chromium 156's `validationMessage` says for each value of an <input type="email"> (en), as recorded from it.
const CHROMIUM: ReadonlyArray<readonly [string, string]> = [
	['abc', "Please include an '@' in the email address. 'abc' is missing an '@'."],
	['@x', "Please enter a part followed by '@'. '@x' is incomplete."],
	['a@', "Please enter a part following '@'. 'a@' is incomplete."],
	['a@b', ''],
	['a@b.c', ''],
	['a,b@c', "A part followed by '@' should not contain the symbol ','."],
	['a@b,c', "A part following '@' should not contain the symbol ','."],
	['a@.b', "'.' is used at a wrong position in '.b'."],
	['a@b.', "'.' is used at a wrong position in 'b.'."],
	['a@b..c', "'.' is used at a wrong position in 'b..c'."],
	['a..b@c', ''],
	['.a@b', ''],
	['a@-b', 'Please enter an email address.'],
	['a@b-', 'Please enter an email address.'],
	['a@b_c', "A part following '@' should not contain the symbol '_'."],
	['a b@c', "A part followed by '@' should not contain the symbol ' '."],
	['ü@b', "A part followed by '@' should not contain the symbol 'ü'."],
	['a@bü', "A part following '@' should not contain the symbol 'ü'."],
	['a@@b', "A part following '@' should not contain the symbol '@'."],
	["a!#$%&'*+/=?^_`{|}~-@b", ''],
	['a@1.2', ''],
	['a@[1.2.3.4]', "A part following '@' should not contain the symbol '['."],
	[`a@${'b'.repeat(64)}`, 'Please enter an email address.'],
	[`a@b.${'c'.repeat(63)}`, ''],
	['', ''],
];

describe('an email field as Chromium checks it', () => {
	it.each(CHROMIUM)('%j', (value, message) => {
		expect(nativeEmailMismatch(NATIVE_EMAIL_MISMATCH_BY_LOCALE.en!, value) ?? '').toBe(message);
	});

	it('keeps a value without line breaks and with its ends trimmed, as Chromium does', () => {
		expect(nativeEmailValue(' a@b ')).toBe('a@b');
		expect(nativeEmailValue('a@b\nc')).toBe('a@bc');
		expect(nativeEmailValue('\t a b \r\n')).toBe('a b');
	});
});

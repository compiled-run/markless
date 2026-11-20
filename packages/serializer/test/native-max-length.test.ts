import { describe, expect, it } from 'vitest';
import { nativeMaxLength, nativeTooLongMessage } from '../src/native-view.ts';

describe('maxlength on phones', () => {
	it('reads the attribute by HTML rules for non-negative integers', () => {
		expect(nativeMaxLength('5')).toBe(5);
		expect(nativeMaxLength(' \n\t+12')).toBe(12);
		expect(nativeMaxLength('8px')).toBe(8);
		expect(nativeMaxLength('-0')).toBe(0);
		expect(nativeMaxLength('-3')).toBeUndefined();
		expect(nativeMaxLength('')).toBeUndefined();
		expect(nativeMaxLength('three')).toBeUndefined();
		expect(nativeMaxLength(null)).toBeUndefined();
	});

	it('writes both numbers as Chromium does: no grouping, in the language digits', () => {
		const english = { text: 'Use {max} or fewer ({length} now).' };
		expect(nativeTooLongMessage(english, 1200, 1204)).toBe('Use 1200 or fewer (1204 now).');
		const persian = { text: 'حداکثر {max} ({length})', digits: '۰۱۲۳۴۵۶۷۸۹' };
		expect(nativeTooLongMessage(persian, 3, 10)).toBe('حداکثر ۳ (۱۰)');
	});
});

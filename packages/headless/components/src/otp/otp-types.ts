import type { PropsOf, Seeded } from '@markless/core';

export type OtpRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** How many characters the code has. Every item declares its own place in it. */
	readonly length: number;
	/** The code entered so far. Omit it and the field starts empty. */
	readonly value?: string;
	/** Nothing can be typed while this is set. */
	readonly disabled?: boolean;
	/** Called with the whole code every time it changes, not with the character typed. */
	readonly onChange?: (value: string) => void;
	/** Called once with the whole code the moment it reaches `length` characters. */
	readonly onComplete?: (value: string) => void;
};

/**
 * The one real text input: everything a person types goes here, which is what
 * makes paste, one-time-code autofill, undo and a single tab stop free. `value`
 * is the family's, so a consumer cannot set it here; `pattern` and everything
 * else an `<input>` accepts reaches the element through the spread.
 */
export type OtpFieldProps = Omit<PropsOf<'input'>, 'value'>;

export type OtpItemProps = PropsOf<'div'> & {
	/** Which character of the code this box shows, counting from 0. */
	readonly index: number;
};

export type OtpItemIndicatorProps = PropsOf<'span'>;

/**
 * The shared instance every otp part reads: the root's seeded fields, plus the
 * two consumer callbacks the root stores for `write()` to dispatch through.
 */
export type OtpInstanceState = Seeded<OtpRootProps, 'length' | 'value' | 'disabled'> & {
	onChange?: OtpRootProps['onChange'];
	onComplete?: OtpRootProps['onComplete'];
};

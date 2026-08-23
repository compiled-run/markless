import { computed, element, shared, state } from '@markless/core';
import type {
	OtpFieldProps,
	OtpInstanceState,
	OtpItemIndicatorProps,
	OtpItemProps,
	OtpRootProps,
} from './otp-types.ts';

export const otpState = shared(
	() => {
		const otp: OtpInstanceState = state({
			length: 0,
			value: '',
			disabled: false,
		});
		const fieldEl = element<HTMLInputElement>();

		return {
			...otp,
			fieldEl,
			// literal function types: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			onComplete: undefined as ((value: string) => void) | undefined,
			write(next: string) {
				// the input's maxlength already truncated; the slice is belt and braces
				const code = next.slice(0, otp.length);
				if (code === otp.value) return;
				otp.value = code;
				otp.onChange?.(code);
				if (code.length === otp.length) otp.onComplete?.(code);
			},
		};
	},
	{ scope: 'widget' },
);

export function OtpRoot({
	length,
	value = '',
	disabled = false,
	onChange,
	onComplete,
	children,
	...rest
}: OtpRootProps) @{
	const otp = otpState();
	otp.onChange = onChange;
	otp.onComplete = onComplete;
	otp.length = length;
	otp.value = value;
	otp.disabled = disabled;

	<div {...rest} ui-disabled={otp.disabled}>{children}</div>
}

// One tab stop, one accessibility-tree control, one paste target. A consumer's
// `onInput` runs after the family has taken the value.
export function OtpField({ onInput, ...rest }: OtpFieldProps) @{
	const otp = otpState();

	<input
		{...rest}
		el={otp.fieldEl}
		type="text"
		value={otp.value}
		maxlength={otp.length}
		disabled={otp.disabled}
		inputmode="numeric"
		autocomplete="one-time-code"
		onInput={(event) => {
			otp.write(event.currentTarget.value);
			onInput?.(event);
		}}
	/>
}

// aria-hidden: the input already carries the code, so an exposed item would put
// every character in the tree twice.
export function OtpItem({ index, children, ...rest }: OtpItemProps) @{
	const otp = otpState();
	const item = state({ index });
	// slice, not value[index]: a graph read path has to be statically resolvable
	const char = computed(() => otp.value.slice(item.index, item.index + 1));

	<div
		{...rest}
		aria-hidden="true"
		ui-empty={char === ''}
		ui-disabled={otp.disabled}
	>{char}{children}</div>
}

export function OtpItemIndicator({ children, ...rest }: OtpItemIndicatorProps) @{
	<span {...rest}>{children}</span>
}

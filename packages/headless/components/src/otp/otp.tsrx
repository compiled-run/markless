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
			shiftPWManagers: true,
		});
		const fieldEl = element<HTMLInputElement>();

		return {
			...otp,
			fieldEl,
			// literal function types: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: string) => void) | undefined,
			onComplete: undefined as ((value: string) => void) | undefined,
			// The field covers the root so a tap anywhere on the boxes lands on it; the strings are written out in full because this body is lifted into its own symbol, where a module constant cannot be read.
			fieldStyle: computed(() => {
				if (!otp.shiftPWManagers) {
					return 'position: absolute; inset: 0; box-sizing: border-box; height: 100%; width: 100%; opacity: 0;';
				}
				// A password manager paints its icon at the input's right edge, so the input is widened past the root and that strip clipped away.
				return 'position: absolute; inset: 0; box-sizing: border-box; height: 100%; width: calc(100% + 45px); opacity: 0; clip-path: inset(0 45px 0 0);';
			}),
			commit() {
				// `maxlength` truncates typing but not a paste or autofill, so the slice is what enforces the length.
				const code = otp.value.slice(0, otp.length);
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
	shiftPWManagers = true,
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
	otp.shiftPWManagers = shiftPWManagers;

	// Positioned so the field stretches over these boxes and nothing else.
	<div {...rest} style="position: relative;" ui-disabled={otp.disabled}>{children}</div>
}

/** The one tab stop, accessibility-tree control and paste target; a consumer's `onInput` runs after the family has taken the value. */
export function OtpField({ onInput, onFocus, ...rest }: OtpFieldProps) @{
	const otp = otpState();

	<input
		{...rest}
		el={otp.fieldEl}
		style={otp.fieldStyle}
		type="text"
		value={otp.value}
		maxlength={otp.length}
		disabled={otp.disabled}
		inputmode="numeric"
		autocomplete="one-time-code"
		onFocus={(event) => {
			// Focus lands the caret at offset 0, so without this the next keystroke prepends to the code already entered.
			// `event.target` and `instanceof`: a resumed handler runs after dispatch, when `currentTarget` is null, and this body is re-parsed as JavaScript, where a cast would throw.
			const field = event.target;
			if (field instanceof HTMLInputElement) {
				const end = field.value.length;
				field.setSelectionRange(end, end);
			}
			onFocus?.(event);
		}}
		onInput={(event) => {
			// `currentTarget` is live here because this handler is never resumed.
			otp.value = event.currentTarget.value;
			otp.commit();
			onInput?.(event);
		}}
	/>
}

// aria-hidden: the input already carries the code, so an exposed item would put every character in the tree twice.
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

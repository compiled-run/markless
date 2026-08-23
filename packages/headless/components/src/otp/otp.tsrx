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
			// Zero-arg by choice, not by force: MARKLESS_CAPTURE_OPAQUE_PROP no
			// longer refuses a parameterised shared method here (measured 2026-08-23,
			// note.md). Reading otp.value back keeps the write in one place.
			commit() {
				// `maxlength` truncates typing, but a pasted or autofilled string is
				// not truncated by the platform, so the slice is what enforces it.
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
export function OtpField({ onInput, onFocus, ...rest }: OtpFieldProps) @{
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
		onFocus={(event) => {
			// Focus lands the caret at offset 0 on a field that already holds a
			// code, so the next keystroke would prepend. QDS's policy, same here:
			// the caret goes to the end of what is typed so far. `event.target`,
			// not `currentTarget` or `otp.fieldEl`: a resumed event has finished
			// dispatching (currentTarget is null) and the handle is not rebound
			// to the served node, so the target is the only live handle here.
			// instanceof, not a cast: the capture analysis parses this body with a
			// JavaScript-only parser, so a type annotation would throw the parse.
			const field = event.target;
			if (field instanceof HTMLInputElement) {
				const end = field.value.length;
				field.setSelectionRange(end, end);
			}
			onFocus?.(event);
		}}
		onInput={(event) => {
			// currentTarget is live here only because this handler is not resumed;
			// after SSR resume it is null, which is why onFocus uses event.target.
			otp.value = event.currentTarget.value;
			otp.commit();
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

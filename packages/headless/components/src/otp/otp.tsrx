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
			// The field covers the root instead of sitting beside the boxes, so a
			// click or tap anywhere on them lands on the one real input. Invisible
			// has to stay interactive, which rules out `visibility` and `display`.
			// The strings are written out in full because this body is lifted into
			// its own symbol, where a module constant cannot be read.
			fieldStyle: computed(() => {
				// `box-sizing`: an input's own border and padding would otherwise be
				// added to the 100%, leaving the field a few pixels past the boxes.
				if (!otp.shiftPWManagers) {
					return 'position: absolute; inset: 0; box-sizing: border-box; height: 100%; width: 100%; opacity: 0;';
				}
				// A password manager paints its icon at the input's right edge. The
				// input is widened past the root and that strip clipped away, which
				// takes the icon off the boxes; a clipped strip catches no clicks.
				return 'position: absolute; inset: 0; box-sizing: border-box; height: 100%; width: calc(100% + 45px); opacity: 0; clip-path: inset(0 45px 0 0);';
			}),
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

// One tab stop, one accessibility-tree control, one paste target. A consumer's
// `onInput` runs after the family has taken the value.
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
			// Focus lands the caret at offset 0, so without this the next keystroke
			// would prepend to a code already entered.
			// `event.target`: a resumed handler runs after the event has finished
			// dispatching, so `currentTarget` is null and `otp.fieldEl` is unbound.
			// `instanceof` rather than a cast: this body is parsed as JavaScript, so
			// a type annotation here would fail the parse.
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

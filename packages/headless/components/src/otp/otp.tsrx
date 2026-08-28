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
			value: '',
			disabled: false,
			shiftPWManagers: true,
		});
		const fieldEl = element<HTMLInputElement>();
		const itemEls = element<HTMLDivElement[]>();

		return {
			...otp,
			fieldEl,
			itemEls,
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
			commit(boxes: number) {
				// A count rendered before its boxes existed is patched into the payload as text, so it is coerced before the comparison below.
				const length = Number(boxes);
				// `maxlength` truncates typing but not a paste or autofill, so the slice is what enforces the length.
				const code = otp.value.slice(0, length);
				otp.value = code;
				otp.onChange?.(code);
				if (code.length === length) otp.onComplete?.(code);
			},
		};
	},
	{ scope: 'widget' },
);

export function OtpRoot({
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
	otp.value = value;
	otp.disabled = disabled;
	otp.shiftPWManagers = shiftPWManagers;

	// Positioned so the field stretches over these boxes and nothing else.
	<div {...rest} style="position: relative;" ui-disabled={otp.disabled}>{children}</div>
}

export function OtpField({ onInput, onFocus, ...rest }: OtpFieldProps) @{
	const otp = otpState();
	// The length of the code is how many boxes the consumer wrote, and the field asks for it before a single box has rendered.
	const boxes = computed(() => otp.itemEls.length);

	<input
		{...rest}
		el={otp.fieldEl}
		style={otp.fieldStyle}
		type="text"
		value={otp.value}
		maxlength={boxes}
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
			otp.commit(boxes);
			onInput?.(event);
		}}
	/>
}

export function OtpItem({ children, ...rest }: OtpItemProps) @{
	const otp = otpState();
	const mine = element<HTMLDivElement>();
	// Which box this is, is where it stands among the boxes: nobody counts them out.
	const at = computed(() => otp.itemEls.indexOf(mine as HTMLDivElement));
	// slice, not value[at]: a graph read path has to be statically resolvable
	const char = computed(() => otp.value.slice(at, at + 1));

	<div
		{...rest}
		el={[otp.itemEls, mine]}
		ui-empty={char === ''}
		ui-disabled={otp.disabled}
	>{char}{children}</div>
}

export function OtpItemIndicator({ children, ...rest }: OtpItemIndicatorProps) @{
	<span {...rest}>{children}</span>
}

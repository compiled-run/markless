import { computed, element, shared, state } from '@markless/core';
import VisuallyHidden from '../base/visually-hidden.tsrx';
import {
	HOLD_DELAY_MS,
	REPEAT_MS,
	announcedText,
	canonicalText,
	caretAfterRefusal,
	clampTo,
	committedValue,
	formatNumber,
	heldNumber,
	keptText,
	liveNumber,
	shownText,
	steppedValue,
	typedNumber,
} from './numberbox-math.ts';
import type {
	NumberboxBackTriggerProps,
	NumberboxDescriptionProps,
	NumberboxErrorProps,
	NumberboxFieldProps,
	NumberboxForwardTriggerProps,
	NumberboxInputProps,
	NumberboxInstanceState,
	NumberboxLabelProps,
	NumberboxRootProps,
	NumberboxValueLabelProps,
} from './numberbox-types.ts';

// One computed() cell per derivation, and every one of them re-reads the number
// out of the four cells rather than out of a neighbour: the copy that carries a
// computed's body does not carry its siblings.

export const numberboxState = shared(
	() => {
		const numberbox: NumberboxInstanceState = state({
			seed: null,
			typed: null,
			held: null,
			settled: false,
			min: undefined,
			max: undefined,
			step: 1,
			currency: '',
			disabled: false,
			readonly: false,
			required: false,
			invalidProp: false,
			errored: false,
			name: '',
			spoken: '',
			repeater: 0,
			repeats: 0,
			repeatUp: true,
		});
		const inputEl = element<HTMLInputElement>();
		const labelEl = element<HTMLLabelElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();

		const value = computed(() =>
			heldNumber(
				numberbox.typed,
				numberbox.settled,
				numberbox.held,
				numberbox.seed,
				numberbox.currency,
			),
		);
		const text = computed(() =>
			shownText(
				numberbox.typed,
				numberbox.settled,
				numberbox.held,
				numberbox.seed,
				numberbox.step,
				numberbox.currency,
			),
		);
		const valuetext = computed(() =>
			announcedText(
				shownText(
					numberbox.typed,
					numberbox.settled,
					numberbox.held,
					numberbox.seed,
					numberbox.step,
					numberbox.currency,
				),
			),
		);
		// What the input's `value` binding carries: the settled number, formatted, and
		// never the half-typed text. A person's keystrokes reach the element before
		// the graph hears about them, so a binding that followed the typing would
		// patch an older string back over a newer one; every settled write below
		// goes straight at the element instead.
		const shown = computed(() =>
			formatNumber(
				numberbox.settled ? numberbox.held : numberbox.seed,
				numberbox.step,
				numberbox.currency,
			),
		);
		const isEmpty = computed(
			() =>
				heldNumber(
					numberbox.typed,
					numberbox.settled,
					numberbox.held,
					numberbox.seed,
					numberbox.currency,
				) === null,
		);
		// Two cells, one answer: the root's prop and the mounted error part each set
		// their own, so a part can make the field stricter and a re-render of either
		// one cannot take back what the other said.
		const invalid = computed(() => numberbox.invalidProp || numberbox.errored);
		// A bound is a graph cell of its own rather than a `!== undefined` written in
		// the guard: `Home` and `End` are inert without one, and a browser-critical
		// condition is only hoistable when it is a truthy read of graph state.
		const hasMin = computed(() => numberbox.min !== undefined);
		const hasMax = computed(() => numberbox.max !== undefined);
		const atBackBound = computed(() => {
			const low = numberbox.min;
			if (low === undefined) return false;

			const now = heldNumber(
				numberbox.typed,
				numberbox.settled,
				numberbox.held,
				numberbox.seed,
				numberbox.currency,
			);
			return now !== null && now <= low;
		});
		const atForwardBound = computed(() => {
			const high = numberbox.max;
			if (high === undefined) return false;

			const now = heldNumber(
				numberbox.typed,
				numberbox.settled,
				numberbox.held,
				numberbox.seed,
				numberbox.currency,
			);
			return now !== null && now >= high;
		});

		return {
			...numberbox,
			inputEl,
			labelEl,
			descriptionEl,
			errorEl,
			value,
			text,
			shown,
			valuetext,
			isEmpty,
			invalid,
			hasMin,
			hasMax,
			atBackBound,
			atForwardBound,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: number | null) => void) | undefined,

			/**
			 * Settle on a number, clamped into range. Spelled `settle` and not `set`: the
			 * compiler reads `x.set(...)` as a Map or Set mutation, so no shared method
			 * may carry that name.
			 */
			settle(from: EventTarget | null, next: number | null) {
				if (numberbox.disabled || numberbox.readonly) return;

				const box = from as HTMLInputElement | null;

				const before = numberbox.settled ? numberbox.held : numberbox.seed;
				const landed =
					next === null ? null : clampTo(next, numberbox.min, numberbox.max);
				numberbox.held = landed;
				numberbox.settled = true;
				numberbox.typed = null;
				if (box) box.value = formatNumber(landed, numberbox.step, numberbox.currency);
				numberbox.spoken = announcedText(
					formatNumber(landed, numberbox.step, numberbox.currency),
				);
				if (landed !== before) numberbox.onChange?.(landed);
			},

			/**
			 * Take what has been typed as the settled number: clamped into range,
			 * rounded to the currency's own scale when there is one, and shown
			 * formatted from here on.
			 */
			commit(from: EventTarget | null) {
				if (numberbox.disabled || numberbox.readonly) return;

				// The element off the event, never the handle: a bound element's own
				// properties are the graph's to write, and mid-edit the element is ahead
				// of the graph anyway.
				const box = from as HTMLInputElement | null;

				const before = numberbox.settled ? numberbox.held : numberbox.seed;
				const landed = committedValue(
					typedNumber(
						box?.value,
						numberbox.typed,
						numberbox.settled,
						numberbox.held,
						numberbox.seed,
						numberbox.currency,
					),
					numberbox.min,
					numberbox.max,
					numberbox.step,
					numberbox.currency,
				);
				numberbox.held = landed;
				numberbox.settled = true;
				numberbox.typed = null;
				if (box) box.value = formatNumber(landed, numberbox.step, numberbox.currency);
				numberbox.spoken = announcedText(
					formatNumber(landed, numberbox.step, numberbox.currency),
				);
				if (landed !== before) numberbox.onChange?.(landed);
			},

			increment(from: EventTarget | null, big: boolean) {
				if (numberbox.disabled || numberbox.readonly) return;

				// The element off the event, never the handle: a bound element's own
				// properties are the graph's to write, and mid-edit the element is ahead
				// of the graph anyway.
				const box = from as HTMLInputElement | null;

				const before = numberbox.settled ? numberbox.held : numberbox.seed;
				const landed = steppedValue(
					liveNumber(
						box?.value,
						numberbox.typed,
						numberbox.settled,
						numberbox.held,
						numberbox.seed,
						numberbox.currency,
					),
					true,
					big,
					numberbox.min,
					numberbox.max,
					numberbox.step,
				);
				numberbox.held = landed;
				numberbox.settled = true;
				numberbox.typed = null;
				if (box) box.value = formatNumber(landed, numberbox.step, numberbox.currency);
				numberbox.spoken = announcedText(
					formatNumber(landed, numberbox.step, numberbox.currency),
				);
				if (landed !== before) numberbox.onChange?.(landed);
			},

			decrement(from: EventTarget | null, big: boolean) {
				if (numberbox.disabled || numberbox.readonly) return;

				// The element off the event, never the handle: a bound element's own
				// properties are the graph's to write, and mid-edit the element is ahead
				// of the graph anyway.
				const box = from as HTMLInputElement | null;

				const before = numberbox.settled ? numberbox.held : numberbox.seed;
				const landed = steppedValue(
					liveNumber(
						box?.value,
						numberbox.typed,
						numberbox.settled,
						numberbox.held,
						numberbox.seed,
						numberbox.currency,
					),
					false,
					big,
					numberbox.min,
					numberbox.max,
					numberbox.step,
				);
				numberbox.held = landed;
				numberbox.settled = true;
				numberbox.typed = null;
				if (box) box.value = formatNumber(landed, numberbox.step, numberbox.currency);
				numberbox.spoken = announcedText(
					formatNumber(landed, numberbox.step, numberbox.currency),
				);
				if (landed !== before) numberbox.onChange?.(landed);
			},

			/**
			 * What the person typed, vetted. A refused keystroke is put back rather
			 * than prevented: the compiler hoists a `preventDefault` only when its
			 * condition is graph state and event-field equality, and "is this
			 * character part of a number in this locale" is neither.
			 *
			 * `event.target`, never `currentTarget`: a dispatch runs after the browser
			 * has finished with the event, and `currentTarget` is null by then.
			 */
			type(from: EventTarget | null) {
				const input = from as HTMLInputElement | null;
				if (!input) return;

				const showing = shownText(
					numberbox.typed,
					numberbox.settled,
					numberbox.held,
					numberbox.seed,
					numberbox.step,
					numberbox.currency,
				);
				if (numberbox.disabled || numberbox.readonly) {
					input.value = showing;
					return;
				}

				const raw = input.value;
				const kept = keptText(
					raw,
					numberbox.min,
					numberbox.max,
					numberbox.step,
					numberbox.currency,
				);
				numberbox.typed = kept;
				if (kept === raw) return;

				const caret = caretAfterRefusal(input.selectionStart, raw.length, kept.length);
				input.value = kept;
				input.setSelectionRange(caret, caret);
			},

			/** Focusing a field that already holds a number puts the caret after it. */
			land(from: EventTarget | null) {
				const input = from as HTMLInputElement | null;
				if (!input) return;

				const at = input.value.length;
				input.setSelectionRange(at, at);
			},

			/**
			 * A trigger press: one step at once, then a repeat that waits before it
			 * starts. Announcements are suppressed while it runs - at 50 ms a reader
			 * would be interrupted forty times in two seconds and finish none - and
			 * `release` speaks the value the hold landed on.
			 */
			press(up: boolean, mouse: boolean) {
				if (numberbox.disabled || numberbox.readonly) return;

				// The handle as a local first: a handler module cannot name a graph
				// binding directly. It is only ever read here - a bound element's own
				// properties are the graph's to write.
				const held = inputEl;

				// A mouse press works the input, so focus lands there; a touch or
				// reader press leaves focus on the button, where no soft keyboard
				// appears and the reader cursor stays put.
				if (mouse) held?.focus();

				const before = numberbox.settled ? numberbox.held : numberbox.seed;
				const landed = steppedValue(
					liveNumber(
						held?.value,
						numberbox.typed,
						numberbox.settled,
						numberbox.held,
						numberbox.seed,
						numberbox.currency,
					),
					up,
					false,
					numberbox.min,
					numberbox.max,
					numberbox.step,
				);
				numberbox.held = landed;
				numberbox.settled = true;
				numberbox.typed = null;
				numberbox.spoken = announcedText(
					formatNumber(landed, numberbox.step, numberbox.currency),
				);
				if (landed !== before) numberbox.onChange?.(landed);

				numberbox.repeatUp = up;
				numberbox.repeats = 0;
				window.clearInterval(numberbox.repeater);
				// One clock rather than a delay that starts another: a scheduled
				// callback reaches the graph from here, and one timer is one thing to
				// cancel however the press ends.
				numberbox.repeater = window.setInterval(() => {
					numberbox.repeats = numberbox.repeats + 1;
					if (numberbox.repeats * REPEAT_MS < HOLD_DELAY_MS) return;

					const from = heldNumber(
						numberbox.typed,
						numberbox.settled,
						numberbox.held,
						numberbox.seed,
						numberbox.currency,
					);
					const next = steppedValue(
						from,
						numberbox.repeatUp,
						false,
						numberbox.min,
						numberbox.max,
						numberbox.step,
					);
					if (next === from) {
						// The bound: the clock stops rather than spinning against a clamp.
						window.clearInterval(numberbox.repeater);
						numberbox.repeater = 0;
						numberbox.spoken = announcedText(
							formatNumber(next, numberbox.step, numberbox.currency),
						);
						return;
					}

					numberbox.held = next;
					numberbox.settled = true;
					numberbox.typed = null;
					numberbox.onChange?.(next);
				}, REPEAT_MS);
			},

			release() {
				if (numberbox.repeater === 0) return;

				window.clearInterval(numberbox.repeater);
				numberbox.repeater = 0;
				numberbox.repeats = 0;
				numberbox.spoken = announcedText(
					formatNumber(
						numberbox.settled ? numberbox.held : numberbox.seed,
						numberbox.step,
						numberbox.currency,
					),
				);
			},
		};
	},
	{ scope: 'widget' },
);

export function NumberboxRoot({
	value = null,
	min,
	max,
	step = 1,
	currency = '',
	disabled = false,
	readonly = false,
	required = false,
	invalid = false,
	name = '',
	onChange,
	children,
	...rest
}: NumberboxRootProps) @{
	const numberbox = numberboxState();
	numberbox.onChange = onChange;
	numberbox.seed = value;
	numberbox.min = min;
	numberbox.max = max;
	numberbox.step = step;
	numberbox.currency = currency;
	numberbox.disabled = disabled;
	numberbox.readonly = readonly;
	numberbox.required = required;
	numberbox.invalidProp = invalid;
	numberbox.name = name;

	<div
		{...rest}
		ui-disabled={numberbox.disabled}
		ui-readonly={numberbox.readonly}
		ui-required={numberbox.required}
		ui-invalid={numberbox.invalid}
		ui-empty={numberbox.isEmpty}
	>
		{/* Always rendered, not a part: an announcement a consumer has to remember to
		    mount is not a guarantee. With no `role="spinbutton"` this is the only thing
		    that speaks a stepped value on a reader that ignores a re-displayed input. */}
		<VisuallyHidden>
			<output aria-live="assertive" aria-atomic="true">{numberbox.spoken}</output>
		</VisuallyHidden>
		{children}
	</div>
}

export function NumberboxLabel({ children, ...rest }: NumberboxLabelProps) @{
	const numberbox = numberboxState();

	<label
		{...rest}
		el={numberbox.labelEl}
		for={numberbox.inputEl}
		ui-disabled={numberbox.disabled}
	>{children}</label>
}

// A restriction set on this part is added to whatever the root set: `||`, never a
// replacement, so a part can make the control stricter and never looser.
export function NumberboxInput({
	disabled,
	readonly,
	required,
	onInput,
	onKeydown,
	onBlur,
	onFocus,
	...rest
}: NumberboxInputProps) @{
	const numberbox = numberboxState();
	const ariaInvalid = computed(() => (numberbox.invalid ? 'true' : undefined));

	// No `role="spinbutton"`: it cannot be focused with VoiceOver, and this control
	// is real editable text. The range reaches a reader through `description`.
	<input
		{...rest}
		el={numberbox.inputEl}
		type="text"
		inputmode="decimal"
		autocomplete="off"
		spellcheck={false}
		aria-roledescription="number field"
		aria-describedby={[numberbox.errorEl, numberbox.descriptionEl]}
		aria-invalid={ariaInvalid}
		value={numberbox.shown}
		disabled={numberbox.disabled || disabled === true}
		readonly={numberbox.readonly || readonly === true}
		required={numberbox.required || required === true}
		onKeydown={(event) => {
			// Guarded by event fields and graph state alone, the only shapes a
			// browser-critical policy can be hoisted from. `Enter` is deliberately
			// absent: a numberbox inside a form still submits it, with the committed
			// value already in the hidden field.
			if (
				event.key === 'ArrowUp' ||
				event.key === 'ArrowDown' ||
				event.key === 'PageUp' ||
				event.key === 'PageDown' ||
				(event.key === 'Home' && numberbox.hasMin) ||
				(event.key === 'End' && numberbox.hasMax)
			) {
				event.preventDefault();
			}

			if (event.key === 'ArrowUp') numberbox.increment(event.target, event.shiftKey);
			else if (event.key === 'ArrowDown') numberbox.decrement(event.target, event.shiftKey);
			else if (event.key === 'PageUp') numberbox.increment(event.target, true);
			else if (event.key === 'PageDown') numberbox.decrement(event.target, true);
			else if (event.key === 'Home' && numberbox.hasMin) numberbox.settle(event.target, numberbox.min ?? null);
			else if (event.key === 'End' && numberbox.hasMax) numberbox.settle(event.target, numberbox.max ?? null);
			else if (event.key === 'Enter') numberbox.commit(event.target);

			onKeydown?.(event);
		}}
		onInput={(event) => {
			numberbox.type(event.target);
			onInput?.(event);
		}}
		onFocus={(event) => {
			numberbox.land(event.target);
			onFocus?.(event);
		}}
		onBlur={(event) => {
			numberbox.commit(event.target);
			onBlur?.(event);
		}}
	/>
}

export function NumberboxBackTrigger({
	children,
	onPointerdown,
	onPointerup,
	onPointerleave,
	onPointercancel,
	...rest
}: NumberboxBackTriggerProps) @{
	const numberbox = numberboxState();
	const isOff = computed(() => numberbox.disabled || numberbox.readonly || numberbox.atBackBound);

	<button
		{...rest}
		type="button"
		tabindex={-1}
		aria-label="Decrease"
		aria-controls={numberbox.inputEl}
		disabled={isOff}
		ui-disabled={isOff}
		onPointerdown={(event) => {
			numberbox.press(false, event.pointerType === 'mouse');
			onPointerdown?.(event);
		}}
		onPointerup={(event) => {
			numberbox.release();
			onPointerup?.(event);
		}}
		onPointerleave={(event) => {
			numberbox.release();
			onPointerleave?.(event);
		}}
		onPointercancel={(event) => {
			numberbox.release();
			onPointercancel?.(event);
		}}
	>{children}</button>
}

export function NumberboxForwardTrigger({
	children,
	onPointerdown,
	onPointerup,
	onPointerleave,
	onPointercancel,
	...rest
}: NumberboxForwardTriggerProps) @{
	const numberbox = numberboxState();
	const isOff = computed(
		() => numberbox.disabled || numberbox.readonly || numberbox.atForwardBound,
	);

	<button
		{...rest}
		type="button"
		tabindex={-1}
		aria-label="Increase"
		aria-controls={numberbox.inputEl}
		disabled={isOff}
		ui-disabled={isOff}
		onPointerdown={(event) => {
			numberbox.press(true, event.pointerType === 'mouse');
			onPointerdown?.(event);
		}}
		onPointerup={(event) => {
			numberbox.release();
			onPointerup?.(event);
		}}
		onPointerleave={(event) => {
			numberbox.release();
			onPointerleave?.(event);
		}}
		onPointercancel={(event) => {
			numberbox.release();
			onPointercancel?.(event);
		}}
	>{children}</button>
}

// Renders the value rather than accepting children: a part cannot tell whether it
// was given any, so a fallback branch would render nothing for everybody.
export function NumberboxValueLabel({ ...rest }: NumberboxValueLabelProps) @{
	const numberbox = numberboxState();

	<output
		{...rest}
		ui-value={numberbox.shown}
		ui-disabled={numberbox.disabled}
	>{numberbox.shown}</output>
}

export function NumberboxDescription({ children, ...rest }: NumberboxDescriptionProps) @{
	const numberbox = numberboxState();

	<div {...rest} el={numberbox.descriptionEl}>{children}</div>
}

export function NumberboxError({ children, ...rest }: NumberboxErrorProps) @{
	const numberbox = numberboxState();
	// Mounting the error part is what marks the field invalid: two cells rather than
	// one, so a re-render of the root cannot take back what this part set.
	numberbox.errored = true;

	<div {...rest} el={numberbox.errorEl}>{children}</div>
}

// No handler of its own: the input is clipped, aria-hidden and out of the tab
// order, so nothing but the family ever changes it.
export function NumberboxField({ ...rest }: NumberboxFieldProps) @{
	const numberbox = numberboxState();
	const submitted = computed(() =>
		canonicalText(
			heldNumber(
				numberbox.typed,
				numberbox.settled,
				numberbox.held,
				numberbox.seed,
				numberbox.currency,
			),
		),
	);

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			tabindex={-1}
			aria-hidden="true"
			name={numberbox.name}
			value={submitted}
			required={numberbox.required}
			disabled={numberbox.disabled}
		/>
	</VisuallyHidden>
}

import { computed, element, shared, state } from '@markless/core';
import {
	caretOffset,
	caretToEndOf,
	elementAt,
	readValue,
	rectBehindCaret,
	selectionRange,
} from './token-range.ts';
import {
	flatten,
	insertText as textInto,
	insertToken as tokenInto,
	removeToken as withoutToken,
	rosterIndex,
	same,
	textOf,
	serialize,
	triggerAt,
	valueOf,
	withIds,
} from './token-walk.ts';
import type {
	TokenBoxDescriptionProps,
	TokenBoxErrorProps,
	TokenBoxFieldProps,
	TokenBoxInputProps,
	TokenBoxInstanceState,
	TokenBoxItemInstanceState,
	TokenBoxItemTriggerProps,
	TokenBoxKeyedSegment,
	TokenBoxLabelProps,
	TokenBoxRootProps,
	TokenBoxSegment,
} from './tokenbox-types.ts';

// The v1 bet, in one place: the browser owns text editing and this family owns
// structure. `segments` is written only when the family changes the shape of the
// value - a seed, an external `value`, a token, a paste - because writing it
// re-renders the surface, and re-rendering a contenteditable moves the caret out
// from under the person typing. Ordinary typing is derived back off the DOM
// through Ranges instead, into `reported`, which is what the form field submits.
// `note.md` records what that buys and what it costs.

export const tokenboxState = shared(
	() => {
		const tokenbox: TokenBoxInstanceState = state({
			disabled: false,
			required: false,
			invalid: false,
			multiline: false,
			triggers: [] as readonly string[],
			name: '',
			segments: [] as readonly TokenBoxKeyedSegment[],
			reported: [] as readonly TokenBoxKeyedSegment[],
			trigger: undefined as TokenBoxInstanceState['trigger'],
			composing: false,
			seeded: false,
		});
		const labelEl = element<HTMLLabelElement>();
		const surfaceEl = element<HTMLDivElement>();
		const descriptionEl = element<HTMLDivElement>();
		const errorEl = element<HTMLDivElement>();
		// The array type argument is what makes these plural: one handle bound on
		// every rendered run, read back in document order. A segment's place in its
		// own kind's roster IS its model position, which is how a caret reaches an
		// element without any run carrying an identity attribute.
		const tokenEls = element<HTMLSpanElement[]>();
		const textEls = element<HTMLSpanElement[]>();

		return {
			...tokenbox,
			labelEl,
			surfaceEl,
			descriptionEl,
			errorEl,
			tokenEls,
			textEls,
			// literal function type: a callback slot is only recognised from the written annotation
			onChange: undefined as ((value: readonly TokenBoxKeyedSegment[]) => void) | undefined,

			/** What the box starts with, taken once. The root calls it; nothing else should. */
			seed(initial: readonly TokenBoxSegment[] | undefined) {
				if (tokenbox.seeded || initial === undefined) return;
				const next = withIds(initial);
				tokenbox.seeded = true;
				tokenbox.reported = next;
				tokenbox.segments = next;
			},

			/** Take a controlled value, passing over an array this family itself emitted. */
			adopt(value: readonly TokenBoxSegment[] | undefined) {
				if (value === undefined || value === tokenbox.reported) return;
				const next = withIds(value);
				if (same(next, tokenbox.reported)) return;
				tokenbox.reported = next;
				tokenbox.segments = next;
			},

			/**
			 * Take what the surface is showing as the value, and report it.
			 *
			 * No re-render: the DOM is already right, and this is the path every
			 * keystroke, every delete and every mobile autocorrect arrives on.
			 */
			settle() {
				const surface = surfaceEl;
				const tokens = tokenEls;
				if (surface === undefined || tokenbox.composing) return;
				const next = readValue(surface, tokens);
				const caret = caretOffset(surface);
				const found = caret === undefined ? undefined : triggerAt(next, caret, tokenbox.triggers);
				tokenbox.trigger =
					found === undefined
						? undefined
						: { ...found, rect: rectBehindCaret(surface, found.end - found.start) };
				if (same(next, tokenbox.reported)) return;
				tokenbox.reported = next;
				tokenbox.onChange?.(next);
			},

			/**
			 * Put a token where the caret is, taking the trigger's text with it.
			 *
			 * This is the hook a mention or slash-command popover is built on: read
			 * `trigger` for what to search, call this with what was chosen.
			 */
			insertToken(value: string, label: string) {
				const surface = surfaceEl;
				const tokens = tokenEls;
				if (surface === undefined || tokenbox.disabled) return;
				const current = readValue(surface, tokens);
				const found = tokenbox.trigger;
				const caret = selectionRange(surface);
				const end = flatten(current).length;
				const edit = tokenInto(
					current,
					found?.start ?? caret?.start ?? end,
					found?.end ?? caret?.end ?? end,
					value,
					label,
				);
				tokenbox.reported = edit.segments;
				tokenbox.segments = edit.segments;
				tokenbox.trigger = undefined;
				tokenbox.onChange?.(edit.segments);
				// Read after the write: the roster holds the runs the repeat just rendered.
				const runs = textEls;
				const landing = elementAt(runs, rosterIndex(edit.segments, edit.at));
				if (landing !== undefined) caretToEndOf(landing);
			},

			/** Take every token carrying this value back out of the box. */
			removeToken(value: string) {
				const surface = surfaceEl;
				const tokens = tokenEls;
				const current = surface === undefined ? tokenbox.reported : readValue(surface, tokens);
				const next = withoutToken(current, value);
				if (same(next, tokenbox.reported)) return;
				tokenbox.reported = next;
				tokenbox.segments = next;
				tokenbox.onChange?.(next);
			},

			/**
			 * Put plain text where the selection is. Every paste and drop goes through
			 * here, which is what makes the box plain-text-only: the clipboard's
			 * `text/html` is never read, so there is nothing to sanitise.
			 */
			insertText(text: string) {
				const surface = surfaceEl;
				const tokens = tokenEls;
				if (surface === undefined || tokenbox.disabled || text === '') return;
				const flat = tokenbox.multiline === true ? text : text.replace(/\s*\n\s*/g, ' ');
				const current = readValue(surface, tokens);
				const end = flatten(current).length;
				const caret = selectionRange(surface);
				const edit = textInto(current, caret?.start ?? end, caret?.end ?? end, flat);
				tokenbox.reported = edit.segments;
				tokenbox.segments = edit.segments;
				tokenbox.trigger = undefined;
				tokenbox.onChange?.(edit.segments);
				const runs = textEls;
				const landing = elementAt(runs, rosterIndex(edit.segments, edit.at));
				if (landing !== undefined) caretToEndOf(landing);
			},

		};
	},
	{ scope: 'widget' },
);

/** One instance per rendered `tokenbox.itemtrigger`. */
export const tokenboxItemState = shared(
	() => {
		const item: TokenBoxItemInstanceState = state({ value: '', label: '' });

		return { ...item };
	},
	{ scope: 'widget' },
);

// No role on the root. The surface below is the textbox, so a group here would
// be a second thing for a reader to walk past on the way to the field.
export function TokenBoxRoot({
	value,
	defaultValue,
	disabled = false,
	required = false,
	invalid = false,
	multiline = false,
	triggers = [],
	name = '',
	onChange,
	children,
	...rest
}: TokenBoxRootProps) @{
	const tokenbox = tokenboxState();
	tokenbox.onChange = onChange;
	tokenbox.disabled = disabled;
	tokenbox.required = required;
	tokenbox.invalid = invalid;
	tokenbox.multiline = multiline;
	tokenbox.triggers = triggers;
	tokenbox.name = name;
	tokenbox.seed(defaultValue);
	tokenbox.adopt(value);

	<div
		{...rest}
		ui-tokenbox={true}
		ui-disabled={tokenbox.disabled}
		ui-required={tokenbox.required}
		ui-invalid={tokenbox.invalid}
		ui-empty={tokenbox.reported.length === 0}
	>
		{/* The defaults live here rather than on the surface: a <style> element
		    inside a contenteditable is editable content. */}
		<style>
			@layer markless {
				[ui-editor] { white-space: pre-wrap; }
				/* user-select is deliberately left at its default: any other value
				   changes how the caret steps past the island, and the island's own
				   traversal is the whole atomicity story. */
				[ui-token] { white-space: nowrap; }
			}
		</style>
		{children}
	</div>
}

// A `for` cannot reach a contenteditable div - it is not a labelable element -
// so the click that a `for` would have handled is handled here, and the name
// reaches the surface through `aria-labelledby`.
export function TokenBoxLabel({ children, onClick, ...rest }: TokenBoxLabelProps) @{
	const tokenbox = tokenboxState();

	<label
		{...rest}
		el={tokenbox.labelEl}
		onClick={(event) => {
			const surface = tokenbox.surfaceEl;
			surface?.focus();
			onClick?.(event);
		}}
	>{children}</label>
}

/**
 * The editing surface. It renders the value itself: tokens as
 * `contenteditable="false"` islands, which is what makes them atomic to the
 * browser's own editing engine rather than to key handling this family would
 * have to write.
 */
export function TokenBoxInput({
	children,
	onBeforeinput,
	onInput,
	onPaste,
	onCompositionstart,
	onCompositionend,
	onKeyup,
	onClick,
	onFocus,
	...rest
}: TokenBoxInputProps) @{
	const tokenbox = tokenboxState();

	<div
		{...rest}
		el={tokenbox.surfaceEl}
		role="textbox"
		ui-editor={true}
		contenteditable={tokenbox.disabled === true ? 'false' : 'true'}
		tabindex={0}
		aria-labelledby={tokenbox.labelEl}
		// Error before description: what is wrong is conveyed before the hint,
		// wherever the two parts sit in the page.
		aria-describedby={[tokenbox.errorEl, tokenbox.descriptionEl]}
		aria-multiline={tokenbox.multiline === true ? 'true' : 'false'}
		aria-invalid={tokenbox.invalid ? 'true' : 'false'}
		aria-required={tokenbox.required ? 'true' : 'false'}
		aria-disabled={tokenbox.disabled ? 'true' : 'false'}
		ui-empty={tokenbox.reported.length === 0}
		// Written out from event fields and graph state alone: the cancel has to be
		// readable before the handler symbol loads. Nothing about a caret's
		// neighbours can appear here, which is exactly why deletion is left to the
		// browser - a contenteditable="false" island already deletes as one unit.
		onBeforeinput={(event) => {
			if (
				tokenbox.disabled ||
				event.inputType === 'insertFromDrop' ||
				(event.inputType === 'insertParagraph' && event.isComposing === false && !tokenbox.multiline) ||
				(event.inputType === 'insertLineBreak' && event.isComposing === false && !tokenbox.multiline)
			) {
				event.preventDefault();
			}

			if (event.inputType === 'insertFromDrop' && tokenbox.disabled !== true) {
				const dropped = (event as InputEvent).dataTransfer?.getData('text/plain') ?? '';
				tokenbox.insertText(dropped);
			}
			onBeforeinput?.(event);
		}}
		// Unconditional, because the clipboard's own text is not something the
		// synchronous policy can see - and because there is no paste this family
		// wants the platform to perform. Plain text is read back and spliced in.
		onPaste={(event) => {
			event.preventDefault();
			const text = (event as ClipboardEvent).clipboardData?.getData('text') ?? '';
			tokenbox.insertText(text);
			onPaste?.(event);
		}}
		onInput={(event) => {
			tokenbox.settle();
			onInput?.(event);
		}}
		// Between these two the browser owns a region of the DOM. Nothing derives,
		// nothing reports and nothing re-renders while that is true; the whole
		// composition is taken once, at the end.
		onCompositionstart={(event) => {
			tokenbox.composing = true;
			onCompositionstart?.(event);
		}}
		onCompositionend={(event) => {
			tokenbox.composing = false;
			tokenbox.settle();
			onCompositionend?.(event);
		}}
		// A caret that moved without changing anything still changes what an
		// autocomplete should be showing.
		onKeyup={(event) => {
			tokenbox.settle();
			onKeyup?.(event);
		}}
		onClick={(event) => {
			tokenbox.settle();
			onClick?.(event);
		}}
		onFocus={(event) => {
			tokenbox.settle();
			onFocus?.(event);
		}}
	>
		{/* A token's label IS its text: that is what a reader speaks crossing it,
		    and what a copy of a range spanning it yields. */}
		@for (const segment of tokenbox.segments; key segment.id) {
			@if (segment.kind === 'token') {
				<span
					el={tokenbox.tokenEls}
					ui-token={true}
					ui-value={valueOf(segment)}
					contenteditable="false"
				>{textOf(segment)}</span>
			} @else {
				<span el={tokenbox.textEls} ui-text={true}>{textOf(segment)}</span>
			}
		}
		{children}
	</div>
}

// The insertion control, and the only route a consumer has to it: a shared()
// method call compiles by copying the method body into the caller's module, so
// `insertToken` cannot be called from a consumer's own handler. The family
// publishes the button instead; the consumer composes it into their popover.
export function TokenBoxItemTrigger({
	value,
	label,
	children,
	onClick,
	...rest
}: TokenBoxItemTriggerProps) @{
	const tokenbox = tokenboxState();
	const item = tokenboxItemState();
	item.value = value;
	item.label = label;

	<button
		{...rest}
		type="button"
		ui-value={item.value}
		disabled={tokenbox.disabled}
		onClick={(event) => {
			tokenbox.insertToken(item.value, item.label);
			onClick?.(event);
		}}
	>
		@if (children) {
			<>{children}</>
		} @else {
			<>{label}</>
		}
	</button>
}

export function TokenBoxDescription({ children, ...rest }: TokenBoxDescriptionProps) @{
	const tokenbox = tokenboxState();

	<div {...rest} el={tokenbox.descriptionEl}>{children}</div>
}

// `role="alert"` so the message is spoken when it appears.
export function TokenBoxError({ children, ...rest }: TokenBoxErrorProps) @{
	const tokenbox = tokenboxState();

	<div {...rest} el={tokenbox.errorEl} role="alert">{children}</div>
}

// One hidden input carrying the whole value as JSON. A flat delimited string was
// rejected: a token label may hold any character, so every delimiter needs an
// escape scheme, and an escape scheme is a worse contract than JSON.
export function TokenBoxField({ ...rest }: TokenBoxFieldProps) @{
	const tokenbox = tokenboxState();
	const payload = computed(() => serialize(tokenbox.reported));

	<div {...rest} role="presentation">
		<input type="hidden" name={tokenbox.name} value={payload} />
	</div>
}

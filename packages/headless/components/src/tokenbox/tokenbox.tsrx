import { computed, element, shared, state } from '@markless/core';
import {
	caretOffset,
	caretToEndOf,
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
	serialize,
	triggerAt,
	withIds,
} from './token-walk.ts';
import type {
	TokenBoxDescriptionProps,
	TokenBoxErrorProps,
	TokenBoxFieldProps,
	TokenBoxInputProps,
	TokenBoxInstanceState,
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

		// Deliberately NOT a cell. The root reads it to tell a consumer's echo apart
		// from a real external change, and a reactive read there would re-run the
		// root on every keystroke.
		const last = { value: [] as readonly TokenBoxKeyedSegment[], seeded: false };

		function publish(next: readonly TokenBoxKeyedSegment[], render: boolean) {
			last.value = next;
			tokenbox.reported = next;
			if (render) tokenbox.segments = next;
		}

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
				if (last.seeded || initial === undefined) return;
				last.seeded = true;
				publish(withIds(initial), true);
			},

			/**
			 * Take a controlled value. An array this family itself emitted is passed
			 * over — that is a consumer echoing `onChange` back, and re-rendering the
			 * surface for it would move the caret mid-word.
			 */
			adopt(value: readonly TokenBoxSegment[] | undefined) {
				if (value === undefined || value === last.value) return;
				const next = withIds(value);
				if (same(next, last.value)) return;
				publish(next, true);
			},

			/**
			 * Take what the surface is showing as the value, and report it.
			 *
			 * No re-render: the DOM is already right, and this is the path every
			 * keystroke, every delete and every mobile autocorrect arrives on.
			 */
			settle() {
				const surface = surfaceEl;
				if (surface === undefined || tokenbox.composing) return;
				const next = readValue(surface, tokenEls);
				const caret = caretOffset(surface);
				tokenbox.trigger =
					caret === undefined ? undefined : triggerAt(next, caret, tokenbox.triggers);
				if (same(next, last.value)) return;
				publish(next, false);
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
				if (surface === undefined || tokenbox.disabled) return;
				const current = readValue(surface, tokenEls);
				const context = tokenbox.trigger;
				const caret = selectionRange(surface);
				const end = flatten(current).length;
				const edit = tokenInto(
					current,
					context?.start ?? caret?.start ?? end,
					context?.end ?? caret?.end ?? end,
					value,
					label,
				);
				publish(edit.segments, true);
				tokenbox.trigger = undefined;
				tokenbox.onChange?.(edit.segments);
				// The write commits before the caret lands - the runtime's contract, not
				// a retry. The landing is the space the token brought with it: a caret
				// parked between a contenteditable="false" island and the end of the
				// host is a dead spot in every engine.
				const landing = textEls[rosterIndex(edit.segments, edit.at)];
				if (landing !== undefined) caretToEndOf(landing);
			},

			/** Take every token carrying this value back out of the box. */
			removeToken(value: string) {
				const surface = surfaceEl;
				const current = surface === undefined ? last.value : readValue(surface, tokenEls);
				const next = withoutToken(current, value);
				if (same(next, last.value)) return;
				publish(next, true);
				tokenbox.onChange?.(next);
			},

			/**
			 * Put plain text where the selection is. Every paste and drop goes through
			 * here, which is what makes the box plain-text-only: the clipboard's
			 * `text/html` is never read, so there is nothing to sanitise.
			 */
			insertText(text: string) {
				const surface = surfaceEl;
				if (surface === undefined || tokenbox.disabled || text === '') return;
				const flat = tokenbox.multiline === true ? text : text.replace(/\s*\n\s*/g, ' ');
				const current = readValue(surface, tokenEls);
				const end = flatten(current).length;
				const caret = selectionRange(surface);
				const edit = textInto(current, caret?.start ?? end, caret?.end ?? end, flat);
				publish(edit.segments, true);
				tokenbox.trigger = undefined;
				tokenbox.onChange?.(edit.segments);
				const landing = textEls[rosterIndex(edit.segments, edit.at)];
				if (landing !== undefined) caretToEndOf(landing);
			},

			/**
			 * Where the trigger run sits on screen, for a popover to be placed
			 * against. `undefined` when the caret is not in this box.
			 */
			anchorRect(): DOMRect | undefined {
				const surface = surfaceEl;
				if (surface === undefined) return undefined;
				const context = tokenbox.trigger;
				return rectBehindCaret(surface, context === undefined ? 0 : context.end - context.start);
			},
		};
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
			tokenbox.surfaceEl?.focus();
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
	// Flattened before the repeat so no branch inside it has to narrow a union:
	// one shape per run, whichever kind it came from.
	const runs = computed(() =>
		tokenbox.segments.map((segment) => ({
			id: segment.id,
			token: segment.kind === 'token',
			value: segment.kind === 'token' ? segment.value : '',
			text: segment.kind === 'token' ? segment.label : segment.text,
		})),
	);

	<div
		{...rest}
		el={tokenbox.surfaceEl}
		role="textbox"
		ui-editor={true}
		contenteditable={tokenbox.disabled !== true}
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
		@for (const run of runs; key run.id) {
			@if (run.token) {
				<span
					el={tokenbox.tokenEls}
					ui-token={true}
					ui-value={run.value}
					contenteditable={false}
				>{run.text}</span>
			} @else {
				<span el={tokenbox.textEls} ui-text={true}>{run.text}</span>
			}
		}
		{children}
	</div>
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

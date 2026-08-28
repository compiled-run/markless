import type { PropsOf, Seeded } from '@markless/core';

/**
 * One run of ordinary text in a tokenbox value.
 *
 * `id` is the family's own key for the rendered run. A consumer writing a
 * prefilled value leaves it out and the root mints one; a consumer echoing back
 * what `onChange` handed them keeps the one it carries, which is what stops an
 * echo from re-rendering the surface under the caret.
 */
export type TokenBoxTextSegment = {
	readonly kind: 'text';
	readonly text: string;
	readonly id?: string;
};

/**
 * One token: an atomic glyph inside the line of text.
 *
 * `value` is what the consumer gets back and what the token carries in the
 * markup; `label` is what is rendered, what a reader speaks crossing it, and
 * what a copy of a range spanning it yields. They are separate because a mention
 * reads "Alice Chen" and submits `u_412`.
 */
export type TokenBoxTokenSegment = {
	readonly kind: 'token';
	readonly value: string;
	readonly label: string;
	readonly id?: string;
};

/**
 * The whole value of a tokenbox: an interleaved sequence, in order. Free text is
 * part of the value — that is the inversion from taglist, whose value is a
 * `string[]` with the typed text held outside it.
 */
export type TokenBoxSegment = TokenBoxTextSegment | TokenBoxTokenSegment;

/** A segment after the root has minted its key: the shape `onChange` reports. */
export type TokenBoxKeyedSegment = TokenBoxSegment & { readonly id: string };

/**
 * Where an autocomplete popover belongs, and what to search for.
 *
 * `start` and `end` are character offsets in the flattened value: `start` is the
 * trigger character itself, `end` is the caret. `insertToken` replaces exactly
 * that range, so a consumer never computes an offset of its own.
 */
export type TokenBoxTrigger = {
	/** The one character that opened this context — `@`, `/`, whatever `triggers` holds. */
	readonly char: string;
	/** What has been typed since it, with no whitespace in it. */
	readonly query: string;
	/** The trigger character's offset in the flattened value. */
	readonly start: number;
	/** The caret's offset in the flattened value. */
	readonly end: number;
	/**
	 * Where the trigger run sits on screen, for a popover to be anchored against.
	 *
	 * Plain numbers rather than a `DOMRect`, because this rides in a graph cell
	 * that has to survive serialization. It spans trigger-to-caret when the
	 * caret's own text node holds those characters, and falls back to the
	 * collapsed caret rect when it does not — a worse anchor, never a wrong one.
	 */
	readonly rect: TokenBoxRect | undefined;
};

/** A screen rectangle as plain numbers, in viewport coordinates. */
export type TokenBoxRect = {
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
	readonly bottom: number;
	readonly right: number;
};

/**
 * A contenteditable `role="textbox"` whose value is text interrupted by atomic
 * tokens: mentions, slash commands, structured search, an AI prompt field.
 *
 * It is not a taglist with extra steps. The value model inverts (interleaved
 * text and tokens rather than a committed `string[]`), and the accessibility
 * contract inverts with it: one textbox whose tokens are atomic characters,
 * rather than a list with per-item focus and real delete buttons.
 *
 * **The v1 bet, worth knowing before you adopt it:** the browser owns text
 * editing and the family owns structure. Typing, deleting and composing run
 * natively and the value is derived back from the DOM afterwards; only token
 * insertion and paste rewrite the surface. `note.md` records what that buys and
 * what it costs.
 */
export type TokenBoxRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/**
	 * The value, in order. Omit it and the box starts empty.
	 *
	 * Hold it on a state object rather than building a fresh array literal each
	 * render: the root re-renders the surface when it is handed an array it did
	 * not itself emit, and re-rendering a contenteditable moves the caret.
	 */
	readonly value?: readonly TokenBoxSegment[];
	/**
	 * What the box starts with when nothing controls it. Read once, on the first
	 * render; after that the surface owns itself and reports out through
	 * `onChange`. Pass `value` instead to control it.
	 */
	readonly defaultValue?: readonly TokenBoxSegment[];
	/** Nobody can type, delete or insert a token. */
	readonly disabled?: boolean;
	/** The value is needed before the form submits, reported as `aria-required`. */
	readonly required?: boolean;
	/** The control is in an invalid state, reported as `aria-invalid`. */
	readonly invalid?: boolean;
	/**
	 * The box accepts hard breaks, and reports `aria-multiline="true"`. Off by
	 * default: a prompt field is one line until its author says otherwise.
	 */
	readonly multiline?: boolean;
	/**
	 * The characters that open a trigger context — `['@']` for mentions,
	 * `['@', '/']` for a prompt field. Empty by default, like every other
	 * behavioural opt-in in this package: with no triggers, `trigger` is never set
	 * and the box is a plain token-bearing text field.
	 */
	readonly triggers?: readonly string[];
	/** Submitted under this name by `tokenbox.field`, as one JSON string. */
	readonly name?: string;
	/** Called with the whole value every time it changes. */
	readonly onChange?: (value: readonly TokenBoxKeyedSegment[]) => void;
};

/**
 * The graph cells every tokenbox part reads and writes, plus the methods the
 * instance carries. A consumer building autocomplete reaches this through
 * `tokenbox.state()` from a component mounted inside the root.
 *
 * `segments` is what the surface RENDERS. It is deliberately not written while a
 * person types: the browser is editing those text nodes, and a write would
 * re-render them out from under the caret. `emitted` is the last array handed to
 * `onChange`, and comparing it against the `value` prop by identity is what
 * tells a consumer's echo apart from a real external change.
 */
export type TokenBoxInstanceState = Seeded<
	TokenBoxRootProps,
	'disabled' | 'required' | 'invalid' | 'multiline' | 'triggers' | 'name'
> & {
	/** The rendered value. Written on structural changes only. */
	segments: readonly TokenBoxKeyedSegment[];
	/**
	 * The value as it stands right now, including text the browser has typed into
	 * the surface since the last structural change. This is what `tokenbox.field`
	 * submits and what a consumer's own summary should read; `segments` is only
	 * what was last rendered.
	 */
	reported: readonly TokenBoxKeyedSegment[];
	/** The trigger context under the caret, or `undefined` when there is none. */
	trigger: TokenBoxTrigger | undefined;
	/** True between `compositionstart` and `compositionend`. Nothing mutates while it is up. */
	composing: boolean;
	/** Whether `defaultValue` has been taken. A seed is read once, not every render. */
	seeded: boolean;
	onChange?: TokenBoxRootProps['onChange'];
};

/**
 * The box's name. It names the surface through `aria-labelledby`; a click on it
 * lands the caret in the surface, which a `for` cannot do because a
 * contenteditable `div` is not a labelable element.
 */
export type TokenBoxLabelProps = PropsOf<'label'>;

/**
 * The editing surface: `contenteditable`, `role="textbox"`, and the element that
 * renders the value. It renders its own tokens and text runs — there is no
 * `item` part in v1, because a consumer-authored repeat inside a contenteditable
 * the browser is also editing is a foot-gun. Style tokens through `[ui-token]`
 * and text runs through `[ui-text]`.
 *
 * `children` are rendered after the value, so a placeholder overlay or a
 * measuring element can ride along; they are `contenteditable="false"` territory
 * and the family does not derive anything from them.
 */
export type TokenBoxInputProps = PropsOf<'div'>;

/**
 * One choice in an autocomplete list: pressing it puts that token in the box,
 * replacing whatever the trigger was searching on.
 *
 * This is a part rather than a method a consumer calls, and the reason is a hard
 * compiler rule, not a style preference. Calling a `shared()` method compiles to
 * copying the method's authored body into the calling handler's module; across
 * files the definition's imports do not travel with the copy, so the build
 * refuses (`MARKLESS_SHARED_METHOD_CROSS_MODULE`). The family therefore publishes
 * the control that performs the insertion, and a consumer composes it.
 *
 * Everything else an autocomplete needs is ordinary state a consumer reads from
 * `tokenbox.state()`: `trigger` carries the character, the query and the rect to
 * anchor a popover against. Reads cross module boundaries fine; only calls do not.
 */
export type TokenBoxItemTriggerProps = Omit<PropsOf<'button'>, 'value'> & {
	/** The token's value — what `onChange` reports and what the markup carries. */
	readonly value: string;
	/** The token's rendered text, and its accessible text. */
	readonly label: string;
};

/**
 * One instance per rendered `tokenbox.itemtrigger`, so the button's own handler
 * reads the token it inserts off its instance rather than off a prop identifier.
 */
export type TokenBoxItemInstanceState = Seeded<TokenBoxItemTriggerProps, 'value' | 'label'>;

/**
 * Supporting text, named by the surface's `aria-describedby`. Mount it alongside
 * `tokenbox.error` and the surface names both, the error first.
 */
export type TokenBoxDescriptionProps = PropsOf<'div'>;

/**
 * The validation message, named ahead of `tokenbox.description`. It carries
 * `role="alert"`, so a reader speaks it when it appears. Mounting it does not
 * mark the box invalid: `invalid` is a prop on `tokenbox.root`.
 */
export type TokenBoxErrorProps = PropsOf<'div'>;

/**
 * The form integration: one hidden input under the root's `name`, carrying the
 * whole value as JSON.
 *
 * The format is the segment array as `JSON.stringify` writes it, keys omitted —
 * `[{"kind":"text","text":"hi "},{"kind":"token","value":"u_1","label":"Alice"}]`.
 * A delimited flat string was rejected: a label may contain any character, so
 * every delimiter needs escaping, and an escape scheme is a worse contract than
 * JSON. Read it back with `JSON.parse` and hand it straight to `value`.
 */
export type TokenBoxFieldProps = PropsOf<'div'>;

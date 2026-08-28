type __MarklessFrameworkApiIndex = typeof import('@markless/core');

declare namespace __MarklessTypeService {
	const elementBrand: unique symbol;

	interface Element {
		readonly [elementBrand]: true;
	}

	interface ElementClass {}

	type Child = Element | string | number | null | undefined | readonly Child[];
	type AttributeValue = string | number | boolean | undefined;
	/**
	 * An IDREF position that names exactly one element by id. An element() handle
	 * is valid here: the compiler resolves the relationship and the emitter mints
	 * the id, so the author never spells one. A plain string id still works for
	 * elements markless did not render.
	 */
	type SingleIdrefValue = AttributeValue | globalThis.Element;
	/**
	 * An IDREF position HTML defines as a space-separated LIST of ids, so a static
	 * array of handles names them all in the order written - one control described
	 * by both its error and its hint. `popovertarget` and `for` take exactly one
	 * id and keep SingleIdrefValue.
	 */
	type IdrefValue = SingleIdrefValue | readonly globalThis.Element[];
	type StyleValue = string | number | undefined;
	/**
	 * Named CSS properties from csstype (camelCase and hyphenated spellings) plus
	 * open `--custom` properties. Unknown property names are errors; escape via the
	 * string form `style="..."`. Values stay primitive so arrays and nested objects
	 * remain errors. Length properties accept bare numbers because the compiler
	 * appends `px` for unitful names.
	 */
	type CssProperties = import('csstype').Properties<string | number> &
		import('csstype').PropertiesHyphen<string | number>;
	type StyleObject = CssProperties & {
		[property: `--${string}`]: StyleValue;
	};
	type Cleanup = () => void;
	type NativeElementBehavior<E extends globalThis.Element> = (
		element: E,
	) => void | Cleanup | Promise<void | Cleanup>;
	type EventWithCurrentTarget<Event, E extends globalThis.Element> = Omit<
		Event,
		'currentTarget'
	> & {
		readonly currentTarget: E;
	};
	type EventHandler<Event, E extends globalThis.Element> = (
		event: EventWithCurrentTarget<Event, E>,
	) => unknown;
	type OneOrMany<T> = T | readonly T[];

	/**
	 * Why the overlay primitive dismissed the topmost enlisted element: a person
	 * pressed Escape, or pressed outside it. `@markless/web` owns the strings -
	 * `OverlayDismissReason` in `src/fns/overlay.ts` is what builds the event - and
	 * this file restates rather than imports them because it is handed to a
	 * consumer's program as a root file, so every module it names must resolve from
	 * the plugin's own declared dependencies, which the runtime is not. The two
	 * spellings change together.
	 */
	type OverlayDismissReason = 'escape' | 'outside-press';

	type OverlayDismissDetail = {
		readonly reason: OverlayDismissReason;
		/** The pointerdown's target for `outside-press`; the key is absent for `escape`. */
		readonly pressTarget?: globalThis.Element;
	};

	/**
	 * Events markless dispatches itself, which no DOM lib knows. They sit here
	 * rather than in `GlobalEventHandlersEventMap` so `onDismiss` on an element
	 * typechecks without also blessing `dismiss` for every `addEventListener` in a
	 * consumer's unrelated DOM code.
	 */
	type MarklessEventMap = {
		dismiss: CustomEvent<OverlayDismissDetail>;
	};

	type ElementEventMap<E extends globalThis.Element> = GlobalEventHandlersEventMap &
		MarklessEventMap &
		(E extends HTMLMediaElement ? HTMLMediaElementEventMap : {}) &
		(E extends HTMLVideoElement ? HTMLVideoElementEventMap : {});

	/**
	 * One handler, or a list of them run in the order they are written:
	 * `onClick={[open, track]}`. Each entry is its own handler - its own reads,
	 * writes and sync policy - so nothing about standing second changes what it is.
	 * A handler that calls `stopImmediatePropagation()` ends the list.
	 *
	 * A handler a consumer passes through `{...rest}` MERGES with the one the part
	 * writes rather than replacing it, the way two listeners on one element behave
	 * on the platform.
	 *
	 * KNOWN GAP, and why it stays one: the slot type is the single-handler one,
	 * so the list form the compiler implements is legal to compile but not to
	 * typecheck. Separating the JSX attribute type from the part-prop type -
	 * `IntrinsicElements` reading an `OneOrMany` twin while `PropsOf` keeps the
	 * callable spelling - was tried and does not hold: completion-matrix row M16
	 * pins `PropsOf<Tag>` and `JSX.IntrinsicElements[Tag]` MUTUALLY assignable, and
	 * mutual assignability makes them the same type, so the array arm cannot live
	 * in one without reaching the other and making `onClick?.(event)` uncallable.
	 * The two requirements are in direct conflict; closing this needs an owner
	 * ruling on which of them gives, not another type shape. It is not a
	 * @markless/ui change: no family edit was needed to reach the conflict.
	 */
	type NativeEventAttributes<E extends globalThis.Element> = {
		[Name in keyof ElementEventMap<E> as Name extends string
			? `on${Capitalize<Name>}`
			: never]?: EventHandler<ElementEventMap<E>[Name], E>;
	};

	/**
	 * What an `el=` list may hold: handles of either cardinality. A singular handle
	 * reads as `Element | undefined`, an array-typed one as `Element[]`, and both
	 * are legal entries in the same list.
	 */
	type ElementHandleList = readonly (
		| globalThis.Element
		| readonly globalThis.Element[]
		| undefined
	)[];

	type MarklessAttributes<E extends globalThis.Element> = {
		attach?: OneOrMany<NativeElementBehavior<E>>;
		children?: Child;
		/**
		 * Cardinality is declared at the `element<T>()` call, not here, so this
		 * position accepts every shape a declaration can produce: a singular handle,
		 * an array-typed handle bound on an element the markup renders many times,
		 * and a LIST of handles - `el={[item.fieldEl, group.fieldEls]}` - which binds
		 * each of them on this one element under its own declaration's rules.
		 *
		 * A set may be declared with a WIDER element type than the tag it binds on:
		 * `element<HTMLElement[]>()` is one ordered collection spanning `<nav>`,
		 * `<button>` and `<a>`, and the runtime holds all three.
		 *
		 * Accepted unsoundness, deliberate and named: what this position wants is
		 * "any array whose element type is a SUPERTYPE of this tag's element", and
		 * TypeScript cannot express it. Array types are covariant, so any union that
		 * admits `readonly Element[]` - which the widened declaration requires -
		 * also admits `readonly HTMLButtonElement[]`. A `HTMLButtonElement[]` handle
		 * bound on a `<div>` therefore typechecks here and hands the author a div
		 * where their type promised a button. The narrow `readonly E[]` arm is kept
		 * first so the exact-match case still infers and completes as itself.
		 */
		el?: E | readonly E[] | ElementHandleList | undefined;
		/**
		 * Render this element above the rest of the UI, escaping clipping and
		 * stacking ancestors. Elevation only: no dismissal, focus, positioning,
		 * ARIA, or animation policy. The compiler requires a literal here -
		 * `overlay`, `overlay={true}`, or `overlay={false}` - because elevation is
		 * structural and never re-runs. Use `@if` to control whether the element
		 * exists.
		 */
		overlay?: boolean;
	};

	type GlobalAttributes = {
		accesskey?: string;
		autocapitalize?: string;
		autofocus?: boolean;
		class?: string;
		contenteditable?: boolean | 'true' | 'false' | 'plaintext-only';
		dir?: 'ltr' | 'rtl' | 'auto';
		draggable?: boolean | 'true' | 'false';
		enterkeyhint?: string;
		hidden?: boolean | 'until-found';
		id?: string;
		inert?: boolean;
		inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
		is?: string;
		itemid?: string;
		itemprop?: string;
		itemref?: string;
		itemscope?: boolean;
		itemtype?: string;
		lang?: string;
		nonce?: string;
		part?: string;
		popover?: 'auto' | 'hint' | 'manual' | string;
		role?: string;
		slot?: string;
		spellcheck?: boolean | 'true' | 'false';
		style?: string | StyleObject;
		tabindex?: number;
		title?: string;
		translate?: 'yes' | 'no';
		[key: `data-${string}`]: AttributeValue;
		/**
		 * IDREF positions (`aria-labelledby`, `aria-controls`, `aria-describedby`)
		 * accept an element() handle, which is why this is IdrefValue rather than
		 * AttributeValue. A pattern index signature cannot name exceptions, so the
		 * type is looser than the compiler: the compiler's IDREF_ATTRIBUTES set is
		 * the authority on which aria attributes actually resolve a handle.
		 */
		[key: `aria-${string}`]: IdrefValue;
	};

	type FormAttributes = {
		form?: string;
		formaction?: string;
		formenctype?: string;
		formmethod?: string;
		formnovalidate?: boolean;
		formtarget?: string;
		name?: string;
	};

	type AnchorAttributes = {
		download?: string | boolean;
		href?: string;
		hreflang?: string;
		media?: string;
		ping?: string;
		referrerpolicy?: ReferrerPolicy;
		rel?: string;
		target?: string;
		type?: string;
	};

	type ImageAttributes = {
		alt?: string;
		crossorigin?: 'anonymous' | 'use-credentials' | '';
		decoding?: 'async' | 'auto' | 'sync';
		fetchpriority?: 'high' | 'low' | 'auto';
		height?: number;
		ismap?: boolean;
		loading?: 'eager' | 'lazy';
		referrerpolicy?: ReferrerPolicy;
		sizes?: string;
		src?: string;
		srcset?: string;
		usemap?: string;
		width?: number;
	};

	type InputAttributes = FormAttributes & {
		accept?: string;
		alt?: string;
		autocomplete?: string;
		capture?: boolean | 'user' | 'environment';
		checked?: boolean;
		dirname?: string;
		disabled?: boolean;
		height?: number;
		// The third checkbox state. It is an IDL property rather than a content
		// attribute, so no HTML attribute list carries it.
		indeterminate?: boolean;
		list?: string;
		max?: string | number;
		maxlength?: number;
		min?: string | number;
		minlength?: number;
		multiple?: boolean;
		pattern?: string;
		placeholder?: string;
		popovertarget?: SingleIdrefValue;
		popovertargetaction?: 'hide' | 'show' | 'toggle';
		readonly?: boolean;
		required?: boolean;
		size?: number;
		src?: string;
		step?: string | number;
		type?: string;
		value?: string | number | readonly string[];
		width?: number;
	};

	type MediaAttributes = {
		autoplay?: boolean;
		controls?: boolean;
		crossorigin?: 'anonymous' | 'use-credentials' | '';
		loop?: boolean;
		muted?: boolean;
		preload?: 'none' | 'metadata' | 'auto' | '';
		src?: string;
	};

	type SvgAttributes = {
		clipPath?: string;
		cx?: string | number;
		cy?: string | number;
		d?: string;
		fill?: string;
		fillOpacity?: string | number;
		height?: string | number;
		markerEnd?: string;
		markerMid?: string;
		markerStart?: string;
		points?: string;
		preserveAspectRatio?: string;
		r?: string | number;
		rx?: string | number;
		ry?: string | number;
		stroke?: string;
		strokeDasharray?: string | number;
		strokeLinecap?: 'butt' | 'round' | 'square' | 'inherit';
		strokeLinejoin?: 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round' | 'inherit';
		strokeOpacity?: string | number;
		strokeWidth?: string | number;
		transform?: string;
		viewBox?: string;
		width?: string | number;
		x?: string | number;
		x1?: string | number;
		x2?: string | number;
		xlinkHref?: string;
		y?: string | number;
		y1?: string | number;
		y2?: string | number;
	};

	type Attributes<E extends globalThis.Element> = GlobalAttributes &
		MarklessAttributes<E> &
		NativeEventAttributes<E>;

	type TagNameSpecificAttributes<Tag extends PropertyKey> = Tag extends 'a' | 'area'
		? AnchorAttributes
		: Tag extends 'audio'
			? MediaAttributes
			: Tag extends 'base'
				? { href?: string; target?: string }
				: Tag extends 'button'
					? FormAttributes & {
							disabled?: boolean;
							popovertarget?: SingleIdrefValue;
							popovertargetaction?: 'hide' | 'show' | 'toggle';
							type?: 'button' | 'reset' | 'submit';
							value?: string;
						}
					: Tag extends 'canvas'
						? { height?: number; width?: number }
						: Tag extends 'fieldset'
							? // `disabled` is what the native "disable every control inside" cascade reads.
								{ disabled?: boolean; form?: string; name?: string }
							: Tag extends 'form'
								? {
										action?: string;
										autocomplete?: string;
										enctype?: string;
										method?: string;
										name?: string;
										novalidate?: boolean;
										target?: string;
									}
								: Tag extends 'iframe'
									? {
											allow?: string;
											allowfullscreen?: boolean;
											height?: string | number;
											loading?: 'eager' | 'lazy';
											name?: string;
											referrerpolicy?: ReferrerPolicy;
											sandbox?: string;
											src?: string;
											srcdoc?: string;
											width?: string | number;
										}
									: Tag extends 'img'
										? ImageAttributes
										: Tag extends 'input'
											? InputAttributes
											: Tag extends 'label'
												? { for?: SingleIdrefValue }
												: Tag extends 'link'
													? AnchorAttributes & {
															as?: string;
															disabled?: boolean;
															sizes?: string;
														}
													: Tag extends 'meta'
														? {
																charset?: string;
																content?: string;
																'http-equiv'?: string;
																media?: string;
																name?: string;
															}
														: Tag extends 'source'
															? {
																	media?: string;
																	sizes?: string;
																	src?: string;
																	srcset?: string;
																	type?: string;
																}
															: Tag extends 'select'
																? FormAttributes & {
																		disabled?: boolean;
																		multiple?: boolean;
																		required?: boolean;
																		size?: number;
																		value?:
																			| string
																			| readonly string[];
																	}
																: Tag extends 'textarea'
																	? FormAttributes & {
																			cols?: number;
																			disabled?: boolean;
																			placeholder?: string;
																			readonly?: boolean;
																			required?: boolean;
																			rows?: number;
																			value?: string;
																		}
																	: Tag extends 'video'
																		? MediaAttributes & {
																				height?: number;
																				playsinline?: boolean;
																				poster?: string;
																				width?: number;
																			}
																		: Tag extends keyof SVGElementTagNameMap
																			? SvgAttributes
																			: {};

	type IntrinsicElementFor<Tag extends PropertyKey> = Tag extends keyof HTMLElementTagNameMap
		? Attributes<HTMLElementTagNameMap[Tag]> & TagNameSpecificAttributes<Tag>
		: Tag extends keyof SVGElementTagNameMap
			? Attributes<SVGElementTagNameMap[Tag]> & TagNameSpecificAttributes<Tag>
			: never;

	type IntrinsicTagName = keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap;
	type IntrinsicElements = {
		[Tag in IntrinsicTagName]: IntrinsicElementFor<Tag>;
	};

	/**
	 * Framework components authored in plain TypeScript (the router's Html and
	 * Link) pass their children through and return `unknown`, which fails the
	 * default JSX rule that a component must return a JSX element. Accept any
	 * function as a tag; prop checking still comes from its signature.
	 */
	type ElementType = IntrinsicTagName | ((props: never) => unknown);
}

declare module '@markless/typescript-plugin/jsx-runtime' {
	export namespace JSX {
		type Element = __MarklessTypeService.Element;
		type ElementClass = __MarklessTypeService.ElementClass;
		type ElementType = __MarklessTypeService.ElementType;
		interface ElementChildrenAttribute {
			children: unknown;
		}
		type IntrinsicElements = __MarklessTypeService.IntrinsicElements;
	}
}

declare module '@markless/typescript-plugin/jsx-dev-runtime' {
	export namespace JSX {
		type Element = __MarklessTypeService.Element;
		type ElementClass = __MarklessTypeService.ElementClass;
		type ElementType = __MarklessTypeService.ElementType;
		interface ElementChildrenAttribute {
			children: unknown;
		}
		type IntrinsicElements = __MarklessTypeService.IntrinsicElements;
	}
}

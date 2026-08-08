type __MarklessFrameworkApiIndex = typeof import('@markless/core');

declare namespace __MarklessTypeService {
	const elementBrand: unique symbol;

	interface Element {
		readonly [elementBrand]: true;
	}

	interface ElementClass {}

	type Child = Element | string | number | null | undefined | readonly Child[];
	type AttributeValue = string | number | boolean | undefined;
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

	type ElementEventMap<E extends globalThis.Element> = GlobalEventHandlersEventMap &
		(E extends HTMLMediaElement ? HTMLMediaElementEventMap : {}) &
		(E extends HTMLVideoElement ? HTMLVideoElementEventMap : {});

	type NativeEventAttributes<E extends globalThis.Element> = {
		[Name in keyof ElementEventMap<E> as Name extends string
			? `on${Capitalize<Name>}`
			: never]?: OneOrMany<EventHandler<ElementEventMap<E>[Name], E>>;
	};

	type MarklessAttributes<E extends globalThis.Element> = {
		attach?: OneOrMany<NativeElementBehavior<E>>;
		children?: Child;
		el?: E | undefined;
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
		style?: string;
		tabindex?: number;
		title?: string;
		translate?: 'yes' | 'no';
		[key: `data-${string}`]: AttributeValue;
		[key: `aria-${string}`]: AttributeValue;
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
		list?: string;
		max?: string | number;
		maxlength?: number;
		min?: string | number;
		minlength?: number;
		multiple?: boolean;
		pattern?: string;
		placeholder?: string;
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
							type?: 'button' | 'reset' | 'submit';
							value?: string;
						}
					: Tag extends 'canvas'
						? { height?: number; width?: number }
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
											? { for?: string }
											: Tag extends 'link'
												? AnchorAttributes & { as?: string; disabled?: boolean; sizes?: string }
												: Tag extends 'source'
													? { media?: string; sizes?: string; src?: string; srcset?: string; type?: string }
													: Tag extends 'select'
														? FormAttributes & {
																disabled?: boolean;
																multiple?: boolean;
																required?: boolean;
																size?: number;
																value?: string | readonly string[];
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
}

declare module '@markless/typescript-plugin/jsx-runtime' {
	export namespace JSX {
		type Element = __MarklessTypeService.Element;
		type ElementClass = __MarklessTypeService.ElementClass;
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
		interface ElementChildrenAttribute {
			children: unknown;
		}
		type IntrinsicElements = __MarklessTypeService.IntrinsicElements;
	}
}

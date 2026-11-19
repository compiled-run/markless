// The overlay behaviour's names that native builds and hosts must spell as the web does; fns/overlay.ts checks its literals against them at type level only, so web output does not carry this module.
import type { OverlayFocusOriginHost } from './overlay-handoff.ts';

/** The attribute the compiler lowers the `overlay` mark to. */
export const OVERLAY_ATTRIBUTE = 'overlay';
/** The second mark a hint surface writes beside `overlay`, as authored. */
export const OVERLAY_HINT_ATTRIBUTE = 'overlay-hint';
/** An enlisted element is modal when it or an element inside it carries this attribute with this value. */
export const OVERLAY_MODAL_ATTRIBUTE = 'aria-modal';
export const OVERLAY_MODAL_VALUE = 'true';
/** The event the behaviour reports a dismissal with. */
export const DISMISS_EVENT = 'dismiss';
/** The property an enlisted element carries its focus origin on. */
export const OVERLAY_FOCUS_ORIGIN_PROPERTY =
	'__marklessOverlayFocusOrigin' satisfies keyof OverlayFocusOriginHost;

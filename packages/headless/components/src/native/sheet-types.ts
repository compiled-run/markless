import type { Children } from '@markless/core';

/**
 * The platform's own sheet: iOS's system sheet, Android's Material bottom sheet, on the web a modal panel in the page's overlay layer. The
 * platform draws the frame, its motion and its dimming; the markup between the tags is the content, styled by you.
 */
export type SheetProps = {
	/** Whether the sheet shows. Your page's own state. */
	readonly open?: boolean;
	/** Called with `false` when the platform closes the sheet (a swipe, back, a tap outside, Escape), never when you do. */
	readonly onChange?: (open: boolean) => void;
	/**
	 * Resting heights as fractions of the screen's height: `[1]` (the default), or two with the larger `1`, such as
	 * `[0.5, 1]`. A browser dialog has no resting heights, so the web ignores this.
	 */
	readonly snapPoints?: readonly number[];
	/** The person can close it the platform's way. Defaults to true. */
	readonly dismissible?: boolean;
	/** The page behind is dimmed and cannot be reached. Defaults to true. */
	readonly modal?: boolean;
	readonly children?: Children;
};

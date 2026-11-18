// Measured with each host's own sheet on the devices the style exports are laid out for (Dragon's export devices).
/** Where a system sheet's content is laid out at each resting height it may take when styled, in CSS px per target. */
export const SHEET_AREAS = {
	/**
	 * iPhone 17, iOS 27.2: the scroll view of the `.pageSheet` controller. At half height iOS lays it out at 402 x 435.7 pt
	 * and draws it scaled to 386 pt wide, floating 8 pt in from each edge; rounded down to whole CSS px.
	 */
	ios: {
		0.5: { width: 402, height: 435 },
		1: { width: 402, height: 778 },
	},
	/**
	 * Pixel 7, API 36: the NestedScrollView below Material's drag handle, 1080 x 975 and 1080 x 2075 device px at 2.625 per
	 * CSS px, rounded down to whole CSS px as the page's 411 x 818 is (Chrome, the reference, lays out whole CSS px only).
	 */
	android: {
		0.5: { width: 411, height: 371 },
		1: { width: 411, height: 790 },
	},
} as const;

export type SheetSnapPoint = keyof (typeof SHEET_AREAS)['ios'];

export const isMeasuredSnapPoint = (value: number): value is SheetSnapPoint =>
	Object.hasOwn(SHEET_AREAS.ios, value) && Object.hasOwn(SHEET_AREAS.android, value);

/** The `viewports` a style input names for a sheet's content at one resting height. */
export const sheetViewports = (snapPoint: SheetSnapPoint) => ({
	ios: SHEET_AREAS.ios[snapPoint],
	android: SHEET_AREAS.android[snapPoint],
});

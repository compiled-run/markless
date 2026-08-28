export type PanelRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type PanelInstanceState = {
	seed: PanelRect | undefined;
	given: PanelRect | undefined;
	hasOwn: boolean;
	ownX: number;
	ownY: number;
	ownWidth: number;
	ownHeight: number;
	minWidth: number;
	minHeight: number;
	disabled: boolean;
	moving: boolean;
	areaInline: number;
	areaBlock: number;
	grabX: number;
	grabY: number;
};

export function heldRect(
	given: PanelRect | undefined,
	written: boolean,
	atX: number,
	atY: number,
	spanX: number,
	spanY: number,
	seed: PanelRect | undefined,
	low: number,
	short: number,
): PanelRect {
	if (given) return given;
	if (written) {
		return {
			x: atX,
			y: atY,
			width: Math.max(spanX, low),
			height: Math.max(spanY, short),
		};
	}
	return seed ?? { x: 0, y: 0, width: low, height: short };
}

export function rectText(rect: PanelRect): string {
	return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

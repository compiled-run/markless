export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type Axis = 'inline' | 'block';

export function movedRect(from: Rect, dx: number, dy: number): Rect {
	return { x: from.x + dx, y: from.y + dy, width: from.width, height: from.height };
}

/**
 * Placing the surface.
 *
 * The placement itself is CSS: `menu.content` ships a scoped `<style>` block in
 * `@layer markless` that anchors the surface to the trigger and gives it a
 * default `position-area` a consumer's unlayered rule replaces. Nothing here
 * builds a `position-area`, an anchor name, or a `position` any more.
 *
 * What CSS cannot say is where a pointer was, so a context menu's point arrives
 * as the two custom properties the block reads. A menu with no `menu.trigger`
 * resolves no anchor, which leaves the `position-area` inert and the point in
 * charge; a menu with a trigger sets neither property and stays anchored.
 *
 * The point path does not flip near a viewport edge: no box is measured here,
 * and a consumer's own `position-try-fallbacks` only reaches the anchored path.
 */

import type { MenuPoint } from './menu-types.ts';

/** The point a context menu was asked for, as the geometry properties the surface's own CSS reads. */
export function surfaceStyle(point: MenuPoint | null): string {
	if (point === null) return '';
	return `--x: ${point.x}px; --y: ${point.y}px;`;
}

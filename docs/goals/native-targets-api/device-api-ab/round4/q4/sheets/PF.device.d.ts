// Module: @markless/device (excerpt)
export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
export interface Camera {
	// 'unknown' until the person answers the permission prompt.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	readonly facing: 'front' | 'back';
	// Switches between the front and back cameras.
	flip(): void;
	// Waits until ready, then takes a photo.
	takePhoto(): Promise<Photo>;
}
// A camera that belongs to this component: its fields are live, and it is released when the component leaves the page.
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;
// Two elements whose inside the system draws.
// The camera element shows a camera made with camera(). It is one box: the author sizes and places it with `class`; the
// picture inside is drawn by the device.
// The sheet element is the system's own sheet: a panel that slides up from the bottom over the screen. The system draws
// the panel, its grab handle, its corners and its animation, and closes it on a swipe down (calling onChange(false)).
// The author's children go inside it; the panel itself takes no class.
// On the website the camera element shows the browser's camera picture, and the sheet element is the browser's own
// <dialog>, shown at the bottom of the window with the browser's default look.
type CameraElementProps = { el: Camera; class?: string };
type SheetProps = { open?: boolean; onChange?: (open: boolean) => void; children?: unknown };
// Which build this is, fixed when the app is built: exactly one field is true. In the website build `web` is true
// whatever device the visitor uses. Platform differences in a page are checks of these: `@if (platform.ios) { … }`.
export declare const platform: {
	readonly ios: boolean;
	readonly android: boolean;
	readonly web: boolean;
	// Elements the platform itself draws:
	// <platform.camera el={cam} />
	readonly camera: (props: CameraElementProps) => Element;
	// <platform.sheet open={…} onChange={…}>…</platform.sheet>
	readonly sheet: (props: SheetProps) => Element;
};

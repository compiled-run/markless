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
// Which build this is, fixed when the app is built: exactly one field is true. In the website build `web` is true
// whatever device the visitor uses. Platform differences in a page are checks of these: `@if (platform.ios) { … }`.
export declare const platform: {
	readonly ios: boolean;
	readonly android: boolean;
	readonly web: boolean;@@PLATFORM_EXTRA@@
};

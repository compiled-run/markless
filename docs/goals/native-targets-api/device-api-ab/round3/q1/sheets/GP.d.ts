// Module: @markless/device
// The app is built from one codebase as an iPhone app, an Android app, a Mac app and a website.
// Device features exist in the iPhone and Android builds only.
// Each feature has `supported`: true in a build where the feature exists, false elsewhere.
// A guard is an `@if` whose test is `feature.supported` or starts with `feature.supported &&`, or the same test in a
// handler (`if`, or an early `if (!feature.supported) return;`). Other builds remove the guarded code; an `@else` arm
// is what they get.
// Making a feature object (`const cam = camera()`) may stand anywhere. The build rejects any unguarded use whose result
// the page shows or waits for: reading a field, awaiting a method, showing its element. A call that returns nothing
// (`haptics.tap()`) needs no guard; where the feature does not exist it does nothing.
// For a difference in the page that is not a device feature, use `platform`.
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// `access` is 'unknown' until the person answers the permission prompt, then 'granted' or 'denied'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }

export interface Camera {
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// Waits until ready, then takes a photo.
	takePhoto(): Promise<Photo>;
}
export interface Geolocation {
	readonly access: Access;
	// The live position; null until the first reading.
	readonly position: Position | null;
}
export interface Network {
	// False while the device has no connection.
	readonly online: boolean;
}

// The in-page camera; show it with <base.camera el={cam} />.
export declare const camera: { (options?: { facing?: 'front' | 'back' }): Camera; readonly supported: boolean };
// The person's live position.
export declare const geolocation: { (): Geolocation; readonly supported: boolean };
// The connection.
export declare const network: { (): Network; readonly supported: boolean };
export declare const haptics: {
	// Plays a haptic tap.
	tap(kind?: 'light' | 'medium' | 'heavy'): void;
	readonly supported: boolean;
};
export declare const sharesheet: {
	// Opens the system share panel; resolves when it closes.
	open(data: { title?: string; text?: string; url?: string }): Promise<void>;
	readonly supported: boolean;
};

// Which build this is, fixed when the app is built. Exactly one field is true. In the website build `web` is true
// whatever system the visitor uses.
export declare const platform: { readonly ios: boolean; readonly android: boolean; readonly macos: boolean; readonly web: boolean };

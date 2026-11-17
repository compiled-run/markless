// Module: @markless/device
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// A system screen is a noun you open from anywhere: `settings.open()`. It is not made in a component.
// A refused permission is an Error whose name is 'NotAllowedError'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
export interface ShareData { title?: string; text?: string; url?: string }

export interface Camera {
	// 'unknown' until the person answers the permission prompt, then 'granted' or 'denied'.
	readonly access: Access;
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// Waits until ready, then takes a photo from this camera.
	takePhoto(): Promise<Photo>;
}
// The in-page camera; show it with <base.camera el={cam} />.
export declare function camera(options?: { facing?: 'front' | 'back' }): Camera;
// The phone's own camera screen, for taking a new photo; resolves with the photo taken, or null if the person cancels.
export declare const cameraApp: { open(): Promise<Photo | null> };
// The phone's photo library, for choosing a photo already on the phone; resolves with it, or null if the person cancels.
export declare const photoLibrary: { open(): Promise<Photo | null> };
// This app's page in the phone's Settings.
export declare const settings: { open(): void };
// The system share panel; resolves when it closes.
export declare const sharesheet: { open(data: ShareData): Promise<void> };

// Module: @markless/device
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// A system screen is a noun you open from anywhere; it is not made in a component.
// A refused permission is an Error whose name is 'NotAllowedError'.

export type Access = 'unknown' | 'granted' | 'denied';
// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }

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

export declare const settings: {
	// Opens this app's page in the phone's Settings.
	open(): void;
};
export declare const sharesheet: {
	// Opens the system share panel; resolves when it closes.
	open(data: { title?: string; text?: string; url?: string }): Promise<void>;
};

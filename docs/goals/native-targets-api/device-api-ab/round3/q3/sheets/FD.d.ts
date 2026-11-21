// Module: @markless/device
// Calling a feature in a component body makes an object that belongs to that component: its fields are live (the page
// updates when they change), handlers may use it, and it is released when the component leaves the page.
// A system screen is opened by calling a function from anywhere; nothing is made in a component.
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
export declare const camera: {
	// The in-page camera; show it with <base.camera el={cam} />.
	(options?: { facing?: 'front' | 'back' }): Camera;
	// Opens the phone's own camera screen, for taking a new photo; resolves with the photo taken, or null if the person
	// cancels. Makes no in-page camera.
	takePhoto(): Promise<Photo | null>;
};
// Opens the phone's photo library, for choosing a photo already on the phone; resolves with it, or null if the person cancels.
export declare function choosePhoto(): Promise<Photo | null>;
// Opens this app's page in the phone's Settings.
export declare function openSettings(): void;
// Opens the system share panel; resolves when it closes.
export declare function openShareSheet(data: ShareData): Promise<void>;

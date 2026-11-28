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
export declare const camera: SUPPORTED_CAMERA;
// The person's live position.
export declare const geolocation: SUPPORTED_GEO;
// The connection.
export declare const network: SUPPORTED_NET;
export declare const haptics: {
	// Plays a haptic tap.
	tap(kind?: 'light' | 'medium' | 'heavy'): void;SUPPORTED_FIELD
};
export declare const sharesheet: {
	// Opens the system share panel; resolves when it closes.
	open(data: { title?: string; text?: string; url?: string }): Promise<void>;SUPPORTED_FIELD
};

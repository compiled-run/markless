// Module: @markless/device
// Each feature is one import. Calling it in a component body makes the version that stays on: an object that belongs to
// that component, with live fields, usable by handlers, released when the component leaves the page. Its methods do
// the one-off version of the same thing without making anything.
// A refused permission is an Error whose name is 'NotAllowedError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }

export interface Camera {
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// True when camera access is refused.
	readonly denied: boolean;
	// Assign to flip.
	facing: Facing;
	// Waits until ready, then takes a photo from this camera.
	takePhoto(): Promise<Photo>;
}
export declare const camera: {
	// The in-page camera.
	(options?: { facing?: Facing }): Camera;
	// Opens the phone's own camera screen; resolves null if the person cancels. Makes no in-page camera.
	takePhoto(): Promise<Photo | null>;
};

export interface LiveLocation { readonly position: Position | null; readonly denied: boolean }
export declare const location: {
	// The live position; `position` is null until the first reading.
	(): LiveLocation;
	// One reading of the person's position.
	current(): Promise<Position>;
};

export interface GeoMap {
	// Assign to move the map.
	center: { latitude: number; longitude: number };
	// A pin, written inside <mapview el={m}>.
	pin: (props: { at: { latitude: number; longitude: number } }) => Element;
}
export function mapview(options?: { center?: { latitude: number; longitude: number }; zoom?: number }): GeoMap;

export declare const notifications: {
	// Schedules a local notification; tapping it opens `url` in the app.
	schedule(options: { title: string; body?: string; at: Date; url: string }): Promise<void>;
};
// Opens the share sheet; resolves when it closes.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;
// Plays a haptic tap.
export function haptic(kind?: HapticKind): void;
// Opens this app's page in the phone's Settings.
export function openSettings(): void;

declare global {
	interface HTMLElementTagNameMap {
		// Shows a camera made in this component: <camera el={cam} />.
		camera: Camera;
		// Shows a map made in this component; put pins inside: <mapview el={m}>…</mapview>.
		mapview: GeoMap;
	}
}

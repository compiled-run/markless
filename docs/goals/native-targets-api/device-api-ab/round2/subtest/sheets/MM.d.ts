// Module: @markless/device
// Every feature is an object made by a function in a component body; the object belongs to that component,
// its fields are live, handlers may use it, and it is released when the component leaves the page.
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
	// Waits until ready, then takes a photo.
	capture(): Promise<Photo>;
}
// The in-page camera.
export function camera(options?: { facing?: Facing }): Camera;

export interface Location {
	// The live position, null until the first reading; reading it starts the watch.
	readonly position: Position | null;
	readonly denied: boolean;
	// One reading of the person's position.
	current(): Promise<Position>;
}
export function location(): Location;

export interface GeoMap {
	// Assign to move the map.
	center: { latitude: number; longitude: number };
	// A pin, written inside <mapview el={m}>.
	pin: (props: { at: { latitude: number; longitude: number } }) => Element;
}
export function mapview(options?: { center?: { latitude: number; longitude: number }; zoom?: number }): GeoMap;

// open() shows the phone's own camera screen; resolves null if the person cancels.
export function cameraScreen(): { open(): Promise<Photo | null> };
// share() opens the share sheet; resolves when it closes.
export function sharing(): { share(data: { title?: string; text?: string; url?: string }): Promise<void> };
export function haptics(): { tap(kind?: HapticKind): void };
// schedule() schedules a local notification; tapping it opens `url` in the app.
export function notifications(): { schedule(options: { title: string; body?: string; at: Date; url: string }): Promise<void> };
// open() opens this app's page in the phone's Settings.
export function settings(): { open(): void };

declare global {
	interface HTMLElementTagNameMap {
		// Shows a camera made in this component: <camera el={cam} />.
		camera: Camera;
		// Shows a map made in this component; put pins inside: <mapview el={m}>…</mapview>.
		mapview: GeoMap;
	}
}

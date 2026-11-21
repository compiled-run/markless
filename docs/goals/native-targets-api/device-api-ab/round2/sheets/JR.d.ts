// Module: @markless/device
// Each device is an object made by a function in a component body; the object belongs to that component.
// The object always exists; the device starts when its element is on screen (show it with `el`, as in <camera el={cam} />),
// asks for permission then, and is released when the component leaves the page or the app goes to the background.
// Fields are live and handlers may use the object.
// Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A place in degrees.
export interface Place { latitude: number; longitude: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

export interface Camera {
	// False until its element is on screen and the camera is running.
	readonly ready: boolean;
	// True when camera access is refused.
	readonly denied: boolean;
	// Assign to flip.
	facing: Facing;
	// Assign false to release the camera while the component stays; true starts it again.
	active: boolean;
	// Waits until ready, then takes a photo; rejects with a NotAllowedError when access is refused.
	takePhoto(): Promise<Photo>;
	// Calls onCode for every QR code the camera sees, repeats included, while it runs.
	scan(onCode: (text: string) => void): void;
}
export function camera(options?: { facing?: Facing; name?: string }): Camera;

// The object made elsewhere with this `name`, while its component is on the page; otherwise null. Live.
export function named<T>(name: string): T | null;

export interface GeoMap {
	// Assign to move the map.
	center: Place;
	zoom: number;
	// True when location access is refused.
	readonly denied: boolean;
	// A pin at a place, written inside <mapview el={m}>; onPress fires when tapped.
	pin: (props: { at: Place; onPress?: () => void }) => Element;
	// Moves the map to the person's location.
	locate(): Promise<void>;
}
export function mapview(options?: { center?: Place; zoom?: number; name?: string }): GeoMap;

export interface Recorder {
	readonly recording: boolean;
	readonly denied: boolean;
	// Whole seconds since start() while recording.
	readonly seconds: number;
	// The last finished clip.
	readonly clip: Clip | null;
	start(): Promise<void>;
	stop(): void;
}
export function recorder(): Recorder;

export interface Player {
	readonly playing: boolean;
	// Current time and length in seconds.
	readonly time: number;
	readonly duration: number;
	play(): void;
	pause(): void;
	seek(seconds: number): void;
}
export function player(src: string): Player;

export function network(): { readonly online: boolean };
// heading is in degrees (0 = north), null until the first reading.
export function compass(): { readonly heading: number | null };
// Opens this app's page in the phone's Settings.
export function openSettings(): void;

declare global {
	interface HTMLElementTagNameMap {
		// The live picture.
		camera: Camera;
		// The map; put pins inside.
		mapview: GeoMap;
		// The picture, with no controls of its own.
		player: Player;
	}
}

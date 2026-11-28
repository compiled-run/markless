// Module: @markless/device
// Each device is an object made by a function in a component body; the object belongs to that component.
// The device starts when first used or shown, asks for permission then, and is released when the component
// leaves the page or the app goes to the background. Fields are live and handlers may use the object.
// Optional parts take an object with `of`, as in <camera.trigger of={cam}>. Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A place in degrees.
export interface Place { latitude: number; longitude: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

type Part<P> = (props: P & { class?: string; children?: unknown }) => Element;
// Shows the device on screen: write <obj.area />.
type Area = (props: { class?: string; children?: unknown }) => Element;

export interface Camera {
	readonly ready: boolean;
	// True when camera access is refused.
	readonly denied: boolean;
	// Assign to flip.
	facing: Facing;
	// Assign false to release the camera while the component stays; true starts it again.
	active: boolean;
	// The live picture.
	area: Area;
	// Waits until ready, then takes a photo; rejects with a NotAllowedError when access is refused.
	capture(): Promise<Photo>;
	// Calls onCode for every QR code the camera sees, repeats included, while it runs.
	scan(onCode: (text: string) => void): void;
}
export function camera(options?: { facing?: Facing; name?: string }): Camera;
export declare namespace camera {
	// A button that takes a photo into onCapture; disabled until the camera is ready.
	const trigger: Part<{ of: Camera; onCapture?: (photo: Photo) => void }>;
	// Shows its children only while access is refused.
	const error: Part<{ of: Camera }>;
}

// The object made elsewhere with this `name`, while its component is on the page; otherwise null. Live.
export function named<T>(name: string): T | null;

export interface GeoMap {
	// Assign to move the map.
	center: Place;
	zoom: number;
	// True when location access is refused.
	readonly denied: boolean;
	// The map; put pins inside.
	area: Area;
	// A pin at a place; onPress fires when tapped.
	pin: (props: { at: Place; onPress?: () => void }) => Element;
	// Moves the map to the person's location.
	locate(): Promise<void>;
}
export function map(options?: { center?: Place; zoom?: number; name?: string }): GeoMap;
export declare namespace map {
	// A button that moves the map to the person's location.
	const trigger: Part<{ of: GeoMap }>;
}

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
export declare namespace recorder {
	// A button that starts recording, and stops it when pressed again. Sets ui-recording.
	const trigger: Part<{ of: Recorder }>;
	// Text of the whole seconds recorded so far; present only while recording.
	const label: Part<{ of: Recorder }>;
}

export interface Player {
	readonly playing: boolean;
	// Current time and length in seconds.
	readonly time: number;
	readonly duration: number;
	// The picture, with no controls of its own.
	area: Area;
	play(): void;
	pause(): void;
	seek(seconds: number): void;
}
export function player(src: string): Player;
export declare namespace player {
	// A button that plays, and pauses when pressed again. Sets ui-playing.
	const trigger: Part<{ of: Player }>;
	// A seek bar: shows progress, and dragging it seeks.
	const indicator: Part<{ of: Player }>;
	// Text of the current time, as m:ss.
	const label: Part<{ of: Player }>;
}

export function network(): { readonly online: boolean };
// heading is in degrees (0 = north), null until the first reading.
export function compass(): { readonly heading: number | null };
// Opens this app's page in the phone's Settings.
export function openSettings(): void;

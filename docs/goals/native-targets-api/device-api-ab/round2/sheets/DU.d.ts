// Module: @markless/device
// A refused permission is an Error whose name is 'NotAllowedError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A place in degrees.
export interface Place { latitude: number; longitude: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

// Handle type for <Camera>: bind with `let camera = element<CameraElement>()` and `el={camera}`.
export interface CameraElement extends HTMLElement {
	// Takes a photo; the photo arrives through the view's onChange.
	capture(): void;
}

// Live camera preview, a real native view; the camera runs while the view is in the page.
// onReady fires when it can take photos; refusal arrives through onError.
// With `scan`, onCode fires for every QR code it sees, repeats included.
export function Camera(props: {
	el?: CameraElement | null;
	facing?: Facing;
	scan?: boolean;
	class?: string;
	onReady?: () => void;
	onChange?: (photo: Photo) => void;
	onCode?: (text: string) => void;
	onError?: (error: Error) => void;
}): Element;

// Handle type for <MapView>.
export interface MapElement extends HTMLElement {
	// Moves the map to the person's location; refusal arrives through onError.
	locate(): void;
}
// A native map with a pin at each place in `pins`; onPin gets the index of the tapped pin.
export function MapView(props: { el?: MapElement | null; center?: Place; zoom?: number; pins?: Place[]; class?: string; onPin?: (index: number) => void; onError?: (error: Error) => void }): Element;

// Handle type for <Video>.
export interface VideoElement extends HTMLElement { play(): void; pause(): void; seek(seconds: number): void }
// A native video with no controls of its own; onTime fires as the current time changes.
export function Video(props: { el?: VideoElement | null; src: string; class?: string; onPlay?: () => void; onPause?: () => void; onTime?: (seconds: number) => void; onDuration?: (seconds: number) => void }): Element;

// Opens this app's page in the phone's Settings.
export function openSettings(): void;
// Live value: true while the device has a network connection.
export function isOnline(): boolean;
// Live value: compass heading in degrees (0 = north), null until the first reading.
export function heading(): number | null;

// A voice recorder; call in a component body, its fields are live and handlers may use it.
export interface Recorder {
	recording: boolean;
	// Whole seconds since start() while recording.
	elapsed: number;
	// The last finished clip.
	clip: Clip | null;
	start(): Promise<void>;
	stop(): void;
}
export function recorder(): Recorder;

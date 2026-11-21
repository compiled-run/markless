// Module: @markless/device
// A refused permission is an Error whose name is 'NotAllowedError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

// Handle type for <Camera>: bind with `let camera = element<CameraElement>()` and `el={camera}`.
export interface CameraElement extends HTMLElement {
	// Takes a photo; the photo arrives through the view's onChange.
	capture(): void;
}

// Live camera preview, a real native view; refusal arrives through onError.
export function Camera(props: {
	el?: CameraElement | null;
	facing?: Facing;
	class?: string;
	onChange?: (photo: Photo) => void;
	onError?: (error: Error) => void;
}): Element;

// Opens the phone's own camera screen; resolves null if the person cancels.
export function takePhoto(): Promise<Photo | null>;
// One-time location reading.
export function currentPosition(): Promise<Position>;
// Opens this app's page in the phone's Settings.
export function openSettings(): void;
// Plays a haptic tap.
export function haptic(kind?: HapticKind): void;
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

// Schedules a local notification; tapping it opens `url` in the app.
export function scheduleNotification(options: { title: string; body?: string; at: Date; url: string }): Promise<void>;
// Opens the share sheet; resolves when it closes.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;

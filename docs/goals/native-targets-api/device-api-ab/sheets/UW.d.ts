// Module: @markless/device
// A refused permission is an Error whose name is 'NotAllowedError'. Nothing is declared in app config.
// Parts are written as <camera.root>, <camera.area> and so on; parts wire themselves to their root.

export type Facing = 'front' | 'back';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

type Part<P = {}> = (props: P & { class?: string; children?: unknown }) => Element;

export declare const camera: {
	// Owns the camera; a new photo arrives through onChange, a refusal through onError.
	root: Part<{ facing?: Facing; onChange?: (photo: Photo) => void; onError?: (error: Error) => void }>;
	// The live preview.
	area: Part;
	// A button that takes a photo.
	trigger: Part;
	// Shows its children only when camera access is refused.
	error: Part;
};

export declare const recorder: {
	// Owns the recorder; the finished clip arrives through onChange.
	root: Part<{ onChange?: (clip: Clip) => void; onError?: (error: Error) => void }>;
	// A button that starts recording, and stops it when pressed again.
	trigger: Part;
	// Present only while recording (styled through its `ui-recording` attribute).
	indicator: Part;
	// Text of the whole seconds recorded so far.
	valuelabel: Part;
	// Shows its children only when microphone access is refused.
	error: Part;
};

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
// Schedules a local notification; tapping it opens `url` in the app.
export function scheduleNotification(options: { title: string; body?: string; at: Date; url: string }): Promise<void>;
// Opens the share sheet; resolves when it closes.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;

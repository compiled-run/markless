// Module: @markless/device
// A refused permission is an Error whose name is 'NotAllowedError'; a cancelled screen or sheet rejects with 'AbortError'. Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; durationMs: number }

// Opens the phone's own camera screen.
export function takePhoto(options?: { source?: 'camera' | 'library' }): Promise<Photo>;
// An attach behaviour that shows the live camera in a <video>: `<video attach={cameraPreview({ facing })} />`; it restarts when `facing` changes.
export function cameraPreview(options: { facing: Facing; onError?: (error: Error) => void }): (video: HTMLVideoElement) => () => void;
// Takes a photo from the preview running in a video bound with `let video = element<HTMLVideoElement>()` and `el={video}`.
export function capturePhoto(video: HTMLVideoElement | undefined): Promise<Photo>;

// One-time location reading.
export function getPosition(options?: { signal?: AbortSignal; highAccuracy?: boolean }): Promise<Position>;
// Opens this app's page in the phone's Settings.
export function openSettings(): Promise<void>;
// Plays a haptic tap.
export function haptic(style?: 'light' | 'medium' | 'heavy'): void;

// Calls back at once with the current status, then on each change; returns a stop function.
export function watchNetwork(callback: (status: { online: boolean }) => void): () => void;
// Calls back with each compass heading in degrees (0 = north); returns a stop function.
export function watchHeading(callback: (reading: { degrees: number }) => void): () => void;

// A recording in progress.
export interface Recording {
	// Stops and resolves with the clip.
	stop(): Promise<Clip>;
}
// Starts recording from the microphone.
export function startRecording(options?: { kind?: 'audio' }): Promise<Recording>;

// Schedules a local notification; tapping it opens `url` in the app.
export function scheduleNotification(options: { id: string; title: string; body?: string; at: Date; url: string }): Promise<void>;
// Opens the share sheet.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;

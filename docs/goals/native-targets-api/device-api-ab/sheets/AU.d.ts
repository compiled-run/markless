// Module: @markless/device
// Permissions are declared once in app config; there are no request calls. The first use asks the person.
// markless.config.ts:      export default { grants: ['camera', 'microphone', 'geolocation', 'notifications'] }
// strings/permissions.json: { "camera": "Usage text shown when asking", "microphone": "…", "geolocation": "…" }
// A refused permission rejects with a DOMException whose name is 'NotAllowedError'.

export type PermissionStatus = 'granted' | 'prompt' | 'denied';

// Live values: the current permission status of each feature.
export function cameraStatus(): PermissionStatus;
export function microphoneStatus(): PermissionStatus;
export function geolocationStatus(): PermissionStatus;

// Opens camera and/or microphone; facingMode 'user' is the front camera, 'environment' the back.
export function getUserMedia(constraints: { video?: boolean | { facingMode?: 'user' | 'environment' }; audio?: boolean }): Promise<MediaStream>;
// A native view showing a stream live.
export function MediaView(props: { srcObject: MediaStream | null; class?: string }): Element;
// Takes a still photo from a video track (stream.getVideoTracks()[0]).
export function takePhoto(track: MediaStreamTrack): Promise<Blob>;
// Opens the phone's own camera screen; resolves null if the person cancels.
export function showCapturePicker(options: { accept: 'image/*'; capture?: 'user' | 'environment' }): Promise<File | null>;

// A position in the web's shape.
export interface GeolocationPosition { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }
// One-time location reading.
export function getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }): Promise<GeolocationPosition>;
// Opens this app's page in the phone's Settings.
export function openAppSettings(): void;

// Haptic feedback: a duration in ms or an on/off pattern.
export function vibrate(pattern: number | number[]): boolean;
// Live value: true while the device has a network connection.
export function onLine(): boolean;
// Live value: device orientation; alpha is the compass heading in degrees (0 = north), null until the first reading.
export function deviceOrientation(): { alpha: number | null; beta: number | null; gamma: number | null };

// Records a stream; the clip arrives as a Blob through ondataavailable after stop().
export class MediaRecorder {
	constructor(stream: MediaStream);
	readonly state: 'inactive' | 'recording' | 'paused';
	ondataavailable: ((event: { data: Blob }) => void) | null;
	onstop: (() => void) | null;
	start(): void;
	stop(): void;
}

// Shows a notification, at a later time when showTrigger is set; tapping it opens `navigate`.
export function showNotification(title: string, options?: { body?: string; navigate?: string; showTrigger?: TimestampTrigger }): Promise<void>;
// A trigger for a time in ms since the epoch.
export class TimestampTrigger { constructor(timestamp: number) }
// Opens the share sheet; rejects with 'AbortError' if the person dismisses it.
export function share(data: { title?: string; text?: string; url?: string }): Promise<void>;

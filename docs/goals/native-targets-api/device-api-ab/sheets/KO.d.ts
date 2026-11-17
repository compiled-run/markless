// Module: @markless/device
// Each feature checks and requests its own permission before use. Nothing is declared in app config.

export type PermissionState = 'granted' | 'denied' | 'undetermined';

// A feature's permission; call in a component body, `state` and `canAsk` are live.
export interface Permission {
	state: PermissionState;
	// False once the person has refused for good; only Settings can grant it then.
	canAsk: boolean;
	// Shows the system prompt and resolves with the answer.
	request(): Promise<PermissionState>;
}
export function cameraPermission(): Permission;
export function microphonePermission(): Permission;
export function locationPermission(): Permission;
export function notificationPermission(): Permission;

// A photo; `uri` works as an <img> src.
export interface Picture { uri: string; width: number; height: number }

// Handle type for <CameraView>: bind with `let cam = element<CameraViewElement>()` and `el={cam}`.
export interface CameraViewElement extends HTMLElement { takePicture(): Promise<Picture> }
// Live camera preview; shows nothing until camera permission is granted.
export function CameraView(props: { el?: CameraViewElement | null; facing?: 'front' | 'back'; class?: string }): Element;

export declare const ImagePicker: {
	// Opens the phone's own camera screen (needs camera permission).
	launchCamera(): Promise<{ canceled: boolean; assets: Picture[] }>;
};
export declare const Location: {
	// One-time location reading (needs location permission).
	getCurrentPosition(): Promise<{ coords: { latitude: number; longitude: number; accuracy: number } }>;
};
export declare const Linking: {
	// Opens this app's page in the phone's Settings.
	openSettings(): Promise<void>;
};
export declare const Haptics: {
	impact(style: 'light' | 'medium' | 'heavy'): Promise<void>;
	notification(type: 'success' | 'warning' | 'error'): Promise<void>;
};
export declare const Network: {
	getStatus(): Promise<{ connected: boolean }>;
	// Calls back on each change; returns a remove function.
	addListener(event: 'change', listener: (status: { connected: boolean }) => void): () => void;
};
export declare const Compass: {
	// Calls back with each heading in degrees (0 = north); returns a remove function.
	addListener(listener: (reading: { heading: number }) => void): () => void;
};
export declare const AudioRecorder: {
	// Starts recording (needs microphone permission).
	start(): Promise<void>;
	// Stops and resolves with the clip; `uri` works as an <audio> src.
	stop(): Promise<{ uri: string; seconds: number }>;
	// Calls back about once a second while recording; returns a remove function.
	addListener(event: 'progress', listener: (status: { seconds: number }) => void): () => void;
};
export declare const Notifications: {
	// Schedules a local notification (needs notification permission); `data` comes back on tap.
	schedule(options: { title: string; body?: string; at: Date; data?: Record<string, string> }): Promise<{ id: string }>;
	// Calls back when the person taps a notification; returns a remove function.
	addListener(event: 'tap', listener: (notification: { data: Record<string, string> }) => void): () => void;
};
export declare const Share: {
	// Opens the share sheet.
	share(data: { title?: string; text?: string; url?: string }): Promise<{ completed: boolean }>;
};

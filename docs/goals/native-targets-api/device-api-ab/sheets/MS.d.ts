// Module: @markless/device
// Each feature is an object made by a function. Call it in a component body; its fields are live and handlers may use it.
// Fields and methods first ask for permission when needed; a refusal shows as `status: 'denied'`. Nothing is declared in app config.

export type Facing = 'front' | 'back';
export type Status = 'pending' | 'ready' | 'denied';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A position in degrees and metres.
export interface Position { latitude: number; longitude: number; accuracy: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

export interface Camera {
	status: Status;
	// Assign to switch cameras.
	facing: Facing;
	capture(): Promise<Photo>;
}
export function camera(options?: { facing?: Facing }): Camera;
// A native view showing a camera's live preview.
export function Preview(props: { of: Camera; class?: string }): Element;

// The phone's own camera screen; open() resolves null if the person cancels.
export function cameraScreen(): { open(): Promise<Photo | null> };

export interface Location {
	status: Status;
	// The latest reading, null until the first one.
	position: Position | null;
	// Reads again, asking for permission again if it can.
	refresh(): void;
}
export function location(): Location;
// This app's page in the phone's Settings.
export function settings(): { open(): void };

export function haptics(): { tap(kind?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'): void };
export function network(): { online: boolean };
// heading is in degrees (0 = north), null until the first reading.
export function compass(): { status: Status; heading: number | null };

export interface Recorder {
	status: Status;
	recording: boolean;
	// Whole seconds since start() while recording.
	elapsed: number;
	// The last finished clip.
	clip: Clip | null;
	start(): void;
	stop(): void;
}
export function recorder(): Recorder;

// schedule() asks for permission if needed; tapping the notification opens `url` in the app.
export function notifications(): { status: Status; schedule(options: { title: string; body?: string; at: Date; url: string }): Promise<void> };
// open() shows the share sheet and resolves when it closes.
export function shareSheet(): { open(data: { title?: string; text?: string; url?: string }): Promise<void> };

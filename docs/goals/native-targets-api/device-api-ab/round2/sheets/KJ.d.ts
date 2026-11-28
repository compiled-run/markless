// Module: @markless/device
// Everything comes from one import: `import { device } from '@markless/device'`. Nothing is declared in app config.
// A device that is on is an element in the markup, shown or not (<device.camera />, <device.recorder />). It starts and asks
// for permission when the element appears; leaving the markup releases it. Nothing is created by calling a function.
// Steer a device with your own state through its props and hear back through its events. Every device element fires
// onReady and onDenied and carries ui-ready / ui-denied attributes. Values a device knows are properties; one-time asks
// are awaited functions that reject with a NotAllowedError when refused.

export type Facing = 'front' | 'back';
export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A place in degrees.
export interface Place { latitude: number; longitude: number }
// A position in degrees and metres.
export interface Position extends Place { accuracy: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

type DeviceElement<P> = (props: P & { class?: string; children?: unknown; onReady?: () => void; onDenied?: () => void }) => Element;

// Handle type for <device.camera>: `let cam = element<CameraElement>()` and `el={cam}`.
export interface CameraElement extends HTMLElement {
	// Waits until ready, then takes a photo.
	takePhoto(): Promise<Photo>;
}

export declare const device: {
	// The live picture. With scan, onScan fires for every code seen, repeats included.
	camera: DeviceElement<{ el?: CameraElement | null; facing?: Facing; torch?: boolean; scan?: 'qr'[]; onScan?: (text: string) => void }> & {
		// Opens the phone's own camera screen; resolves null if the person cancels.
		takePhoto(): Promise<Photo | null>;
	};
	// Shows nothing. Records while `active` is true; onTick gives whole seconds recorded; onChange gives the finished clip.
	recorder: DeviceElement<{ active: boolean; onTick?: (seconds: number) => void; onChange?: (clip: Clip) => void }>;
	// The map, centred on `center`; put <device.map.pin> inside. onChange gives the centre after the person moves the map.
	map: DeviceElement<{ center: Place; zoom?: number; onChange?: (center: Place) => void }> & {
		pin: DeviceElement<{ at: Place; onPress?: () => void }>;
	};
	// A video with no controls of its own. Plays while `playing` is true; a new `time` seeks; onTimeChange reports the time.
	player: DeviceElement<{ src: string; playing: boolean; time?: number; onTimeChange?: (seconds: number) => void; onDuration?: (seconds: number) => void; onEnd?: () => void }>;

	readonly network: { readonly online: boolean };
	readonly battery: { readonly level: number };
	// heading is in degrees (0 = north), null until the first reading.
	readonly compass: { readonly heading: number | null };
	readonly location: {
		// The live position; reading it can wait, fail or be refused, so read it inside @try.
		readonly position: Position;
		// One reading.
		current(): Promise<Position>;
	};

	// Opens the share sheet; resolves when it closes.
	share(data: { title?: string; text?: string; url?: string }): Promise<void>;
	haptic(kind?: HapticKind): void;
	readonly notifications: {
		// Tapping the notification opens `route` in the app.
		schedule(options: { title: string; body?: string; at: Date; route: string }): Promise<void>;
	};
	// Opens this app's page in the phone's Settings.
	openSettings(): void;
};

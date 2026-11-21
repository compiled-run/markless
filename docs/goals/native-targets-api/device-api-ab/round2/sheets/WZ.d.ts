// Module: @markless/device
// Each device is a family of parts written <camera.root>, <camera.area> and so on; parts inside a root wire themselves to it.
// A root owns its device: it starts it when shown, asks for permission on first use, and releases it when the root
// leaves the page or the app goes to the background. Settings are props on the root.
// A root sets ui-ready, ui-denied and its family's other states as attributes on itself. For live fields, make a handle
// (camera.handle(), in a component body or a .ts module) and pass it to the root as `handle`; a part outside the root
// points at it with `for={handle}`. Nothing is declared in app config.

export type Facing = 'front' | 'back';

// A photo; `url` works as an <img> src.
export interface Photo { url: string; width: number; height: number }
// A place in degrees.
export interface Place { latitude: number; longitude: number }
// A recorded clip; `url` works as an <audio> src.
export interface Clip { url: string; seconds: number }

type Part<P = {}> = (props: P & { class?: string; children?: unknown }) => Element;

export interface CameraHandle { readonly ready: boolean; readonly denied: boolean }
export declare const camera: {
	handle(): CameraHandle;
	// active={false} releases the camera while the root stays. With scan, onCode fires for every QR code seen, repeats included.
	root: Part<{ handle?: CameraHandle; facing?: Facing; active?: boolean; scan?: boolean; onCapture?: (photo: Photo) => void; onCode?: (text: string) => void }>;
	// The live picture, drawn by the phone; hidden while access is refused.
	area: Part;
	// A button that takes a photo; disabled until the camera is ready.
	trigger: Part<{ for?: CameraHandle }>;
	// Shows its children only while access is refused.
	error: Part;
};

export interface MapHandle {
	readonly center: Place;
	readonly denied: boolean;
	// Moves the map; with no root shown, the root starts there when next shown, instead of at its center prop.
	moveTo(place: Place): void;
}
export declare const map: {
	handle(): MapHandle;
	// center and zoom say where the map starts.
	root: Part<{ handle?: MapHandle; center?: Place; zoom?: number }>;
	// The map, drawn by the phone; put items inside.
	area: Part;
	// A pin at a place; onSelect fires when it is tapped.
	item: Part<{ at: Place; onSelect?: () => void }>;
	// A button that moves the map to the person's location.
	trigger: Part<{ for?: MapHandle }>;
	// Shows its children only while location access is refused.
	error: Part;
};

export interface RecorderHandle { readonly recording: boolean; readonly denied: boolean; readonly seconds: number; readonly clip: Clip | null }
export declare const recorder: {
	handle(): RecorderHandle;
	root: Part<{ handle?: RecorderHandle; onRecord?: (clip: Clip) => void }>;
	// A button that starts recording, and stops it when pressed again; disabled until ready. Sets ui-recording.
	trigger: Part<{ for?: RecorderHandle }>;
	// Text of the whole seconds recorded so far; present only while recording.
	label: Part;
	// Shows its children only while microphone access is refused.
	error: Part;
};

export interface PlayerHandle { readonly playing: boolean; readonly time: number; readonly duration: number }
export declare const player: {
	handle(): PlayerHandle;
	root: Part<{ handle?: PlayerHandle; src: string }>;
	// The picture, with no controls of its own.
	area: Part;
	// A button that plays, and pauses when pressed again. Sets ui-playing.
	trigger: Part<{ for?: PlayerHandle }>;
	// A seek bar: shows progress, and dragging it seeks.
	indicator: Part;
	// Text of the current time, as m:ss.
	label: Part;
};

// Its indicator shows its children only while offline.
export declare const network: { root: Part; indicator: Part };
// Its label is the heading in whole degrees (0 = north), empty until the first reading.
export declare const compass: { root: Part; label: Part };

// Opens this app's page in the phone's Settings.
export function openSettings(): void;

import { targetConstants } from '@markless/serializer/native-device';

// The web meaning of `@markless/device`: every feature is absent. A web build removes what it can at build time (a call
// whose result nothing uses, a branch a `platform` check rules out) and refuses the rest; this module answers anything
// a build left. Phones never run this file: their builds lower each use to data the host runs.

const web = targetConstants('web');

/** Which platform this build is for; each is a build-time constant, so a check of it keeps one branch. */
export const platform = web.platform as {
	readonly ios: boolean;
	readonly android: boolean;
	readonly web: boolean;
};

/** The error an ask rejects with where the feature is absent. */
const absent = (feature: string): Promise<never> =>
	Promise.reject(
		Object.assign(new Error(`${feature} is not available here`), { name: 'NotSupportedError' }),
	);

/** A value with no honest answer on the web: reading it there is an error rather than a guess. */
const noValue = (name: string): never => {
	throw Object.assign(new Error(`${name} has no value on the web`), {
		name: 'NotSupportedError',
	});
};

/** Connectivity. On the web, `online` is always true: nothing is wrong. */
export const network = { online: true } as const;

/** Touch feedback. Absent on the web: a tap does nothing. */
export const haptics = {
	tap(): void {},
} as const;

/** Whether the person let the app use a feature; reading it never asks. */
export type DeviceAccess = 'unknown' | 'granted' | 'limited' | 'denied' | 'blocked';

export type Position = {
	readonly latitude: number;
	readonly longitude: number;
	readonly accuracy: number;
};

/** Where the device is. Absent on the web. */
export const location = {
	get access(): DeviceAccess {
		return noValue('location.access');
	},
	/** Rejects with `NotAllowedError` when the person refuses; with `NotSupportedError` on the web. */
	current(): Promise<Position> {
		return absent('location');
	},
} as const;

export type Photo = { readonly url: string; readonly width: number; readonly height: number };

/** A camera a component made: its picture shows in `<base.camera el={cam} />`, and it is let go when the component leaves. */
export type Camera = {
	/** True once the camera runs and can take a photo. */
	readonly ready: boolean;
	/** Which camera to use; a camera the device does not have snaps back to the one in use. */
	facing: 'back' | 'front';
	/** A photo from this camera's picture; rejects with `NotAllowedError` when the person refused the camera. */
	takePhoto(): Promise<Photo>;
};

/** Makes a camera owned by the calling component. Absent on the web. */
export const camera: (() => Camera) & { readonly access: DeviceAccess } = Object.defineProperty(
	(): Camera => noValue('camera()'),
	'access',
	{ get: () => noValue('camera.access') },
) as (() => Camera) & { readonly access: DeviceAccess };

/** A microphone recorder a component made; it stops and is let go when the component leaves. */
export type Recorder = {
	/** Recording while true: writing true starts (asking for the microphone first), false stops and keeps the clip. */
	active: boolean;
	/** Whole seconds recorded so far, live while recording. */
	readonly seconds: number;
	/** The last recording, playable in `<audio src={rec.clip} controls />`; null until one stops. */
	readonly clip: string | null;
};

/** Makes a recorder owned by the calling component. Absent on the web. */
export const recorder: (() => Recorder) & { readonly access: DeviceAccess } = Object.defineProperty(
	(): Recorder => noValue('recorder()'),
	'access',
	{
		get: () => noValue('recorder.access'),
	},
) as (() => Recorder) & { readonly access: DeviceAccess };

/** The system share panel. Absent on the web. */
export const sharesheet = {
	/** Shows the panel with this content; settles once it closes. Rejects with `NotSupportedError` on the web. */
	open(_content: { readonly title?: string; readonly url: string }): Promise<void> {
		return absent('sharesheet');
	},
} as const;

/** The system Settings screen for this app, where the person changes what they allowed. Absent on the web. */
export const settings = {
	open(): void {},
} as const;

/** The platform's own pieces with your markup inside: `<native.sheet>` is the system sheet on phones. */
export * as native from './native/index.ts';

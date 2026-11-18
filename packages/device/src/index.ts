import { targetConstants } from '@markless/serializer/native-device';

// The web meaning of `@markless/device`: every feature is absent. A web build removes what it can at build time (a call
// whose result nothing uses, a branch a `supported` or `platform` check rules out); this module answers anything left.
// Phones never run this file: their builds lower each use to data the host runs.

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

/** Connectivity. On the web, `online` is always true: nothing is wrong. */
export const network = { supported: false, online: true } as const;

/** Touch feedback. Absent on the web: a tap does nothing. */
export const haptics = {
	supported: false,
	tap(): void {},
} as const;

/** Whether the person let the app use a feature; reading it never asks. */
export type DeviceAccess = 'unknown' | 'granted' | 'limited' | 'denied' | 'blocked';

/** No value means nothing is wrong for permission on the web, so reading `access` there is an error rather than a guess. */
const noAccess = (feature: string): never => {
	throw Object.assign(new Error(`${feature}.access has no value on the web`), {
		name: 'NotSupportedError',
	});
};

export type Position = {
	readonly latitude: number;
	readonly longitude: number;
	readonly accuracy: number;
};

/** Where the device is. Absent on the web. */
export const location = {
	supported: false,
	get access(): DeviceAccess {
		return noAccess('location');
	},
	/** Rejects with `NotSupportedError` on the web. */
	current(): Promise<Position> {
		return absent('location');
	},
} as const;

export type Photo = { readonly url: string; readonly width: number; readonly height: number };

/** The camera. Absent on the web. */
export const camera = {
	supported: false,
	/** The system camera screen, once; rejects with `NotSupportedError` on the web. */
	takePhoto(): Promise<Photo> {
		return absent('camera');
	},
} as const;

/** The system share panel. Absent on the web. */
export const sharesheet = {
	supported: false,
	/** Rejects with `NotSupportedError` on the web. */
	open(_content: { readonly title?: string; readonly url: string }): Promise<void> {
		return absent('sharesheet');
	},
} as const;

/** The platform's own pieces with your markup inside: `<native.sheet>` is the system sheet on phones. */
export * as native from './native/index.ts';

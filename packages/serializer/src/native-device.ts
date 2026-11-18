// What `@markless/device` offers, by the name a build records: the protocol both the compiler and every host read.

/** The package authors import device features from. */
export const DEVICE_MODULE = '@markless/device';

/** A feature that may need the person's permission, and what each platform's app manifest must declare for it. */
export type NativeDeviceFeature =
	| 'network'
	| 'haptics'
	| 'location'
	| 'camera'
	| 'microphone'
	| 'sharesheet'
	| 'settings';

export const DEVICE_FEATURES: {
	readonly [feature in NativeDeviceFeature]: {
		/** Info.plist keys whose usage text the app config must give; empty when iOS asks nothing. */
		readonly iosUsageKeys: ReadonlyArray<string>;
		/** Android manifest `<uses-permission>` names. */
		readonly androidPermissions: ReadonlyArray<string>;
	};
} = {
	network: { iosUsageKeys: [], androidPermissions: ['android.permission.ACCESS_NETWORK_STATE'] },
	haptics: { iosUsageKeys: [], androidPermissions: [] },
	location: {
		iosUsageKeys: ['NSLocationWhenInUseUsageDescription'],
		androidPermissions: [
			'android.permission.ACCESS_COARSE_LOCATION',
			'android.permission.ACCESS_FINE_LOCATION',
		],
	},
	camera: {
		iosUsageKeys: ['NSCameraUsageDescription'],
		androidPermissions: ['android.permission.CAMERA'],
	},
	microphone: {
		iosUsageKeys: ['NSMicrophoneUsageDescription'],
		androidPermissions: ['android.permission.RECORD_AUDIO'],
	},
	sharesheet: { iosUsageKeys: [], androidPermissions: [] },
	settings: { iosUsageKeys: [], androidPermissions: [] },
};

/** Live values a component reads; reading one never asks permission. `initial` is what a build renders before the device answers. */
export const DEVICE_VALUES = {
	'network.online': { feature: 'network', initial: true },
	'location.access': { feature: 'location', initial: 'unknown' },
	'camera.access': { feature: 'camera', initial: 'unknown' },
	'recorder.access': { feature: 'microphone', initial: 'unknown' },
	/** Fields of a camera object (`cam.ready`); `facing` is a setting a handler may write. */
	'camera.ready': { feature: 'camera', initial: false, object: true },
	'camera.facing': { feature: 'camera', initial: 'back', object: true, writable: true },
	/** Fields of a recorder object: writing `active` starts and stops recording; `clip` is a file URL once one stops. */
	'recorder.active': { feature: 'microphone', initial: false, object: true, writable: true },
	'recorder.seconds': { feature: 'microphone', initial: 0, object: true },
	'recorder.clip': { feature: 'microphone', initial: null, object: true },
} as const satisfies Readonly<
	Record<
		string,
		{
			readonly feature: NativeDeviceFeature;
			readonly initial: boolean | number | string | null;
			readonly object?: true;
			readonly writable?: true;
		}
	>
>;

export type NativeDeviceValue = keyof typeof DEVICE_VALUES;

/** Calls a handler or an async computed makes; `async` ones give a value later (a task) and may be refused. */
export const DEVICE_CALLS = {
	'haptics.tap': { feature: 'haptics', async: false },
	'location.current': { feature: 'location', async: true },
	/** A camera object's photo from its own preview, once it is ready: `{ url, width, height }`. */
	'camera.takePhoto': { feature: 'camera', async: true, object: true },
	/** The system share panel with `{ title, url }`; settles once the panel closes. */
	'sharesheet.open': { feature: 'sharesheet', async: true },
	/** The system Settings screen for this app. */
	'settings.open': { feature: 'settings', async: false },
} as const satisfies Readonly<
	Record<string, { readonly feature: NativeDeviceFeature; readonly async: boolean; readonly object?: true }>
>;

/** Device objects a component makes, by the `@markless/device` export that makes them. */
export const DEVICE_OBJECTS = {
	camera: { feature: 'camera' },
	recorder: { feature: 'microphone' },
} as const satisfies Readonly<Record<string, { readonly feature: NativeDeviceFeature }>>;

export type NativeDeviceObject = keyof typeof DEVICE_OBJECTS;

export type NativeDeviceCall = keyof typeof DEVICE_CALLS;

/** The error name a refused ask rejects with, on every platform (the web's `DOMException` name). */
export const DEVICE_REFUSED_ERROR = 'NotAllowedError';

/** What a build compiles for; `native` is one payload for both phones, where only `platform.web` is decided. */
export type BuildTarget = 'web' | 'ios' | 'android' | 'native';

/** The `@markless/device` exports a module may import. */
export const DEVICE_EXPORTS = [
	'platform',
	'network',
	'haptics',
	'location',
	'camera',
	'recorder',
	'sharesheet',
	'settings',
] as const;

/**
 * The fields of `@markless/device` exports that are build-time constants on each target, and their values. A read of
 * one folds to its value: an `@if` it decides keeps only the chosen arm. `platform` is the only check that rules a
 * feature out on the web. There every feature is absent, and a live value takes the value that means nothing is wrong
 * (`network.online`); a value with no honest constant (`location.access`) is not listed.
 */
export function targetConstants(
	target: BuildTarget,
): Readonly<Record<string, Readonly<Record<string, boolean>>>> {
	return {
		platform:
			target === 'native'
				? { web: false }
				: { ios: target === 'ios', android: target === 'android', web: target === 'web' },
		...(target === 'web' ? { network: { online: true } } : {}),
	};
}

/** Elements that show a device object, by the `@markless/ui` part authors write: `<native.camera el={cam} />`. */
export const DEVICE_ELEMENTS = [
	{ module: '@markless/ui', export: 'native', member: 'camera', element: 'camera', device: 'camera' },
	/** The earlier spelling, kept as an alias while code moves to `native.camera`. */
	{ module: '@markless/ui', export: 'base', member: 'camera', element: 'camera', device: 'camera' },
] as const;

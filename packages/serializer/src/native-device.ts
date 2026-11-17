// What `@markless/device` offers, by the name a build records: the protocol both the compiler and every host read.

/** The package authors import device features from. */
export const DEVICE_MODULE = '@markless/device';

/** A feature that may need the person's permission, and what each platform's app manifest must declare for it. */
export type NativeDeviceFeature = 'network' | 'haptics' | 'location' | 'camera';

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
};

/** Live values a component reads; reading one never asks permission. `initial` is what a build renders before the device answers. */
export const DEVICE_VALUES = {
	'network.online': { feature: 'network', initial: true },
	'location.access': { feature: 'location', initial: 'unknown' },
} as const satisfies Readonly<
	Record<string, { readonly feature: NativeDeviceFeature; readonly initial: boolean | string }>
>;

export type NativeDeviceValue = keyof typeof DEVICE_VALUES;

/** Calls a handler or an async computed makes; `async` ones give a value later (a task) and may be refused. */
export const DEVICE_CALLS = {
	'haptics.tap': { feature: 'haptics', async: false },
	'location.current': { feature: 'location', async: true },
} as const satisfies Readonly<
	Record<string, { readonly feature: NativeDeviceFeature; readonly async: boolean }>
>;

export type NativeDeviceCall = keyof typeof DEVICE_CALLS;

/** The error name a refused ask rejects with, on every platform (the web's `DOMException` name). */
export const DEVICE_REFUSED_ERROR = 'NotAllowedError';

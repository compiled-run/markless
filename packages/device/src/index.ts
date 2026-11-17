import { DEVICE_REFUSED_ERROR } from '@markless/serializer/native-device';

// The web meaning of each device feature. A native build never runs this file: the compiler lowers each use to data its
// host runs (`@markless/serializer/native-device` lists them).

const browser = (): Navigator | undefined =>
	typeof navigator === 'undefined' ? undefined : navigator;

/** Connectivity. Free to read; asks nothing. */
export const network = {
	/** Whether the device has a network connection; true where nothing can tell (a server render). */
	get online(): boolean {
		return browser()?.onLine ?? true;
	},
};

/** Touch feedback. */
export const haptics = {
	/** A short tap; nothing happens where the device has no vibration. */
	tap(): void {
		browser()?.vibrate?.(10);
	},
};

export type Position = {
	readonly latitude: number;
	readonly longitude: number;
	readonly accuracy: number;
};

/** Where the device is. Asking for it asks the person the first time. */
export const location = {
	/** The device's position once; rejects with an error named `NotAllowedError` when the person refuses. */
	current(): Promise<Position> {
		const geolocation = browser()?.geolocation;
		if (!geolocation) return Promise.reject(new Error('This device cannot tell its position'));
		return new Promise((resolve, reject) =>
			geolocation.getCurrentPosition(
				(position) =>
					resolve({
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
						accuracy: position.coords.accuracy,
					}),
				(error) =>
					reject(
						error.code === error.PERMISSION_DENIED
							? Object.assign(new Error(error.message || 'Location was refused'), {
									name: DEVICE_REFUSED_ERROR,
								})
							: new Error(error.message || 'The position is not available'),
					),
			),
		);
	},
};

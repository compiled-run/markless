import { expect, test } from 'vitest';
import { simulatorRuntime } from '../src/harness/simulator-runtime.ts';

const runtime = (identifier: string, version: string, phones: string[]) => ({
	identifier,
	platform: 'iOS',
	isAvailable: true,
	version,
	supportedDeviceTypes: phones.map((name) => ({ name })),
});

test('a simulator is created on the newest runtime that runs its phone, not on a device-specific one of the same version', () => {
	const runtimes = [
		runtime('com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4', '27.2', ['iPhone 17e']),
		runtime('com.apple.CoreSimulator.SimRuntime.iOS-27-2', '27.2', [
			'iPhone 17',
			'iPhone 17 Pro',
		]),
		runtime('com.apple.CoreSimulator.SimRuntime.iOS-26-4', '26.4', ['iPhone 17']),
	];
	expect(simulatorRuntime(runtimes, 'iPhone 17')).toBe(
		'com.apple.CoreSimulator.SimRuntime.iOS-27-2',
	);
	expect(simulatorRuntime(runtimes, 'iPhone 17e')).toBe(
		'com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4',
	);
	expect(() => simulatorRuntime(runtimes, 'iPad Air')).toThrow(
		'no installed iOS simulator runtime supports the device type iPad Air',
	);
});

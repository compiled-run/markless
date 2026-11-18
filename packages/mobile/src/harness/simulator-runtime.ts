export type SimctlRuntime = {
	readonly identifier: string;
	readonly platform: string;
	readonly isAvailable: boolean;
	readonly version: string;
	readonly supportedDeviceTypes?: ReadonlyArray<{ readonly name: string }>;
};

/**
 * The newest available iOS runtime that can run `deviceType`. A device-specific runtime of the same version
 * (`iOS-27-2-iPhone19-4`) refuses other phones with "Incompatible device".
 */
export function simulatorRuntime(
	runtimes: ReadonlyArray<SimctlRuntime>,
	deviceType: string,
): string {
	const fitting = runtimes
		.filter(
			(runtime) =>
				runtime.platform === 'iOS' &&
				runtime.isAvailable &&
				(runtime.supportedDeviceTypes ?? []).some((type) => type.name === deviceType),
		)
		.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
	if (fitting.length === 0)
		throw new Error(
			`no installed iOS simulator runtime supports the device type ${deviceType}`,
		);
	return fitting[0]!.identifier;
}

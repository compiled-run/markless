import { exec, ExecTimeout, type ExecOptions, type ExecResult } from './exec.ts';

/** How long one simctl call may take: a stuck simulator never answers `simctl ui … appearance` (measured hung for hours). */
export const SIMCTL_TIMEOUT_MS = 60_000;

/** A simctl call the simulator did not answer in time: the simulator is stuck, and the phone is restarted. */
export class SimulatorStuck extends Error {}

/** `xcrun simctl <args>`, killed and refused by name when it does not end within `timeoutMs`. */
export async function simctl(
	args: ReadonlyArray<string>,
	options: ExecOptions = {},
): Promise<ExecResult> {
	const timeoutMs = options.timeoutMs ?? SIMCTL_TIMEOUT_MS;
	try {
		return await exec('xcrun', ['simctl', ...args], { ...options, timeoutMs });
	} catch (error) {
		if (error instanceof ExecTimeout)
			throw new SimulatorStuck(
				`simctl ${args.join(' ')} did not answer in ${timeoutMs / 1000} s: the simulator is stuck`,
			);
		throw error;
	}
}

/** Whether the simulator reads Booted and answers a read of its appearance in time: a stuck one reads Booted and never answers. */
export async function simulatorAnswers(
	udid: string,
	timeoutMs = SIMCTL_TIMEOUT_MS,
): Promise<boolean> {
	try {
		const listed = await simctl(['list', 'devices', '--json'], {
			allowFailure: true,
			timeoutMs,
		});
		if (listed.code !== 0) return false;
		const devices = Object.values(
			(
				JSON.parse(listed.stdout) as {
					devices: Record<string, Array<{ udid: string; state: string }>>;
				}
			).devices,
		).flat();
		if (!devices.some((device) => device.udid === udid && device.state === 'Booted'))
			return false;
		return (
			(await simctl(['ui', udid, 'appearance'], { allowFailure: true, timeoutMs })).code === 0
		);
	} catch {
		return false;
	}
}

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bootEmulator, emulatorAnswers } from '../harness/android.ts';
import { exec } from '../harness/exec.ts';
import { bootSimulator } from '../harness/ios.ts';
import type { AndroidTools } from '../harness/tools.ts';
import type { PhoneAddress, PhoneSpec } from './pool.ts';

/** Boots (or finds running) the phone and returns its address; the caller holds the machine queue's admission meanwhile. */
export async function bootPhone(
	spec: PhoneSpec,
	tools: AndroidTools | undefined,
): Promise<PhoneAddress> {
	if (spec.platform === 'ios') return { device: (await bootSimulator(spec.name)).udid };
	if (!tools) throw new Error('the Android tools are missing');
	return { device: (await bootEmulator(tools, spec.avd, spec.port)).serial };
}

/** Whether the phone still answers: the simulator reads Booted, the emulator is an adb `device` that finished booting. */
export async function phoneAnswers(
	spec: PhoneSpec,
	address: PhoneAddress,
	tools: AndroidTools | undefined,
): Promise<boolean> {
	if (spec.platform === 'ios') {
		const listed = await exec('xcrun', ['simctl', 'list', 'devices', '--json'], {
			allowFailure: true,
		});
		if (listed.code !== 0) return false;
		const devices = Object.values(
			(
				JSON.parse(listed.stdout) as {
					devices: Record<string, Array<{ udid: string; state: string }>>;
				}
			).devices,
		).flat();
		return devices.some(
			(device) => device.udid === address.device && device.state === 'Booted',
		);
	}
	return tools !== undefined && emulatorAnswers(tools, address.device);
}

/** Whether the phone is up already (booted by an earlier runner): reusing it needs no boot. */
export async function phoneRunning(
	spec: PhoneSpec,
	tools: AndroidTools | undefined,
): Promise<boolean> {
	if (spec.platform === 'android')
		return (
			tools !== undefined &&
			(await phoneAnswers(spec, { device: `emulator-${spec.port}` }, tools))
		);
	const listed = await exec('xcrun', ['simctl', 'list', 'devices', '--json'], {
		allowFailure: true,
	});
	if (listed.code !== 0) return false;
	return Object.values(
		(
			JSON.parse(listed.stdout) as {
				devices: Record<string, Array<{ name: string; state: string }>>;
			}
		).devices,
	)
		.flat()
		.some((device) => device.name === spec.name && device.state === 'Booted');
}

/** Stops the phone so the next boot starts clean; only ever the pool's own phones, by their own names. */
export async function stopPhone(spec: PhoneSpec, tools: AndroidTools | undefined): Promise<void> {
	if (spec.platform === 'ios') {
		await exec('xcrun', ['simctl', 'shutdown', spec.name], { allowFailure: true });
		return;
	}
	if (!tools) return;
	const serial = `emulator-${spec.port}`;
	await exec(tools.adb, ['-s', serial, 'emu', 'kill'], {
		allowFailure: true,
		timeoutMs: 20_000,
	}).catch(() => undefined);
	for (let waited = 0; waited < 60; waited++) {
		const state = await exec(tools.adb, ['-s', serial, 'get-state'], { allowFailure: true });
		if (state.code !== 0) return;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

/** The machine queue every heavy command on this machine goes through (`~/.claude/bin/heavy`), when it is installed. */
export const heavyCommand = (): string | undefined => {
	const path = process.env.MARKLESS_PHONES_HEAVY ?? join(homedir(), '.claude', 'bin', 'heavy');
	return existsSync(path) ? path : undefined;
};

/**
 * Holds an admission from the machine queue for `gigabytes` while `work` runs, without running `work` inside the queue's
 * process tree: the queue stops whatever a job leaves running, and a booted phone must outlive its boot.
 */
export async function withAdmission<T>(
	gigabytes: number,
	label: string,
	work: () => Promise<T>,
): Promise<T> {
	const heavy = heavyCommand();
	if (!heavy) return work();
	const gate = spawn(
		heavy,
		[
			process.execPath,
			'-e',
			`process.stdout.write('admitted\\n'); process.stdin.resume(); process.stdin.on('end', () => process.exit(0)); // ${label}`,
		],
		{
			env: {
				...process.env,
				HEAVY_GB: String(gigabytes),
				HEAVY_CORES: '2',
				HEAVY_MAX_WAIT: '0',
			},
			stdio: ['pipe', 'pipe', 'inherit'],
		},
	);
	await new Promise<void>((resolve, reject) => {
		gate.stdout.on('data', (chunk: Buffer) => {
			if (chunk.toString().includes('admitted')) resolve();
		});
		gate.on('exit', (code) =>
			reject(new Error(`the machine queue ended the admission for ${label} (${code})`)),
		);
	});
	try {
		return await work();
	} finally {
		gate.stdin.end();
	}
}

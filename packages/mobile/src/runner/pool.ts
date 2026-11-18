// The pool's phones and their life, with no device code: the runner and its tests share these.
import type { ProofPlatform } from '../harness/proof-app.ts';

export type PhoneSpec =
	| { readonly platform: 'ios'; readonly name: string }
	| { readonly platform: 'android'; readonly avd: string; readonly port: number };

export const phoneId = (spec: PhoneSpec): string =>
	spec.platform === 'ios' ? `ios:${spec.name}` : `android:${spec.avd}@${spec.port}`;

/** `--ios <simulator>` and `--android <avd>@<port>` from the command line. */
export function parsePhone(platform: ProofPlatform, text: string): PhoneSpec {
	if (platform === 'ios') return { platform, name: text };
	const at = text.lastIndexOf('@');
	const port = Number(text.slice(at + 1));
	if (at <= 0 || !Number.isInteger(port) || port % 2 !== 0)
		throw new Error(`--android is <avd>@<even console port>, not ${text}`);
	return { platform, avd: text.slice(0, at), port };
}

export const DEFAULT_POOL: ReadonlyArray<PhoneSpec> = [
	{ platform: 'ios', name: 'markless-runner' },
	// Maestro finds emulators by adb port 5555-5585: on console port 5620 it lost the emulator in 7 of 48 rungs (2026-11-18).
	{ platform: 'android', avd: 'markless_runner', port: 5570 },
];

/** Where the phone answers: the simulator's udid or the emulator's adb serial. */
export type PhoneAddress = { readonly device: string };

/** A phone's life in the pool; only the runner moves it, through `transitionPhone`. */
export type PhoneState =
	| { readonly state: 'booting'; readonly since: number }
	/** `driverInstalled`: a chunk ran since the last boot, so Maestro's driver app is on the phone and later flows skip reinstalling it. */
	| {
			readonly state: 'ready';
			readonly device: string;
			readonly since: number;
			readonly driverInstalled: boolean;
	  }
	| {
			readonly state: 'busy';
			readonly device: string;
			readonly since: number;
			readonly chunk: string;
			readonly driverInstalled: boolean;
	  }
	| { readonly state: 'restarting'; readonly since: number; readonly reason: string }
	/** Three boots in a row failed: the runner stops trying until it is restarted. */
	| { readonly state: 'broken'; readonly since: number; readonly reason: string };

export type PhoneEvent =
	| { readonly type: 'booted'; readonly device: string }
	| { readonly type: 'take'; readonly chunk: string }
	| { readonly type: 'release' }
	| { readonly type: 'lost'; readonly reason: string }
	| { readonly type: 'give-up'; readonly reason: string };

export function transitionPhone(phone: PhoneState, event: PhoneEvent, at = Date.now()): PhoneState {
	switch (event.type) {
		case 'booted':
			if (phone.state === 'booting' || phone.state === 'restarting')
				return { state: 'ready', device: event.device, since: at, driverInstalled: false };
			break;
		case 'take':
			if (phone.state === 'ready')
				return {
					state: 'busy',
					device: phone.device,
					since: at,
					chunk: event.chunk,
					driverInstalled: phone.driverInstalled,
				};
			break;
		case 'release':
			if (phone.state === 'busy')
				return { state: 'ready', device: phone.device, since: at, driverInstalled: true };
			break;
		case 'lost':
			if (phone.state === 'ready' || phone.state === 'busy' || phone.state === 'booting')
				return { state: 'restarting', since: at, reason: event.reason };
			break;
		case 'give-up':
			if (phone.state === 'booting' || phone.state === 'restarting')
				return { state: 'broken', since: at, reason: event.reason };
			break;
	}
	throw new Error(`a ${phone.state} phone cannot take ${event.type}`);
}

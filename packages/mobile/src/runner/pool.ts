// The pool's phones and their life, with no device code: the runner and its tests share these.
import type { ProofPlatform } from '../harness/proof-app.ts';

export type PhoneSpec =
	| { readonly platform: 'ios'; readonly name: string }
	| {
			readonly platform: 'android';
			readonly avd: string;
			readonly port: number;
			/** An emulator on another machine, reached through this ssh host (see remote.ts); absent for this machine's own. */
			readonly remote?: string;
	  };

export const phoneId = (spec: PhoneSpec): string =>
	spec.platform === 'ios'
		? `ios:${spec.name}`
		: `android:${spec.avd}@${spec.port}${spec.remote ? `@${spec.remote}` : ''}`;

export const isRemote = (spec: PhoneSpec): boolean =>
	spec.platform === 'android' && spec.remote !== undefined;

/** `--ios <simulator>` and `--android <avd>@<port>[@<ssh host>]` from the command line. */
export function parsePhone(platform: ProofPlatform, text: string): PhoneSpec {
	if (platform === 'ios') return { platform, name: text };
	const [avd, portText, remote, ...rest] = text.split('@');
	const port = Number(portText);
	if (!avd || !Number.isInteger(port) || rest.length > 0 || remote === '')
		throw new Error(`--android is <avd>@<console port>[@<ssh host>], not ${text}`);
	if (port % 2 !== 0 || port < EMULATOR_PORTS.first || port > EMULATOR_PORTS.last)
		throw new Error(
			`console port ${port} is outside adb's range: an even port from ${EMULATOR_PORTS.first} to ${EMULATOR_PORTS.last}, so its adb port (console + 1) is at most 5585`,
		);
	return remote === undefined ? { platform, avd, port } : { platform, avd, port, remote };
}

/**
 * adb supports emulators whose adb port (console + 1) is in [5555, 5586]; outside it the emulator warns "ADB may not
 * function properly" and runs dropped the device (5620 here: 7 of 87 Android rungs "not connected", 2026-11-18).
 */
export const EMULATOR_PORTS = { first: 5554, last: 5584 } as const;

export const DEFAULT_POOL: ReadonlyArray<PhoneSpec> = [
	{ platform: 'ios', name: 'markless-runner' },
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
	| {
			readonly state: 'restarting';
			readonly since: number;
			readonly reason: string;
	  }
	/** Three boots in a row failed: the runner stops trying until it is restarted. */
	| {
			readonly state: 'broken';
			readonly since: number;
			readonly reason: string;
	  }
	/** A remote phone whose machine does not take work now (paused for games, asleep, or unreachable): the runner asks again every minute. */
	| { readonly state: 'away'; readonly since: number; readonly reason: string };

export type PhoneEvent =
	| { readonly type: 'booted'; readonly device: string }
	| { readonly type: 'take'; readonly chunk: string }
	| { readonly type: 'release' }
	| { readonly type: 'lost'; readonly reason: string }
	| { readonly type: 'give-up'; readonly reason: string }
	| { readonly type: 'away'; readonly reason: string };

export function transitionPhone(phone: PhoneState, event: PhoneEvent, at = Date.now()): PhoneState {
	switch (event.type) {
		case 'booted':
			if (phone.state === 'booting' || phone.state === 'restarting' || phone.state === 'away')
				return {
					state: 'ready',
					device: event.device,
					since: at,
					driverInstalled: false,
				};
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
				return {
					state: 'ready',
					device: phone.device,
					since: at,
					driverInstalled: true,
				};
			break;
		case 'lost':
			if (phone.state === 'ready' || phone.state === 'busy' || phone.state === 'booting')
				return { state: 'restarting', since: at, reason: event.reason };
			break;
		case 'away':
			if (phone.state !== 'broken')
				return {
					state: 'away',
					since: phone.state === 'away' ? phone.since : at,
					reason: event.reason,
				};
			break;
		case 'give-up':
			if (phone.state === 'booting' || phone.state === 'restarting')
				return { state: 'broken', since: at, reason: event.reason };
			break;
	}
	throw new Error(`a ${phone.state} phone cannot take ${event.type}`);
}

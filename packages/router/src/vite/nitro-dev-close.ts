import type { Plugin } from 'vite';

// Nitro's Vite plugin opens its scan-dir and root watchers in dev but never closes its Nitro instance when the dev server closes.
interface ClosableNitro {
	close(): Promise<void>;
}

export interface DevNitroState {
	nitro: ClosableNitro | undefined;
}

export function devNitroState(): DevNitroState {
	return { nitro: undefined };
}

export function devNitroModule(state: DevNitroState) {
	return {
		name: 'markless-router:dev-nitro',
		setup(nitro: ClosableNitro) {
			state.nitro = nitro;
		},
	};
}

export function devNitroClosePlugin(state: DevNitroState): Plugin {
	return {
		name: 'markless-router:dev-nitro-close',
		apply: 'serve',
		async closeBundle() {
			const nitro = state.nitro;
			state.nitro = undefined;
			await nitro?.close();
		},
	};
}

import type { Starter } from './index.ts';

/** The port each starter's `dev` script serves on; every starter is a Router app on Nitro, whose dev server defaults to 3000. */
export const STARTER_DEV_PORTS = {
	minimal: 3000,
	app: 3000,
	docs: 3000,
	'full-stack': 3000,
} as const satisfies Record<Starter, number>;

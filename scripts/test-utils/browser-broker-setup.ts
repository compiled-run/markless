import { chromium, firefox, webkit } from '@playwright/test';
import { startBrowserBroker } from './browser-broker.ts';

const types = { chromium, firefox, webkit };

export default function setup(): Promise<() => Promise<void>> {
	return startBrowserBroker((type, options) => types[type].launchServer(options), 5_000);
}

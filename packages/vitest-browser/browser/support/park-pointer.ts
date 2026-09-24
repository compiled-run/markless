import { beforeAll } from 'vitest';
import { commands } from 'vitest/browser';

declare module 'vitest/browser' {
	export interface BrowserCommands {
		parkPointer(): Promise<void>;
	}
}

// Every file shares one real mouse: park it off the page and drop focus so a file
// never inherits hover or focus a previous file's pointer left over its markup.
beforeAll(async () => {
	await commands.parkPointer();
	(document.activeElement as HTMLElement | null)?.blur?.();
});

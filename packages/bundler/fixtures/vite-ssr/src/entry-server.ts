import { payloadScripts } from './root.tsrx';
import { renderServerShell } from './render-shell.ts';

export const preloadRoots = [
	...payloadScripts.view.events.flatMap((event) =>
		event.symbolIds.map((name) => ({ name, priority: 'high' as const })),
	),
	...payloadScripts.view.domUpdates.flatMap((update) =>
		update.symbolId ? [{ name: update.symbolId, priority: 'low' as const }] : [],
	),
];

export function render(
	resumeModuleUrl = '',
	modulePreloads: Parameters<typeof renderServerShell>[2] = [],
): string {
	return renderServerShell(payloadScripts, resumeModuleUrl, modulePreloads);
}

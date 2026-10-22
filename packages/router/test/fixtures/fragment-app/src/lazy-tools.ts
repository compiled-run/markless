export function toolsText(): Promise<string> {
	return import('./lazy-panel.ts').then((panel) => panel.panelText());
}

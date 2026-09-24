export type Section = { readonly label: string; readonly body: string };

function loadSections(): readonly Section[] {
	return [{ label: 'Intro', body: 'Hello' }];
}

export const SECTIONS: readonly Section[] = loadSections();

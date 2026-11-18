// The values the reload figure shows, its hint tour and the sentence its live region speaks.
export const SITE = 'notes.app';
export const SAVED = 'storage()';
export const PLAIN = 'state()';
export const SAVED_CAPTION = `switch: ${SAVED}`;
export const PLAIN_CAPTION = `sidebar: ${PLAIN}`;
/** Each reload flips the beat, so the flicker restarts. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const RELOAD_TOUR = ['dark', 'open', 'reload', 'rest', 'reset', 'rest'] as const;
/** How far, in drawing units, the cookie must be dragged out of the address bar to clear site data. */
export const CLEAR_AT = 40;

export type Page = { readonly dark: boolean; readonly open: boolean; readonly cookie: boolean };
export const START: Page = { dark: false, open: false, cookie: true };

/** A reload: state() starts over, storage() comes back only if its cookie is still there. */
export function reloaded(page: Page): Page {
	return { dark: page.cookie ? page.dark : false, open: false, cookie: page.cookie };
}

export function describeReload(before: Page, after: Page): string {
	const sidebar = before.open ? 'The sidebar closed again: it was state().' : 'The sidebar stayed closed.';
	if (!before.cookie && before.dark) return `Reloaded with the site data cleared, so dark mode is off too. ${sidebar}`;
	if (after.dark) return `Reloaded. Dark mode stayed on: storage() kept it in a cookie. ${sidebar}`;
	return `Reloaded. ${sidebar}`;
}

export const describeSwitch = (dark: boolean) => (dark ? 'Dark mode on, saved by storage().' : 'Dark mode off, saved by storage().');
export const describeSidebar = (open: boolean) => (open ? 'Sidebar open. It lives in state().' : 'Sidebar closed.');
export const describeCookie = (cookie: boolean) =>
	cookie ? 'Cookie back in place.' : 'Site data cleared. Reload, and dark mode starts over too.';

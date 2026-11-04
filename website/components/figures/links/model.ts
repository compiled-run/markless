// The values the link figure shows, its tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
export const ABOUT_TITLE = 'About us';
export const ABOUT_LINES = ['Roasted on Mondays,', 'in small batches.'] as const;
export const HOME_URL = 'beanshop.dev';
export const ABOUT_URL = 'beanshop.dev/about';
/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const LINK_TOUR = ['go', 'rest', 'go', 'rest', 'rest'] as const;

export type Place = 'home' | 'about';
export const other = (at: Place): Place => (at === 'home' ? 'about' : 'home');

export function describeLink(at: Place, pressed: boolean): string {
	if (!pressed) return '';
	return at === 'about'
		? 'Clicked About. The page stayed. The About part arrived from the server, and only the middle of the page and the address changed, together.'
		: 'Clicked Shop. The page stayed. The shop part arrived from the server, and only the middle of the page and the address changed, together.';
}

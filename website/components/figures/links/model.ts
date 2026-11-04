// The values the magazine figure shows, its tour and the sentence its live region speaks.
export const SHOP = 'Beanshop';
export const ISSUE = 'Fresh beans, weekly';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
export const HOME_LINES = ['Roasted on Mondays', 'Free returns for 30 days', 'Ships in two days'] as const;
export const ABOUT_TITLE = 'About us';
export const ABOUT_LINES = ['A small roastery', 'by the harbour,', 'since 2019.'] as const;
export const ABOUT_CAPTION = 'Come say hello';
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
		? 'Clicked About. The cover stayed. The shop spread slid out, the About spread slid in, and only then did the spine change to beanshop.dev/about.'
		: 'Clicked Shop. The cover stayed. The About spread slid out, the shop spread slid in, and only then did the spine change to beanshop.dev.';
}

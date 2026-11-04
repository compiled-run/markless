// The Events figure's values: the name typed into the mug field, one letter per key press, its tour and its spoken sentence.
export const SHOP = 'Beanshop';
export const PRODUCT = 'House blend · 250 g';
export const PRICE = '$14';
export const NAME = 'Ada';
export const START = 1;

export const typed = (letters: number) => NAME.slice(0, letters);
export const press = (letters: number) => (letters >= NAME.length ? 1 : letters + 1);
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const TYPING_TOUR = ['key', 'key', 'rest', 'rest', 'reset'] as const;

/** Where the crossed-out and live preview sit, in text units from the start of the preview line. */
export const PREVIEW_OLD = 70;
export const PREVIEW_NEW = 100;

export function describeTyping(letters: number, pressed: boolean): string {
	return pressed
		? `Typed a key. The browser's input event ran the handler, which set name to "${typed(letters)}". The preview now shows ${typed(letters)}; nothing else on the page changed.`
		: `The field holds "${typed(letters)}", and the preview shows ${typed(letters)}.`;
}

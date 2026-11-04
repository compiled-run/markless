// The Styling page's two-cards demo: reading each card's real class string off the page.
export const HIDDEN = '(press Show classes)';

/** The class strings of the cards on the sheet, in page order. */
export const classesIn = (sheet: Element | undefined): string[] =>
	sheet ? [...sheet.querySelectorAll('article')].map((card) => card.getAttribute('class') ?? '') : [];

/** The sentence a screen reader hears once the classes show. */
export const describeClasses = (classes: readonly string[]): string =>
	classes.length === 0 ? '' : 'The paper card has class ' + classes[0] + '. The chalk card has class ' + classes[1] + '.';

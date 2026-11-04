// The Events page's mug-label demo: what each handler got from the browser, in words.
export type Heard = { readonly spot: number; readonly what: string };

export const NOTHING: Heard = { spot: 0, what: 'nothing yet' };

export const heardInput = (value: string): Heard => ({ spot: 1, what: `input: the field now reads "${value}"` });
export const heardKey = (key: string): Heard => ({ spot: 2, what: `keydown: event.key is "${key}"` });
export const heardSubmit = (): Heard => ({ spot: 3, what: 'submit: preventDefault() kept the page' });

/** The sentence a screen reader hears after an event. */
export const describeHeard = (heard: Heard, printed: string): string =>
	heard.spot === 0 ? '' : `Last event, ${heard.what}. Printed: ${printed}.`;

// The Events figure's values: the key the event carries, how the cap and the card show it, and what the live region says.
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

/** What the key cap shows: a single character as typed, a named key shortened. */
export const capOf = (key: string) => (key === ' ' ? '␣' : key.length === 1 ? key : key.slice(0, 5));

/** The card the handler receives: the event's real `key` field. */
export const cardText = (key: string) => `key: ${JSON.stringify(key)}`;

export const describeKey = (key: string) => `The browser handed your handler an event: key is ${JSON.stringify(key)}.`;

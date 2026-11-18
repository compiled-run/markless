// The Events form figure's values: the typed email, who has joined, whether submit keeps the page, and what the live region says.
export const EMAILS = ['ada@example.com', 'grace@example.com', 'alan@example.com'] as const;
export const SHOWN = 3;
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

/** The next sample email a click on the field types, skipping ones already used. */
export const nextEmail = (joined: readonly string[]) => EMAILS.find((email) => !joined.includes(email)) ?? EMAILS[joined.length % EMAILS.length]!;

export function describeSubmit(prevent: boolean, email: string): string {
	if (email === '') return 'The box is empty. Click it to type an email first.';
	return prevent
		? `preventDefault() kept the page: ${email} joined the list, and nothing reloaded.`
		: `No preventDefault(): the browser reloaded the page, and ${email} was thrown away.`;
}

export const describeSwitch = (prevent: boolean) =>
	prevent ? 'preventDefault() is on: Join keeps the page.' : 'preventDefault() is off: Join reloads the page.';

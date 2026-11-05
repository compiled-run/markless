// The pull request the review figure draws: the branch from the page's first command, and two findings, one from a person and one from CodeRabbit.

export const BRANCH = 'fix/chat-timestamps';
export const TITLE = 'Show the time on each chat message';

/** Two review findings, one per reviewer the page names. */
export const FINDINGS = [
	{ who: 'Ada', file: 'chat.tsrx', text: 'The time shows in UTC here. Readers expect their own time zone.' },
	{ who: 'CodeRabbit', file: 'chat.browser.ts', text: 'This test only checks the first message. Add one that sends a reply.' },
];

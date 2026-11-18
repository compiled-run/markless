// The pull request the step-through draws: the branch from the page's first command, the checks GitHub lists, and one finding in the shape Macroscope posts.

export const BRANCH = 'fix/chat-timestamps';
export const TITLE = 'Show the time on each chat message';

/** Checks as GitHub lists them on a pull request here: three required CI jobs and Macroscope's own check. */
export const CHECKS = ['typecheck', 'agent-files', 'test', 'Macroscope'];

/** One inline finding, headed the way Macroscope heads them: a severity chip and the file and line. */
export const FINDING = { bot: 'Macroscope', severity: 'High', where: 'chat.tsrx:12', text: 'The time shows in UTC, not the reader’s zone.' };

/** One plain caption per step, shown under the drawing. */
export const STEPS = [
	'Open the pull request. CI starts its checks right away.',
	'Macroscope, the review bot, leaves a finding on a line.',
	'Fix it or reply with your reason, and the thread resolves.',
	'Every check turns green.',
	'Merge when ready puts it in the merge queue, which tests it once more.',
	'The queue merges it into main.',
];

/** The stepper rail's rows, keyed by step. */
export const RAIL = STEPS.map((caption, key) => ({ key, caption, n: String(key + 1) }));

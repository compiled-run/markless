// The vending machine's files, the rule that picks the one that answers, and the sentence its live region speaks.
export type Method = 'GET' | 'POST';
export type Result = 'none' | 'get' | 'post' | 'miss';

export const GET_FILE = 'users/[id].get.ts';
export const POST_FILE = 'users.post.ts';
export const GET_ROUTE = 'GET /api/users/:id';
export const POST_ROUTE = 'POST /api/users';
export const GET_FN = 'export default function user(…)';
export const POST_FN = 'export default function create(…)';
export const POST_ANSWER = '{"ok":true}';
/** The status the router answers when no file in api/ matches the method and path. */
export const MISS_STATUS = '404';
export const START_ID = '42';
export const MAX_ID = 4;

/** Each insert flips the beat, so the vend animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export const pathOf = (id: string) => (id ? `/api/users/${id}` : '/api/users');
export const getAnswer = (id: string) => `{"id":"${id}"}`;

/** The one file that answers: users/[id].get.ts takes a GET with an id, users.post.ts a POST without one. */
export function resolve(method: Method, id: string): Result {
	if (method === 'GET') return id ? 'get' : 'miss';
	return id ? 'miss' : 'post';
}

/** The keypad: a digit appends, C clears, Backspace drops the last digit. */
export function keyed(id: string, key: string): string {
	if (key === 'C') return '';
	if (key === 'Backspace') return id.slice(0, -1);
	if (/^[0-9]$/.test(key) && id.length < MAX_ID) return id + key;
	return id;
}

export function describeVend(method: Method, id: string, result: Result): string {
	const request = `${method} ${pathOf(id)}`;
	if (result === 'get') return `${request}: ${GET_FILE} answered, and ${getAnswer(id)} dropped into the tray.`;
	if (result === 'post') return `${request}: ${POST_FILE} answered, and ${POST_ANSWER} dropped into the tray.`;
	if (result === 'miss') return `${request}: no file answers that, so nothing lit, and the coin came back with ${MISS_STATUS}.`;
	return '';
}

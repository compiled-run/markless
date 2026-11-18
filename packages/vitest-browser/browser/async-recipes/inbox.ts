import { request } from './gate.ts';

export function loadInbox(signal: AbortSignal) {
	return request('inbox', { unread: 0 }, signal);
}

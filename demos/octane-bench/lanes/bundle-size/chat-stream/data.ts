export type Message = { id: number; author: string; body: string; pending: boolean };

export function appendMessage(messages: Message[], body: string): Message[] {
	return [...messages, { id: messages.length + 1, author: 'You', body, pending: false }];
}

export function initialMessages(): Message[] {
	return [
		{ id: 1, author: 'Ada', body: 'The transcript is deterministic.', pending: false },
		{ id: 2, author: 'Lin', body: 'The next response is streaming.', pending: true },
	];
}

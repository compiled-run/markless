export type Message = {
	id: number;
	role: 'user' | 'assistant';
	className: string;
	body: string;
	tokens: string[];
	done: number;
};
export type Conversation = { id: number; title: string; messages: Message[] };
export type ChatUpdate = { conversations: Conversation[]; messages: Message[]; streamingId: number; remaining: number };

const WORDS = (
	'the quick model streams tokens into view while layout keeps pace and state ' +
	'updates flow through the scheduler batching commits per chunk rendering text ' +
	'nodes growing lists keyed bubbles remain stable under sustained append load ' +
	'because reconciliation only touches the tail'
).split(' ');

function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function tokensFor(seed: number, count: number): string[] {
	const random = mulberry32(seed);
	return Array.from({ length: count }, () => `${WORDS[(random() * WORDS.length) | 0]} `);
}

function settledMessage(id: number, role: 'user' | 'assistant', seed: number, count: number): Message {
	const tokens = tokensFor(seed, count);
	return { id, role, className: `message ${role}`, body: tokens.join(''), tokens, done: tokens.length };
}

export function initialConversations(): Conversation[] {
	const short: Message[] = [];
	for (let index = 0; index < 5; index++) {
		short.push(settledMessage(index * 2 + 1, 'user', 100 + index, 8));
		short.push(settledMessage(index * 2 + 2, 'assistant', 200 + index, 240 + index * 17));
	}
	const history: Message[] = [];
	for (let index = 0; index < 100; index++) {
		history.push(settledMessage(1_000 + index * 2, 'user', 300 + index, 8));
		history.push(settledMessage(1_001 + index * 2, 'assistant', 500 + index, 16));
	}
	return [
		{ id: 0, title: 'Streaming demo', messages: short },
		{ id: 1, title: 'Long history', messages: history },
	];
}

export function sendMessage(
	conversations: Conversation[],
	active: number,
	messages: Message[],
	text: string,
	replyIndex: number,
): ChatUpdate {
	const nextId = 10_000 + replyIndex * 2;
	const userTokens = [text];
	const replyTokens = tokensFor(20_260_710 + replyIndex, 240 + (replyIndex % 4) * 64);
	const next = [
		...messages,
		{ id: nextId, role: 'user' as const, className: 'message user', body: text, tokens: userTokens, done: 1 },
		{ id: nextId + 1, role: 'assistant' as const, className: 'message assistant streaming', body: '', tokens: replyTokens, done: 0 },
	];
	return {
		conversations: replaceConversation(conversations, active, next),
		messages: next,
		streamingId: nextId + 1,
		remaining: replyTokens.length,
	};
}

export function pumpMessages(
	conversations: Conversation[],
	active: number,
	messages: Message[],
	streamingId: number,
	batch: number,
): ChatUpdate {
	let remaining = 0;
	const next = messages.map((message) => {
		if (message.id !== streamingId) return message;
		const done = Math.min(message.tokens.length, message.done + batch);
		remaining = message.tokens.length - done;
		return {
			...message,
			done,
			body: message.tokens.slice(0, done).join(''),
			className: remaining === 0 ? 'message assistant' : 'message assistant streaming',
		};
	});
	return {
		conversations: replaceConversation(conversations, active, next),
		messages: next,
		streamingId: remaining === 0 ? 0 : streamingId,
		remaining,
	};
}

export function replaceConversation(conversations: Conversation[], active: number, messages: Message[]): Conversation[] {
	return conversations.map((conversation) =>
		conversation.id === active ? { ...conversation, messages } : conversation,
	);
}

export function messagesFor(conversations: Conversation[], active: number): Message[] {
	return conversations.find((conversation) => conversation.id === active)?.messages ?? [];
}

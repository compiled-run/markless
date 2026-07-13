import { state } from '@markless/core';
import {
	initialConversations,
	messagesFor,
	pumpMessages,
	sendMessage,
	type Conversation,
	type Message,
} from './data.ts';

// The keyed transcript renders precomputed row fields only. Corpus creation,
// token slicing, and conversation selection happen in dispatched handlers.
export function App() @{
	let conversations = state<Conversation[]>([]);
	let messages = state<Message[]>([]);
	let active = state(0);
	let replyIndex = state(0);
	let streamingId = state(0);

	<div class="chatapp">
		<header class="topbar">
			<h1>chat</h1>
			<nav class="tabs">
				<button class="conv-tab" data-conv="0" onClick={() => { active = 0; messages = messagesFor(conversations, active); }}>Streaming demo</button>
				<button class="conv-tab" data-conv="1" onClick={() => { active = 1; messages = messagesFor(conversations, active); }}>Long history</button>
			</nav>
		</header>
		<main class="messages">
			@for (message of messages; key message.id) {
				<div class="message">
					<span class="message-role">{message.role}</span>
					<span class="message-state">{message.className}</span>
					<div class="bubble"><p class="text">{message.body}</p></div>
				</div>
			}
		</main>
		<footer class="composer">
			<input class="prompt" placeholder="Message" />
			<button class="send" onClick={() => {
				const prompt = document.querySelector<HTMLInputElement>('.prompt');
				const text = prompt.value.trim();
				if (text !== '') {
					const update = sendMessage(conversations, active, messages, text, replyIndex);
					conversations = update.conversations;
					messages = update.messages;
					streamingId = update.streamingId;
					replyIndex++;
					prompt.value = '';
				}
			}}>Send</button>
		</footer>
		<div class="bench-controls" hidden>
			<button id="bench-reset" onClick={() => {
				conversations = initialConversations();
				active = 0;
				messages = messagesFor(conversations, active);
				replyIndex = 0;
				streamingId = 0;
			}}>reset</button>
			<input id="bench-pump-size" />
			<button id="bench-pump" data-remaining="0" onClick={(event: Event) => {
				const batch = Number(document.querySelector<HTMLInputElement>('#bench-pump-size').value);
				if (streamingId !== 0 && batch > 0) {
					const update = pumpMessages(conversations, active, messages, streamingId, batch);
					conversations = update.conversations;
					messages = update.messages;
					streamingId = update.streamingId;
					(event.target as HTMLButtonElement).dataset.remaining = String(update.remaining);
				}
			}}>pump</button>
		</div>
	</div>
}

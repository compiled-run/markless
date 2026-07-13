import { state } from '@markless/core';
import { appendMessage, initialMessages, type Message } from './data.ts';

export function App() @{
	let messages = state<Message[]>([]);

	<section class="chat">
		<header><h1>Team chat</h1><span>2 participants</span></header>
		<ol class="transcript">
			@for (message of messages; key message.id) {
				<li><strong>{message.author}</strong><p>{message.body}</p><small>{message.pending}</small></li>
			}
		</ol>
		<div class="composer"><input value="Ship the benchmark" aria-label="Message" /><button type="button" onClick={() => { messages = initialMessages(); }}>Load transcript</button><button type="button" onClick={() => { messages = appendMessage(messages, 'Ship the benchmark'); }}>Send</button></div>
	</section>
}

import { computed, state } from '@markless/core';

function answerAfter(question: string, wait: number) {
	return new Promise<string>((resolve, reject) => {
		setTimeout(() => {
			if (question === 'riddle') reject(new Error('No answer for the riddle'));
			else resolve('The answer is 42');
		}, wait);
	});
}

function Answer({ question }: { question: string }) @{
	const answer = computed(async () => answerAfter(question, 2000));
	@try {
		<p>{answer}</p>
	} @pending {
		<p>Thinking</p>
	} @catch (error) {
		<p>{error.message}</p>
	}
}

export default function App() @{
	let questions = state<string[]>([]);
	<main>
		<h1>Ask</h1>
		<button onClick={() => (questions = ['sum'])}>Ask the sum</button>
		<button onClick={() => (questions = ['riddle'])}>Ask the riddle</button>
		@for (const question of questions; key question) {
			<Answer question={question} />
		}
	</main>
}

import { state } from '@markless/core';

export default function Home() @{
	let answer = state('none');
	<main>
		<h1>Greeting</h1>
		<button
			onClick={async () => {
				const response = await fetch('/api/greeting?name=ada');
				answer = (await response.text()).trim();
			}}
		>
			Ask
		</button>
		<p>Answer: {answer}</p>
	</main>
}

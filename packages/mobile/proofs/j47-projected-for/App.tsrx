import { accordion } from '@markless/ui';

function Questions() @{
	const questions = [
		{ value: 'ship', question: 'When does it ship?', answer: 'Within two working days.' },
		{ value: 'returns', question: 'How do I return it?', answer: 'Start a return from your orders.' },
	];
	<accordion.root>
		@for (const q of questions; key q.value) {
			<accordion.item value={q.value}>
				<accordion.itemlabel>
					<accordion.itemtrigger>{q.question}</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>{q.answer}</accordion.itemcontent>
			</accordion.item>
		}
	</accordion.root>
}

export default function App() @{
	<main>
		<h1>Help</h1>
		<Questions />
	</main>
}

import { state } from '@markless/core';
import { withCheck } from '../lib/clone.ts';

export default function App() @{
	let report = state('Not checked');
	<main>
		<h1>Clone</h1>
		<button
			onClick={() => {
				const values = { name: 'Ada', tags: ['draft'], when: new Date(0) };
				const copy = withCheck(values);
				report = `${copy.name}: ${copy.tags.join('+')}, original ${values.tags.join('+')}, ${copy.when instanceof Date && copy.when !== values.when ? 'date copied' : 'date lost'}`;
			}}
		>
			Check
		</button>
		<button
			onClick={() => {
				try {
					structuredClone({ run: () => 1 });
					report = 'cloned a function';
				} catch (error) {
					report = `Refused: ${(error as Error).name}`;
				}
			}}
		>
			Clone a function
		</button>
		<p>{report}</p>
	</main>
}

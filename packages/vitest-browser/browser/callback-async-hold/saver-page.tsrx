import { state } from '@markless/core';
import { save } from './api.ts';

function Saver({ onSave }: { onSave: (name: string) => Promise<void> }) @{
	let note = state('');

	<div>
		<button
			data-go
			type="button"
			onClick={() => {
				note = 'clicked';
				void onSave('Ada');
			}}
		>
			Go
		</button>
		<p data-note>{note}</p>
	</div>
}

export default function SaverPage() @{
	let saving = state('');
	let saved = state('');

	<main>
		<Saver
			onSave={async (name) => {
				saving = name;
				await save();
				saved = name;
			}}
		/>
		<p data-saving>{saving}</p>
		<p data-saved>{saved}</p>
	</main>
}

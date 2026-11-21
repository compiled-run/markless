import { state } from '@markless/core';

export default function ContextMenu() @{
	let picked = state('none');
	let log = state('');
	<main>
		<p>{picked}</p>
		<ul onContextmenu={(event) => (log = log + ' list:' + (event.target === event.currentTarget ? 'self' : 'inner') + '@' + event.timeStamp)}>
			@for (const fruit of ['Apple', 'Pear']; key fruit) {
				<li
					onContextmenu={(event) => {
						event.preventDefault();
						picked = fruit + ' at ' + event.clientX + ',' + event.clientY;
					}}
				>
					<span>{fruit}</span>
				</li>
			}
		</ul>
		<div
			onContextmenu={(event) => {
				for (const part of [event.clientX, event.clientY]) log = log + ' pad:' + part;
			}}
		>
			Pad
		</div>
		<p>{log}</p>
	</main>
}

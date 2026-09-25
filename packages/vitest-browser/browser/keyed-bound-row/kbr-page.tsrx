import { state } from '@markless/core';
import { Frame, Mark } from './kbr-parts.tsrx';

function Marks({ list }) @{
	<div>
		@for (const entry of list; key entry) {
			<Mark value={entry} />
		}
	</div>
}

export default function Page() @{
	const list = state([3, 5, 7]);
	<main>
		<Frame>
			<Marks list={list} />
		</Frame>
	</main>
}

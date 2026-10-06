import { state } from '@markless/core';

export default function TypoCount() @{
	let fixed = state(0);

	<button onClick={() => fixed++}>Typos fixed: {fixed}</button>
}

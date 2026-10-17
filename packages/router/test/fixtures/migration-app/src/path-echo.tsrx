import { state } from '@markless/core';

export default function PathEcho({
	where,
	query,
}: {
	readonly where: string;
	readonly query: string;
}) @{
	let heard = state('');
	<div>
		<button data-echo onClick={() => (heard = `${where}${query}`)}>
			echo
		</button>
		<output data-heard>{heard}</output>
	</div>;
}

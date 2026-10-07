import { state } from '@markless/core';
import { Chip, Note, Shout } from './projected-text-parts.tsrx';

export default function ProjectedTextImported() @{
	let name = state('');
	let hits = state(3);

	<p>
		<button type="button" data-set onClick={() => { name = 'mk-' + hits; hits++; }}>set</button>
		<Chip>{name}</Chip>
		<Note>{hits} hits</Note>
		<span data-echo>{name}</span>
		<Shout>{name}</Shout>
		<Shout>{name ? '<b>' + name + '</b>' : ''}</Shout>
	</p>
}

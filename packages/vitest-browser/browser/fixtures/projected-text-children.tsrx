import type { Children } from '@markless/core';
import { state } from '@markless/core';
import { Chip, Note } from './projected-text-parts.tsrx';

function Live({ children }: { readonly children?: Children }) @{
	<div><output data-live>{children}</output></div>
}

function Frame(props: { readonly children?: Children }) @{
	<p data-frame>{props.children}</p>
}

export default function ProjectedTextChildren() @{
	let cups = state(0);
	let mode = state('calm & <still>');
	let tag = state('');

	<section>
		<button type="button" data-more onClick={() => cups++}>more</button>
		<button type="button" data-mode onClick={() => mode = mode + '!'}>mode</button>
		<button type="button" data-tag onClick={() => tag = 'mk-' + cups}>tag</button>
		<Live>{cups === 0 ? 'none' : 'some'}</Live>
		<Live><span data-wrapped>{cups === 0 ? 'none' : 'some'}</span></Live>
		<Frame>{cups} cups</Frame>
		<Frame>{mode}</Frame>
		<Chip>{tag}</Chip>
		<Note>{cups} of {mode}</Note>
	</section>
}

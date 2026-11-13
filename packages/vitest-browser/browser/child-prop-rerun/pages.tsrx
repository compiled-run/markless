import { state } from '@markless/core';
import Card from './card.tsrx';
import Detail from './detail.tsrx';
import Shell from './shell.tsrx';

type PageProps = { readonly params: { readonly id: string }; readonly url: { readonly search: string } };

export function DirectPage({ params, url }: PageProps) @{
	<main>
		<Detail id={params.id} url={url} />
	</main>
}

export function FramedPage({ params, url }: PageProps) @{
	<Shell>
		<main>
			<Detail id={params.id} url={url} />
		</main>
	</Shell>
}

export function DeepPage({ params, url }: PageProps) @{
	<Shell>
		<Card id={params.id} url={url} />
	</Shell>
}

export function OpenedPage({ params, url }: PageProps) @{
	let open = state(false);
	<main>
		<button data-open onClick={() => (open = true)}>Open</button>
		@if (open) {
			<Detail id={params.id} url={url} />
		}
	</main>
}

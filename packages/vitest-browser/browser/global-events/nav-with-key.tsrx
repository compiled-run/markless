import { logKey } from './key-log.ts';

export default function KeyPage() @{
	<main data-nav-page="with-key">
		<p
			data-key-owner
			onDocumentKeyDown={(event) => logKey('__routeKeyRuns', event.key)}
		>
			listening
		</p>
	</main>
}

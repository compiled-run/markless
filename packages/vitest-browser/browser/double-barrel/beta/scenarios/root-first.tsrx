import { alpha } from '../../index.ts';
import * as beta from '../index.ts';

// The mirror of `folder-first`: the root-barrel import is written first and the
// doubly-reached module is `./beta/index.ts` instead, so neither statement order
// nor which family is aliased twice can be what decides the outcome.
export default function RootFirstPage() @{
	<main data-root-first-page>
		<alpha.root>
			<alpha.label>alpha via the root barrel</alpha.label>
		</alpha.root>
		<beta.root>
			<beta.label>beta via its folder barrel</beta.label>
		</beta.root>
	</main>
}

import { SquallBadge } from './squall-badge.tsrx';

// Host page for the ledgered lowering-gap pin (squall-badge.tsrx).
export function App() @{
	<main>
		<SquallBadge params={{ pier: 'north-pier' }} />
	</main>
}

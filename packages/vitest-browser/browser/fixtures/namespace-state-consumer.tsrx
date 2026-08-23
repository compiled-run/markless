// The consumer surface under test: a component in ANOTHER module reaches the
// family's shared definition through the barrel with a namespace-member call,
// and reads a live cell off it.
import * as nsc from './namespace-state-barrel.ts';

function Report() @{
	const panel = nsc.state();

	<span data-nsc-report>{panel.open ? 'open' : 'closed'}</span>
}

export default function NamespaceStatePage() @{
	<section data-nsc-page>
		<div data-widget="a">
			<nsc.root>
				<nsc.trigger />
				<Report />
			</nsc.root>
		</div>
		<div data-widget="b">
			<nsc.root>
				<nsc.trigger />
				<Report />
			</nsc.root>
		</div>
	</section>
}

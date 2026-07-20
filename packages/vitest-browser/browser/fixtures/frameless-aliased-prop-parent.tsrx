import AliasedPropChild from './frameless-aliased-prop-child.tsrx';

export default function App() @{
	<section data-aliased-prop-parent>
		<AliasedPropChild label="authored key delivered" />
	</section>
}

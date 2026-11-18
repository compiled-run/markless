import { drawer } from './drawer.tsrx';

export default function DrawerPage() @{
	const d = drawer();

	<section>
		<output data-expanded>{d.expanded ? 'expanded' : 'collapsed'}</output>
		<output data-label>{d.label}</output>
		<button type="button" data-flip onClick={() => d.flip()}>Flip</button>
		<button type="button" data-name onClick={() => d.name('wide open')}>Name</button>
	</section>
}

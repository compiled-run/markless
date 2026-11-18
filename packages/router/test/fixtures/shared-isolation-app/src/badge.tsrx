import { viewer } from './viewer.tsrx';

export default function Badge() @{
	const v = viewer();
	<p data-badge>{v.name}</p>
}

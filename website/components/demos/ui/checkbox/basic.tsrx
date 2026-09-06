// The page renders this, not the frame: an .mdx page cannot wrap an imported
// component in another one, so the frame is composed here.
import Preview from '../../../ui/preview.tsrx';
import Terms from './terms.tsrx';

export default function CheckboxDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Terms />
	</Preview>
}

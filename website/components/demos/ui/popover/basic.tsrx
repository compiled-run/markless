import Preview from '../../../ui/preview.tsrx';
import Share from './share.tsrx';

export default function PopoverDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Share />
	</Preview>
}

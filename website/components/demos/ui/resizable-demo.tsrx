import Preview from '../../ui/preview.tsrx';
import Workspace from './resizable-example.tsrx';

export default function ResizableDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Workspace />
	</Preview>
}

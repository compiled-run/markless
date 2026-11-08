import { later } from './pcw-later.ts';

export default function Opener({
	onOpen,
	onReady,
}: {
	readonly onOpen: () => void;
	readonly onReady: () => void;
}) @{
	<button
		type="button"
		data-open
		onClick={() => {
			onOpen();
			later('ready').then(() => onReady(), () => {});
		}}
	>
		open
	</button>
}

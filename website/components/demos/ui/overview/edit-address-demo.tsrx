import { state } from '@markless/core';
import PreviewCard, { Controls, Stage, Watch } from '../../../docs/preview-card.tsrx';
import Code from '../../../docs/preview-card/code.tsrx';
import { editAddress } from './code-panes.ts';
import EditAddress from './edit-address.tsrx';

// The page reads focus from events that bubble out of the dialog: EditAddress itself has no handlers.
export default function EditAddressDemo() @{
	let where = state('page');
	let focused = state('');
	let tabs = state(0);
	let closed = state(false);

	<PreviewCard name="edit-address" label="A dialog with no handlers">
		<Controls title="Open it, then use the keys" />
		<Stage>
			<div
				class="spot"
				onFocusin={(event: FocusEvent) => {
					const target = event.target as HTMLElement;
					const inside = target.closest('[role="dialog"]') !== null;
					if (where === 'dialog' && !inside) closed = true;
					if (inside && where !== 'dialog') tabs = 0;
					where = inside ? 'dialog' : 'page';
					focused = target.getAttribute('role') === 'dialog' ? 'the dialog' : (target.textContent ?? '').trim();
				}}
				onKeydown={(event: KeyboardEvent) => {
					if (event.key === 'Tab' && where === 'dialog') tabs++;
				}}
			>
				<EditAddress />
			</div>
		</Stage>
		<Watch>
			<span class="said">
				{where === 'dialog'
					? `Focus is on ${focused}, inside the dialog. Tab pressed ${tabs} ${tabs === 1 ? 'time' : 'times'}, and focus never left.`
					: closed
						? `The dialog closed, and focus went back to ${focused}.`
						: 'Click Edit address. Press Tab a few times, then press Escape.'}
			</span>
		</Watch>
		<Code files={editAddress} />
		<style>
			.said,
			.said :where(span, b) {
				font-family: var(--pg-font);
			}

			.spot {
				display: grid;
				place-items: center;
			}
		</style>
	</PreviewCard>
}

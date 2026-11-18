import type { SheetProps } from './sheet-types.ts';

// The web's equivalent: a modal panel on the overlay layer @markless/web enlists, the mechanism modal and drawer open
// from state with; a <dialog> needs showModal(), which a server-rendered page can only call after a load-time start.
export function NativeSheet({ open, onChange, dismissible, modal, children }: SheetProps) @{
	<div
		overlay
		ui-backdrop
		hidden={open !== true}
		ui-open={open === true}
		onDismiss={() => {
			if (dismissible !== false) onChange?.(false);
		}}
	>
		<style>
			@layer markless {
				[ui-backdrop] {
					position: fixed;
					inset: 0;
					background: rgb(0 0 0 / 0.1);
				}
			}
		</style>
		<div ui-content role="dialog" aria-modal={modal === false ? undefined : 'true'} tabindex={-1}>
			<style>
				@layer markless {
					[ui-content] {
						position: fixed;
						inset: 0;
						margin: auto;
						inline-size: fit-content;
						block-size: fit-content;
						max-inline-size: calc(100% - 6px - 2em);
						max-block-size: calc(100% - 6px - 2em);
						overflow: auto;
						padding: 1em;
						border: solid;
						background: Canvas;
						color: CanvasText;
					}
				}
			</style>
			{children}
		</div>
	</div>
}

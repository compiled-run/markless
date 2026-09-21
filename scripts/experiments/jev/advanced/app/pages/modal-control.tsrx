import { modal } from '../../../../../../packages/headless/components/src/index.ts';
export default function ModalControl() @{
  <main data-page="modal-control">
    <button data-testid="background">Background</button>
    <modal.root>
      <modal.trigger data-testid="outer-trigger">Open dialog</modal.trigger>
      <modal.backdrop data-testid="outer-backdrop">
        <modal.content data-testid="outer-content">
          <modal.title>Control dialog</modal.title>
          <modal.close data-testid="outer-close">Close</modal.close>
        </modal.content>
      </modal.backdrop>
    </modal.root>
  </main>
}

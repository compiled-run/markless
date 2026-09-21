import { computed, state } from '@markless/core';
import { combobox, modal } from '../../../../../../packages/headless/components/src/index.ts';

function Options() @{
  const combo = combobox.state();
  const matches = computed(() => ['Alpha', 'Beta', 'Gamma', 'Delta'].filter(name => name.toLowerCase().includes(combo.input.toLowerCase())));
  <div role="presentation">
    @for (const name of matches; key name) {
      <combobox.item value={name} label={name} data-option={name}>
        <combobox.itemlabel>{name}</combobox.itemlabel>
      </combobox.item>
    } @empty {
      <p data-testid="empty">No matching projects</p>
    }
  </div>
}

export default function Editor() @{
  let selected = state('');
  let selections = state(0);
  let confirmed = state(0);
  <section data-testid="editor-instance">
    <modal.root>
      <modal.trigger data-testid="outer-trigger">Edit project</modal.trigger>
      <modal.backdrop data-testid="outer-backdrop">
        <modal.content data-testid="outer-content">
          <modal.title>Edit project</modal.title>
          <combobox.root onChange={(value: string | readonly string[]) => { selected = typeof value === 'string' ? value : value.join(','); selections++; }}>
            <combobox.label>Project</combobox.label>
            <combobox.input data-testid="combo-input" />
            <combobox.trigger data-testid="combo-trigger">Find project</combobox.trigger>
            <combobox.content data-testid="combo-content"><Options /></combobox.content>
          </combobox.root>
          <output data-testid="selected">{selected}</output>
          <output data-testid="selections">{selections}</output>
          <modal.root>
            <modal.trigger data-testid="inner-trigger">Review selection</modal.trigger>
            <modal.backdrop data-testid="inner-backdrop">
              <modal.content data-testid="inner-content">
                <modal.title>Confirm project</modal.title>
                <button data-testid="confirm" onClick={() => confirmed++}>Confirm</button>
                <modal.close data-testid="inner-close">Return to editor</modal.close>
              </modal.content>
            </modal.backdrop>
          </modal.root>
          <output data-testid="confirmed">{confirmed}</output>
          <modal.close data-testid="outer-close">Done</modal.close>
        </modal.content>
      </modal.backdrop>
    </modal.root>
  </section>
}

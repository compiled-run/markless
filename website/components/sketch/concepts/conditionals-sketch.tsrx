// Conditionals page preview: the branch takes the field off the page and builds a new one, while note stays above it.
import { computed, element, state } from '@markless/core';
import PreviewCard, { Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { noteDrawer } from './code-panes.ts';
import { elementId } from './element-ids.ts';
import NoteDrawer from './note-drawer.tsrx';
import { afterUpdate, placeOver } from './place.ts';
import { Board, Ledger, LivePage, Row } from './trace.tsrx';

const savedIn = (slot: HTMLElement | undefined): string =>
	(slot?.querySelector('p')?.textContent ?? '').replace(/^\s*Saved:\s*/, '').trim();

export default function ConditionalsSketch() @{
	let shown = state(false);
	let fields = state(0);
	let fresh = state(false);
	let note = state('');
	let last = state('');
	let fieldAt = state('');
	let slot = element<HTMLDivElement>();
	const openNote = computed(() => (shown ? 'true' : 'false'));
	const branchNote = computed(() => (shown ? 'the field is on the page' : 'the field is not on the page at all'));
	const fieldNote = computed(() => {
		if (!shown) return fields === 0 ? 'none built yet' : 'removed with the branch';
		return (fresh ? 'a new field, number ' : 'field number ') + fields + (note === '' ? '' : ', filled from note');
	});
	const noteHot = computed(() => (last === 'type' || (last === 'close' && note !== '') ? 'true' : 'false'));
	const noteText = computed(() => (note === '' ? '"" (empty)' : '"' + note + '"'));
	const said = computed(() => {
		if (last === 'type') return 'onInput wrote note. The Saved line reads note too.';
		if (last === 'close') return note === '' ? '@if took the field off the page.' : '@if took the field off the page. note still holds "' + note + '".';
		if (fields > 1 && note !== '') return '@if built field number ' + fields + '. It reads note, so your text came back.';
		return '@if built field number ' + fields + ' and put it on the page.';
	});

	<PreviewCard name="conditionals-note" label="What a branch puts on the page">
		<Controls title="Where does the note go when you close it?" />
		<Stage>
			<Board>
				<LivePage art="sticky-note">
					<div
						class="slot"
						el={slot}
						onClick={(event) => {
							const target = event.target;
							if (!(target instanceof Element) || !target.closest('button')) return;
							afterUpdate(() => {
								const field = slot ? slot.querySelector('input') : null;
								shown = field !== null;
								fieldAt = placeOver(slot, field, 6);
								note = savedIn(slot);
								last = shown ? 'open' : 'close';
								if (field && !elementId(field).seen) {
									fields++;
									fresh = true;
								} else fresh = false;
							});
						}}
						onInput={() => {
							last = 'type';
							fresh = false;
							afterUpdate(() => {
								note = savedIn(slot);
							});
						}}
					>
						<NoteDrawer />
						<span class="branch" aria-hidden="true" hidden={!shown || fieldAt === ''} style={fieldAt}>
							<span class="tag">{'@if (open)'}</span>
						</span>
					</div>
				</LivePage>
				<Ledger label="What the branch did">
					<Row name="open">
						<span>{openNote}</span>
					</Row>
					<Row name="@if (open)">
						<span data-hot={last === 'open' || last === 'close' ? 'true' : 'false'}>{branchNote}</span>
					</Row>
					<Row name="<input>">
						<span data-hot={last === 'open' && fresh ? 'true' : 'false'}>{fieldNote}</span>
					</Row>
					<Row name="note">
						<span data-hot={noteHot}>{noteText}</span>
					</Row>
				</Ledger>
			</Board>
		</Stage>
		<Watch>
			<span hidden={last === ''}>{said}</span>
			<span hidden={last !== ''}>
				<Mono>open</Mono> is false, so the field is not on the page at all. <Mono>note</Mono> lives above the
				branch.
			</span>
		</Watch>
		<Code files={noteDrawer} />
		<style>
			.slot {
				position: relative;
			}

			.branch {
				position: absolute;
				box-sizing: border-box;
				border: 1px dashed var(--ink);
				border-radius: 8px;
				pointer-events: none;
			}

			.branch[hidden] {
				display: none;
			}

			.tag {
				position: absolute;
				inset-block-start: -0.75em;
				inset-inline-end: 0.6em;
				padding: 0 0.3em;
				background: var(--paper);
				font-family: var(--font-mono);
				font-size: var(--step--2);
				line-height: 1.4;
			}
		</style>
	</PreviewCard>
}

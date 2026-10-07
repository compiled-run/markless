// Events page preview: each handler's row shows what the browser's event handed it and what it changed.
import { computed, state } from '@markless/core';
import PreviewCard, { Controls, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { mugName } from './code-panes.ts';
import { afterUpdate } from './place.ts';
import MugName from './mug-name.tsrx';
import { Board, Ledger, LivePage, Row } from './trace.tsrx';

const quoted = (text: string): string => '"' + text + '"';

export default function EventsSketch() @{
	let key = state('');
	let value = state('');
	let printed = state('');
	let prevented = state(false);
	let last = state('');
	let inputs = state(0);
	let submits = state(0);
	let keyHot = state(false);
	let inputHot = state(false);
	let submitHot = state(false);
	const keyGot = computed(() => (key === '' ? '' : 'event.key: ' + quoted(key)));
	const keyDid = computed(() => (key === '' ? 'waiting for a key' : key === 'Escape' ? 'cleared name' : 'changed nothing'));
	const inputGot = computed(() => (inputs === 0 ? '' : 'event.currentTarget.value: ' + quoted(value)));
	const inputDid = computed(() => (inputs === 0 ? 'waiting for a letter' : 'set name = ' + quoted(value)));
	const submitGot = computed(() => (submits === 0 ? '' : 'event.type: "submit"'));
	const submitDid = computed(() => (submits === 0 ? 'waiting for Enter' : (prevented ? 'called preventDefault(), set printed = ' : 'set printed = ') + quoted(printed)));
	const said = computed(() => {
		if (last === 'escape') return 'Escape fired keydown. onKeyDown read event.key and set name to "".';
		if (last === 'submit')
			return 'Enter fired keydown, then submit. onSubmit called preventDefault()' + (prevented ? ', so the page did not reload.' : '.');
		if (last === 'input') return 'That key fired keydown, then input. onInput read the field and set name to ' + quoted(value) + '.';
		return 'That key fired keydown. Only onKeyDown ran, and it changed nothing.';
	});

	<PreviewCard name="events-mug" label="What each handler gets">
		<Controls title="What does each handler get?" />
		<Stage>
			<Board>
				<LivePage>
					<div
						onKeyDown={(event) => {
							key = event.key === ' ' ? 'Space' : event.key;
							last = event.key === 'Escape' ? 'escape' : 'key';
							keyHot = true;
							inputHot = false;
							submitHot = false;
						}}
						onInput={(event) => {
							const target = event.target;
							value = target instanceof HTMLInputElement ? target.value : '';
							last = 'input';
							inputs++;
							inputHot = true;
						}}
						onSubmit={(event) => {
							last = 'submit';
							submits++;
							submitHot = true;
							afterUpdate(() => {
								prevented = event.defaultPrevented;
								const line = event.target instanceof HTMLFormElement ? event.target.querySelector('p') : null;
								printed = (line?.textContent ?? '').replace(/^\s*Printed:\s*/, '').trim();
							});
						}}
					>
						<MugName />
					</div>
				</LivePage>
				<Ledger label="What each handler got">
					<Row name="onKeyDown">
						<span class="note" data-hot={keyHot ? 'true' : 'false'}><span class="got">{keyGot}</span><span>{keyDid}</span></span>
					</Row>
					<Row name="onInput">
						<span class="note" data-hot={inputHot ? 'true' : 'false'}><span class="got">{inputGot}</span><span>{inputDid}</span></span>
					</Row>
					<Row name="onSubmit">
						<span class="note" data-hot={submitHot ? 'true' : 'false'}><span class="got">{submitGot}</span><span>{submitDid}</span></span>
					</Row>
				</Ledger>
			</Board>
		</Stage>
		<Watch>
			<span hidden={last === ''}>{said}</span>
			<span hidden={last !== ''}>
				Each handler gets the browser's own event object. Nothing has fired yet.
			</span>
		</Watch>
		<Code files={mugName} />
		<style>
			.note {
				display: grid;
				gap: 0.15em;
			}

			.got {
				font-family: var(--font-mono);
				font-size: 0.92em;
				overflow-wrap: anywhere;
			}

			.got:empty {
				display: none;
			}
		</style>
	</PreviewCard>
}

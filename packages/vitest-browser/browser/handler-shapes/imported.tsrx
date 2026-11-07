import { state } from '@markless/core';
import CallButton from './call-button.tsrx';
import MemberButton from './member-button.tsrx';
import SpreadButton from './spread-button.tsrx';
import Toolbar from './toolbar.tsrx';

const tagged = (suffix: string) => (value: string) => value + suffix;

export default function Imported() @{
	let drafts = state<string[]>([]);
	let text = state('');

	const add = () => {
		drafts = [...drafts, text.trim()];
		text = '';
	};
	const alias = add;
	const makeAdd = (suffix: string) => () => {
		drafts = [...drafts, text + suffix];
		text = '';
	};
	const exclaim = makeAdd('!');
	function makeShout(format: (value: string) => string) {
		return () => {
			drafts = [...drafts, format(text.toUpperCase())];
			text = '';
		};
	}
	const shout = makeShout(tagged('?'));

	<main>
		<input data-text value={text} onInput={(event) => (text = (event.target as HTMLInputElement).value)} />
		<p data-drafts>{drafts.join(',')}</p>
		<p data-text-shown>{text}</p>
		<MemberButton name="member-inline" onClick={() => { drafts = [...drafts, text]; text = ''; }}>Inline</MemberButton>
		<MemberButton name="member-alias" onClick={alias}>Alias</MemberButton>
		<CallButton name="call-factory" onClick={exclaim}>Factory</CallButton>
		<SpreadButton data-press="spread-shout" onClick={shout} />
		<Toolbar name="toolbar-factory" onAdd={exclaim} />
		<button type="button" data-press="host-alias" onClick={alias}>Host alias</button>
		<button type="button" data-press="host-shout" onClick={shout}>Host shout</button>
	</main>
}

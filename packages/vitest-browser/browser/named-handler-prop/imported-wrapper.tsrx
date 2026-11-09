import { state } from '@markless/core';
import Pressable from './pressable.tsrx';

export default function ImportedWrapper() @{
	let drafts = state<string[]>([]);
	let text = state('');

	const add = () => {
		const value = text.trim();
		if (!value) return;
		drafts = [...drafts, value];
		text = '';
	};

	function shout() {
		drafts = [...drafts, text.toUpperCase()];
		text = '';
	}

	const addLater = async () => {
		const value = text;
		await Promise.resolve();
		drafts = [...drafts, value + '!'];
		text = '';
	};

	<main>
		<input data-text value={text} onInput={(event) => (text = (event.target as HTMLInputElement).value)} />
		<p data-drafts>{drafts.join(',')}</p>
		<p data-text-shown>{text}</p>
		<Pressable name="add" onClick={add}>Add</Pressable>
		<Pressable name="shout" onClick={shout}>Shout</Pressable>
		<Pressable name="later" onClick={addLater}>Later</Pressable>
	</main>
}

import { state } from '@markless/core';

function Button({ onClick, children, name }: { onClick: () => void; children?: unknown; name: string }) @{
	<button type="button" data-press={name} onClick={onClick}>{children}</button>
}

export default function OneWrapper() @{
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
		<Button name="add" onClick={add}>Add</Button>
		<Button name="shout" onClick={shout}>Shout</Button>
		<Button name="later" onClick={addLater}>Later</Button>
	</main>
}

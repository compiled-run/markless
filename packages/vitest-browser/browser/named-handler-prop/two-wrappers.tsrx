import { state } from '@markless/core';

function Button({ onClick, children, name }: { onClick: () => void; children?: unknown; name: string }) @{
	<button type="button" data-press={name} onClick={onClick}>{children}</button>
}

function Action({ onRun, label, name }: { onRun: () => void; label: string; name: string }) @{
	<span class="action"><Button name={name} onClick={onRun}>{label}</Button></span>
}

export default function TwoWrappers() @{
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
		<Action name="add" label="Add" onRun={add} />
		<Action name="shout" label="Shout" onRun={shout} />
		<Action name="later" label="Later" onRun={addLater} />
	</main>
}

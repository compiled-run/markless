import { state } from '@markless/core';

export default function TagShelf({ heading }: { readonly heading: string }) @{
	let tags = state<string[]>([]);
	<div>
		<h3>{heading}</h3>
		<button data-add-tag onClick={() => (tags = [...tags, `tag-${tags.length + 1}`])}>
			add tag
		</button>
		<ol data-tags>
			@for (const tag of tags; key tag) {
				<li>{tag}</li>;
			}
		</ol>
	</div>;
}

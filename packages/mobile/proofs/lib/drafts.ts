export type Draft = { readonly title: string; readonly tag: string };

export function draftFrom(form: HTMLFormElement): Draft {
	const data = new FormData(form);
	return { title: String(data.get('title') ?? '').trim(), tag: String(data.get('tag') || 'home') };
}

export function addDraft(saved: string, draft: Draft): { saved: string; label: string } {
	const drafts = [...(JSON.parse(saved) as Draft[]), draft];
	const tags = new Set(drafts.map((one) => one.tag));
	return {
		saved: JSON.stringify(drafts),
		label: `Saved ${draft.title} (${draft.tag}): ${drafts.length} notes, ${tags.size} tags`,
	};
}

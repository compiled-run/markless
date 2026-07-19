import { computed, state } from '@markless/core';

export function App() @{
	let frequency = state(91);
	const studioFeed = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__broadcastDiamondRuns ||= {
			source: 0,
			bulletin: 0,
			caption: 0,
		});
		runs.source++;
		const channel = frequency;
		await new Promise((resolve) => setTimeout(resolve, 28));
		if (signal.aborted) return { waveform: 'aborted' };
		return { waveform: 'band-' + channel };
	});
	const newsroomCopy = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__broadcastDiamondRuns ||= {
			source: 0,
			bulletin: 0,
			caption: 0,
		});
		runs.bulletin++;
		const carrier = studioFeed.waveform;
		await new Promise((resolve) => setTimeout(resolve, 22));
		if (signal.aborted) return { headline: 'aborted' };
		return { headline: 'Bulletin ' + carrier + '-news' };
	});
	const subtitleCopy = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__broadcastDiamondRuns ||= {
			source: 0,
			bulletin: 0,
			caption: 0,
		});
		runs.caption++;
		const carrier = studioFeed.waveform;
		await new Promise((resolve) => setTimeout(resolve, 34));
		if (signal.aborted) return { transcript: 'aborted' };
		return { transcript: 'Caption ' + carrier + '-text' };
	});

	<fieldset>
		<legend>Broadcast desk</legend>
		<button type="button" data-retune-frequency onClick={() => frequency += 2}>Retune</button>
		@try {
			<data data-bulletin-arm>{newsroomCopy.headline}</data>
		} @pending {
			<data data-bulletin-arm>Writing bulletin</data>
		} @catch {
			<data data-bulletin-arm>Bulletin dropped</data>
		}
		@try {
			<dfn data-caption-arm>{subtitleCopy.transcript}</dfn>
		} @pending {
			<dfn data-caption-arm>Timing captions</dfn>
		} @catch {
			<dfn data-caption-arm>Caption dropped</dfn>
		}
	</fieldset>
}

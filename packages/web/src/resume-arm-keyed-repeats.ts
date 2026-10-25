import type {
	ElementHandleRegistry,
	ResumeDomElement,
	ResumeKeyedRepeatRecord,
	ResumeRuntimeInput,
} from './resume-types.ts';
import type { ResumeEventWiring } from './resume-events.ts';

// An arm's rows adopt the served ones only once the computed they read from holds the served value.
export async function wireArmKeyedRepeats(
	runtime: ResumeRuntimeInput,
	records: ReadonlyArray<ResumeKeyedRepeatRecord>,
	host: {
		readonly elementsByHostId: Map<string, ResumeDomElement>;
		readonly events: ResumeEventWiring;
		readonly elementHandles: ElementHandleRegistry;
		readonly storeHostSubscription: (hostNodeId: string, release: () => void) => void;
	},
): Promise<void> {
	const { primeKeyedRepeatCollections, wireKeyedRepeats } =
		await import('./resume-keyed-repeats-lazy.ts');
	await primeKeyedRepeatCollections({
		graph: runtime.graph,
		repeats: records,
		computed: runtime.state?.computed ?? [],
		root: runtime.root,
		loadSymbol: runtime.loadSymbol,
		elementHandles: host.elementHandles,
	});
	for (const record of records)
		await wireKeyedRepeats({
			graph: runtime.graph,
			view: {
				...runtime.view,
				keyedRepeats: [record, ...records.filter((each) => each.enclosingRow)],
			},
			elementsByHostId: host.elementsByHostId,
			events: host.events,
			storeContainerSubscription: (release) =>
				host.storeHostSubscription(record.parentHostNodeId, release),
			renderData: runtime.renderData,
			pageRepeats: runtime.view.keyedRepeats,
		});
}

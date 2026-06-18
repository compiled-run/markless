import {
	createEventResumeContainerFromPayloadDocument,
	type EventResumeContainer,
} from 'arcade/runtime/event-resume';
import { loadSymbol } from './root.tsrx';

type SharedResumeContainer = Element & {
	__arcadeSharedResume?: Promise<EventResumeContainer>;
	__asyncResumeRuntimeStarted?: boolean;
};

type ResumeContainerEventInput = {
	readonly root: SharedResumeContainer;
	readonly event: Event;
	readonly element?: Element;
	readonly eventRecord?: {
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly symbolIds: readonly string[];
	};
};

export async function resumeContainerEvent(input: ResumeContainerEventInput): Promise<void> {
	const containers = sharedResumeContainers(input.root);
	const resumedContainers = await Promise.all(containers.map(startSharedResumeContainer));
	const activeIndex = containers.indexOf(input.root);
	const resumed =
		resumedContainers[activeIndex] ?? (await startSharedResumeContainer(input.root));

	input.root.__asyncResumeRuntimeStarted = true;
	await resumed.dispatch(input.event as never, {
		element: input.element as never,
		eventRecord: input.eventRecord as never,
	});

	const patches = resumed.graph.takeSharedPatches();
	if (patches.length === 0) return;

	await Promise.all(
		resumedContainers.map(async (container, index) => {
			if (index === activeIndex) return;

			let appliedPatch = false;
			for (const patch of patches) {
				appliedPatch = container.graph.applySharedPatch(patch) || appliedPatch;
			}
			if (appliedPatch) await container.graph.flush();
		}),
	);
}

function sharedResumeContainers(root: SharedResumeContainer): SharedResumeContainer[] {
	const documentRef = root.ownerDocument ?? document;
	return Array.from(
		documentRef.querySelectorAll('[data-async-container]'),
	) as SharedResumeContainer[];
}

function startSharedResumeContainer(root: SharedResumeContainer): Promise<EventResumeContainer> {
	root.__asyncResumeRuntimeStarted = true;
	root.__arcadeSharedResume ??= createEventResumeContainerFromPayloadDocument({
		document: root as never,
		root: root as never,
		loadSymbol,
	});
	return root.__arcadeSharedResume;
}

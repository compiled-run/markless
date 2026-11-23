import { element, state } from '@markless/core';
import { tour } from '@markless/ui';

export default function App() @{
	const saveEl = element<HTMLButtonElement>();
	const shareEl = element<HTMLButtonElement>();
	const page = state({ isOpen: false, step: 0 });
	<main>
		<h1>Editor</h1>
		<button type="button" el={saveEl}>Save</button>
		<button type="button" el={shareEl}>Share</button>
		<button type="button" onClick={() => (page.isOpen = true)}>Take the tour</button>
		<p>{`Step ${page.step}`}</p>
		<tour.root open={page.isOpen} onChange={(step) => (page.step = step)} onOpenChange={(open) => (page.isOpen = open)}>
			<tour.item target={saveEl}>
				<tour.title>Save your work</tour.title>
				<tour.forwardtrigger>Next</tour.forwardtrigger>
			</tour.item>
			<tour.item target={shareEl}>
				<tour.title>Share it</tour.title>
				<tour.close>Done</tour.close>
			</tour.item>
		</tour.root>
	</main>
}

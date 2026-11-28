// file: pages/media.tsrx
import { state } from '@markless/core';
import { base, tabs } from '@markless/ui';
import { camera, pdf, type Photo } from '@markless/device';

function CameraPanel() @{
	const cam = camera();
	let photo = state<Photo | null>(null);

	<div>
		<video src={cam} class="preview" />
		<button disabled={!cam.ready} onClick={async () => (photo = await cam.takePhoto())}>Take photo</button>
		<base.button pressed={cam.facing === 'front'} onChange={() => cam.flip()}>Front camera</base.button>
		@if (photo) {
			<img src={photo.url} alt="Last photo" class="photo" />
		}
	</div>
}

function DocumentPanel() @{
	const doc = pdf('/guide.pdf');

	<div>
		<embed src={doc} class="document" />
		<p>{`Page ${doc.page} of ${doc.pages}`}</p>
		<button disabled={doc.page <= 1} onClick={() => doc.page--}>Previous</button>
		<button disabled={doc.page >= doc.pages} onClick={() => doc.page++}>Next</button>
	</div>
}

export default function Media() @{
	<tabs.root value="camera">
		<tabs.list>
			<tabs.trigger value="camera">Camera</tabs.trigger>
			<tabs.trigger value="document">Document</tabs.trigger>
		</tabs.list>
		<tabs.content value="camera">
			<CameraPanel />
		</tabs.content>
		<tabs.content value="document">
			<DocumentPanel />
		</tabs.content>
	</tabs.root>
}

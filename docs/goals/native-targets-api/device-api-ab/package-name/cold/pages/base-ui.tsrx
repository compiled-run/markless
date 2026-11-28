import { state } from '@markless/core';
import { camera, native } from '@markless/device';
import { modal, tabs, ui } from '@markless/base';

export default function Account() @{
	let tab = state('profile');
	let confirmOpen = state(false);
	let photoOpen = state(false);
	const cam = camera();

	<main>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="profile">Profile</tabs.trigger>
				<tabs.trigger value="photo">Photo</tabs.trigger>
			</tabs.list>
			<tabs.content value="profile">
				<ui.label for="name">Name</ui.label>
				<input id="name" />
				<ui.separator />
				<ui.button onClick={() => (confirmOpen = true)}>Delete account</ui.button>
			</tabs.content>
			<tabs.content value="photo">
				<ui.button onClick={() => (photoOpen = true)}>Change photo</ui.button>
			</tabs.content>
		</tabs.root>

		<modal.root open={confirmOpen} onChange={(open) => (confirmOpen = open)}>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete your account?</modal.title>
					<ui.button onClick={() => (confirmOpen = false)}>Delete</ui.button>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<native.sheet open={photoOpen} onChange={(open) => (photoOpen = open)}>
			<native.camera el={cam} />
			<ui.button onClick={() => cam.takePhoto()}>Take photo</ui.button>
		</native.sheet>
	</main>
}

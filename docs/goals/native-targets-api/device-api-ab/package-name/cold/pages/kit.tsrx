import { state } from '@markless/core';
import { camera, native } from '@markless/device';
import { modal, tabs, base } from '@markless/kit';

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
				<base.label for="name">Name</base.label>
				<input id="name" />
				<base.separator />
				<base.button onClick={() => (confirmOpen = true)}>Delete account</base.button>
			</tabs.content>
			<tabs.content value="photo">
				<base.button onClick={() => (photoOpen = true)}>Change photo</base.button>
			</tabs.content>
		</tabs.root>

		<modal.root open={confirmOpen} onChange={(open) => (confirmOpen = open)}>
			<modal.backdrop>
				<modal.content>
					<modal.title>Delete your account?</modal.title>
					<base.button onClick={() => (confirmOpen = false)}>Delete</base.button>
					<modal.close>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>

		<native.sheet open={photoOpen} onChange={(open) => (photoOpen = open)}>
			<native.camera el={cam} />
			<base.button onClick={() => cam.takePhoto()}>Take photo</base.button>
		</native.sheet>
	</main>
}

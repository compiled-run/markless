import * as tabs from '../index.ts';

// A settings page: one tab nobody may open, and panels holding their own
// focusable controls, which is what makes the panel tab stop matter.
export default function SettingsPanels() @{
	<tabs.root value="profile" data-testid="root">
		<tabs.list data-testid="list" aria-label="Settings">
			<tabs.trigger value="profile" data-testid="profile-trigger">Profile</tabs.trigger>
			<tabs.trigger value="team" disabled data-testid="team-trigger">Team</tabs.trigger>
			<tabs.trigger value="danger" data-testid="danger-trigger">Danger zone</tabs.trigger>
		</tabs.list>
		<tabs.content value="profile" data-testid="profile-content">
			<label for="display-name">Display name</label>
			<input id="display-name" data-testid="display-name" value="Ada" />
		</tabs.content>
		<tabs.content value="team" data-testid="team-content">
			Invite people once your plan includes seats.
		</tabs.content>
		<tabs.content value="danger" data-testid="danger-content">
			<button type="button" data-testid="delete">Delete this workspace</button>
		</tabs.content>
	</tabs.root>
}

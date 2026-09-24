<script lang="ts">
	import {
		SETTINGS_ENDPOINT,
		SETTINGS_INITIAL,
		SETTINGS_NETWORK_ERROR_MESSAGE,
		SETTINGS_PENDING_TEXT,
		SETTINGS_SUBMIT_TEXT,
		hasErrors,
		settingsTotalText,
		validateSettings,
		type SettingsField,
		type SettingsResponseBody
	} from '$lib/shared/data';

	interface FieldSpec {
		key: SettingsField;
		slug: string;
		label: string;
		type: 'text' | 'email';
		inputmode?: 'numeric' | 'decimal';
	}

	const FIELDS: FieldSpec[] = [
		{ key: 'name', slug: 'name', label: 'Display name', type: 'text' },
		{ key: 'email', slug: 'email', label: 'Email', type: 'email' },
		{ key: 'quantity', slug: 'quantity', label: 'Quantity', type: 'text', inputmode: 'numeric' },
		{ key: 'unitPrice', slug: 'unit-price', label: 'Unit price', type: 'text', inputmode: 'decimal' }
	];

	let values = $state({ ...SETTINGS_INITIAL });
	let attempted = $state(false);
	let pending = $state(false);
	let status = $state('');
	let serverError = $state<string | null>(null);
	const inputs: Partial<Record<SettingsField, HTMLInputElement>> = {};

	const errors = $derived(attempted ? validateSettings(values) : {});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		attempted = true;
		const found = validateSettings(values);
		if (hasErrors(found)) {
			const first = FIELDS.find((f) => found[f.key] !== undefined);
			if (first) inputs[first.key]?.focus();
			return;
		}
		pending = true;
		status = SETTINGS_PENDING_TEXT;
		serverError = null;
		try {
			const response = await fetch(SETTINGS_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...values })
			});
			const body = (await response.json()) as SettingsResponseBody;
			if (response.status === 200 && body.ok) {
				status = body.message;
			} else {
				status = '';
				serverError = body.ok ? SETTINGS_NETWORK_ERROR_MESSAGE : body.error;
			}
		} catch {
			status = '';
			serverError = SETTINGS_NETWORK_ERROR_MESSAGE;
		} finally {
			pending = false;
		}
	}
</script>

<form class="form" data-testid="settings-form" novalidate onsubmit={submit}>
	{#each FIELDS as field (field.key)}
		{@const error = errors[field.key]}
		<div class="field">
			<label class="field-label" for="settings-{field.slug}">{field.label}</label>
			<input
				bind:this={inputs[field.key]}
				class="input"
				id="settings-{field.slug}"
				type={field.type}
				inputmode={field.inputmode}
				data-testid="settings-{field.slug}"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? `settings-${field.slug}-error` : undefined}
				bind:value={values[field.key]}
			/>
			{#if error}
				<p class="field-error" id="settings-{field.slug}-error" data-testid="settings-{field.slug}-error">{error}</p>
			{/if}
		</div>
	{/each}
	<p class="derived" data-testid="settings-total">{settingsTotalText(values)}</p>
	<div class="form-actions">
		<button type="submit" class="button button-primary" data-testid="settings-submit" disabled={pending}
			>{pending ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT}</button
		>
		<p class="status" data-testid="settings-status" role="status">{status}</p>
	</div>
	{#if serverError !== null}
		<p class="alert" data-testid="settings-error" role="alert">{serverError}</p>
	{/if}
</form>

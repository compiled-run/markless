<script lang="ts">
	import {
		COUNTER_INITIAL,
		FILTER_ITEMS,
		INITIAL_TAB,
		OVERVIEW_PROSE,
		STEPPER_INITIAL,
		STEPPER_MAX,
		STEPPER_MIN,
		TABS,
		filterCountText,
		filterItems,
		stepperDerivedText,
		toggleStatusText
	} from '$lib/shared/data';

	let count = $state(COUNTER_INITIAL);
	let pressed = $state(false);
	let stepper = $state(STEPPER_INITIAL);
	let selectedTab = $state(INITIAL_TAB);
	let query = $state('');

	const selected = $derived(TABS.find((t) => t.id === selectedTab) ?? TABS[0]);
	const matches = $derived(filterItems(FILTER_ITEMS, query));
	const tabButtons: HTMLButtonElement[] = [];

	function onTabKeydown(event: KeyboardEvent, index: number) {
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
		else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = TABS.length - 1;
		else return;
		event.preventDefault();
		selectedTab = TABS[next].id;
		tabButtons[next].focus();
	}
</script>

<div class="prose">
	{#each OVERVIEW_PROSE as paragraph, i (i)}
		<p>{paragraph}</p>
	{/each}
</div>

<h2 class="section-title">Panels</h2>
<div class="panels">
	<section class="panel">
		<h3 class="panel-title">Counter</h3>
		<output class="value" data-testid="counter-value">{count}</output>
		<button type="button" class="button" data-testid="counter-increment" onclick={() => count++}
			>Increment</button
		>
	</section>
	<section class="panel">
		<h3 class="panel-title">Toggle</h3>
		<button
			type="button"
			class="button"
			data-testid="toggle-button"
			aria-pressed={pressed ? 'true' : 'false'}
			onclick={() => (pressed = !pressed)}>Notifications</button
		>
		<output class="value" data-testid="toggle-status">{toggleStatusText(pressed)}</output>
	</section>
	<section class="panel">
		<h3 class="panel-title">Stepper</h3>
		<div class="row">
			<button
				type="button"
				class="button"
				data-testid="stepper-decrement"
				aria-label="Decrease"
				disabled={stepper <= STEPPER_MIN}
				onclick={() => (stepper = Math.max(STEPPER_MIN, stepper - 1))}>−</button
			>
			<output class="value" data-testid="stepper-value">{stepper}</output>
			<button
				type="button"
				class="button"
				data-testid="stepper-increment"
				aria-label="Increase"
				disabled={stepper >= STEPPER_MAX}
				onclick={() => (stepper = Math.min(STEPPER_MAX, stepper + 1))}>+</button
			>
		</div>
		<p class="derived" data-testid="stepper-derived">{stepperDerivedText(stepper)}</p>
	</section>
</div>

<div class="tabs">
	<div class="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
		{#each TABS as tab, i (tab.id)}
			<button
				bind:this={tabButtons[i]}
				type="button"
				class="tab"
				role="tab"
				id="tab-{tab.id}"
				data-testid="tab-{tab.id}"
				aria-controls="tab-panel"
				aria-selected={tab.id === selectedTab ? 'true' : 'false'}
				tabindex={tab.id === selectedTab ? 0 : -1}
				onclick={() => (selectedTab = tab.id)}
				onkeydown={(event) => onTabKeydown(event, i)}>{tab.label}</button
			>
		{/each}
	</div>
	<div
		class="tabpanel"
		role="tabpanel"
		id="tab-panel"
		data-testid="tab-panel"
		aria-labelledby="tab-{selected.id}"
		tabindex="0">{selected.content}</div
	>
</div>

<section class="filter">
	<div class="field">
		<label class="field-label" for="filter-input">Filter items</label>
		<input
			class="input"
			id="filter-input"
			type="search"
			data-testid="filter-input"
			autocomplete="off"
			bind:value={query}
		/>
	</div>
	<p class="muted" data-testid="filter-count">{filterCountText(matches.length)}</p>
	{#if matches.length > 0}
		<ul class="list" data-testid="filter-list">
			{#each matches as item (item)}
				<li data-testid="filter-item">{item}</li>
			{/each}
		</ul>
	{:else}
		<p class="muted" data-testid="filter-empty">No matching items</p>
	{/if}
</section>

import type { DocumentHead } from "@qwik.dev/router";
import { $, component$, sync$, useComputed$, useSignal } from "@qwik.dev/core";
import {
  COUNTER_INITIAL,
  FILTER_ITEMS,
  INITIAL_TAB,
  OVERVIEW_PROSE,
  ROUTES,
  STEPPER_INITIAL,
  STEPPER_MAX,
  STEPPER_MIN,
  TABS,
  documentTitle,
  filterCountText,
  filterItems,
  stepperDerivedText,
  toggleStatusText,
  type TabInfo,
} from "~/shared/data";

const CounterPanel = component$(() => {
  const count = useSignal(COUNTER_INITIAL);
  return (
    <section class="panel">
      <h3 class="panel-title">Counter</h3>
      <output class="value" data-testid="counter-value">
        {count.value}
      </output>
      <button
        type="button"
        class="button"
        data-testid="counter-increment"
        onClick$={() => count.value++}
      >
        Increment
      </button>
    </section>
  );
});

const TogglePanel = component$(() => {
  const on = useSignal(false);
  return (
    <section class="panel">
      <h3 class="panel-title">Toggle</h3>
      <button
        type="button"
        class="button"
        data-testid="toggle-button"
        aria-pressed={on.value ? "true" : "false"}
        onClick$={() => (on.value = !on.value)}
      >
        Notifications
      </button>
      <output class="value" data-testid="toggle-status">
        {toggleStatusText(on.value)}
      </output>
    </section>
  );
});

const StepperPanel = component$(() => {
  const value = useSignal(STEPPER_INITIAL);
  return (
    <section class="panel">
      <h3 class="panel-title">Stepper</h3>
      <div class="row">
        <button
          type="button"
          class="button"
          data-testid="stepper-decrement"
          aria-label="Decrease"
          disabled={value.value <= STEPPER_MIN}
          onClick$={() => {
            if (value.value > STEPPER_MIN) value.value--;
          }}
        >
          −
        </button>
        <output class="value" data-testid="stepper-value">
          {value.value}
        </output>
        <button
          type="button"
          class="button"
          data-testid="stepper-increment"
          aria-label="Increase"
          disabled={value.value >= STEPPER_MAX}
          onClick$={() => {
            if (value.value < STEPPER_MAX) value.value++;
          }}
        >
          +
        </button>
      </div>
      <p class="derived" data-testid="stepper-derived">
        {stepperDerivedText(value.value)}
      </p>
    </section>
  );
});

const TAB_KEYS = ["ArrowRight", "ArrowLeft", "Home", "End"];

const Tabs = component$(() => {
  const selected = useSignal<TabInfo["id"]>(INITIAL_TAB);
  const selectedTab = useComputed$(
    () => TABS.find((tab) => tab.id === selected.value) ?? TABS[0],
  );
  const moveFocus = $((key: string, index: number) => {
    let next: number;
    if (key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (key === "Home") next = 0;
    else if (key === "End") next = TABS.length - 1;
    else return;
    const tab = TABS[next];
    selected.value = tab.id;
    document.getElementById(`tab-${tab.id}`)?.focus();
  });
  return (
    <div class="tabs">
      <div
        class="tablist"
        role="tablist"
        aria-label="Details"
        data-testid="overview-tabs"
      >
        {TABS.map((tab, index) => {
          const isSelected = selected.value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              class="tab"
              role="tab"
              id={`tab-${tab.id}`}
              data-testid={`tab-${tab.id}`}
              aria-controls="tab-panel"
              aria-selected={isSelected ? "true" : "false"}
              tabIndex={isSelected ? 0 : -1}
              onClick$={() => (selected.value = tab.id)}
              onKeyDown$={[
                sync$((event: KeyboardEvent) => {
                  if (
                    ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    event.preventDefault();
                }),
                $((event: KeyboardEvent) => {
                  if (TAB_KEYS.includes(event.key))
                    return moveFocus(event.key, index);
                }),
              ]}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        class="tabpanel"
        role="tabpanel"
        id="tab-panel"
        data-testid="tab-panel"
        aria-labelledby={`tab-${selectedTab.value.id}`}
        tabIndex={0}
      >
        {selectedTab.value.content}
      </div>
    </div>
  );
});

const Filter = component$(() => {
  const query = useSignal("");
  const items = useComputed$(() => filterItems(FILTER_ITEMS, query.value));
  return (
    <section class="filter">
      <div class="field">
        <label class="field-label" for="filter-input">
          Filter items
        </label>
        <input
          class="input"
          type="search"
          id="filter-input"
          data-testid="filter-input"
          autoComplete="off"
          bind:value={query}
        />
      </div>
      <p class="muted" data-testid="filter-count">
        {filterCountText(items.value.length)}
      </p>
      {items.value.length === 0 ? (
        <p class="muted" data-testid="filter-empty">
          No matching items
        </p>
      ) : (
        <ul class="list" data-testid="filter-list">
          {items.value.map((item) => (
            <li key={item} data-testid="filter-item">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export default component$(() => {
  return (
    <>
      <h1 class="page-title" data-testid="page-title">
        Overview
      </h1>
      <div class="prose">
        {OVERVIEW_PROSE.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <h2 class="section-title">Panels</h2>
      <div class="panels">
        <CounterPanel />
        <TogglePanel />
        <StepperPanel />
      </div>
      <Tabs />
      <Filter />
    </>
  );
});

export const head: DocumentHead = { title: documentTitle(ROUTES[0]) };

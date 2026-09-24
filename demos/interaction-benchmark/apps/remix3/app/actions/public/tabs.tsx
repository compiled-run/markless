import { clientEntry, on, ref, type Handle } from 'remix/ui'

import { INITIAL_TAB, TABS, type TabInfo } from '../../shared/data.ts'

export const Tabs = clientEntry(import.meta.url, function Tabs(handle: Handle) {
  let selected: TabInfo['id'] = INITIAL_TAB
  let buttons = new Map<TabInfo['id'], HTMLButtonElement>()

  async function select(id: TabInfo['id'], focus: boolean) {
    selected = id
    await handle.update()
    if (focus) buttons.get(id)?.focus()
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    let target: number
    if (event.key === 'ArrowRight') target = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') target = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = TABS.length - 1
    else return
    event.preventDefault()
    void select(TABS[target]!.id, true)
  }

  return () => {
    let current = TABS.find((tab) => tab.id === selected)!
    return (
      <>
        <div className="tablist" role="tablist" aria-label="Details" data-testid="overview-tabs">
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              className="tab"
              role="tab"
              id={`tab-${tab.id}`}
              data-testid={`tab-${tab.id}`}
              aria-controls="tab-panel"
              aria-selected={tab.id === selected ? 'true' : 'false'}
              tabIndex={tab.id === selected ? 0 : -1}
              mix={[
                on('click', () => void select(tab.id, false)),
                on('keydown', (event) => onKeyDown(event, index)),
                ref((node) => buttons.set(tab.id, node)),
              ]}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          className="tabpanel"
          role="tabpanel"
          id="tab-panel"
          data-testid="tab-panel"
          aria-labelledby={`tab-${selected}`}
          tabIndex={0}
        >
          {current.content}
        </div>
      </>
    )
  }
})

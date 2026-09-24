import { clientEntry, on, type Handle } from 'remix/ui'

import { FILTER_ITEMS, filterCountText, filterItems } from '../../shared/data.ts'

export const Filter = clientEntry(import.meta.url, function Filter(handle: Handle) {
  let query = ''

  return () => {
    let items = filterItems(FILTER_ITEMS, query)
    return (
      <>
        <div className="field">
          <label className="field-label" htmlFor="filter-input">
            Filter items
          </label>
          <input
            className="input"
            type="search"
            id="filter-input"
            data-testid="filter-input"
            autoComplete="off"
            value={query}
            mix={on('input', (event) => {
              query = event.currentTarget.value
              handle.update()
            })}
          />
        </div>
        <p className="muted" data-testid="filter-count">
          {filterCountText(items.length)}
        </p>
        <ul className="list" data-testid="filter-list">
          {items.map((item) => (
            <li key={item} data-testid="filter-item">
              {item}
            </li>
          ))}
        </ul>
        {items.length === 0 ? (
          <p className="muted" data-testid="filter-empty">
            No matching items
          </p>
        ) : null}
      </>
    )
  }
})

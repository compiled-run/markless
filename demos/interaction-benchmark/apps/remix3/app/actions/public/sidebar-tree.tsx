import { clientEntry, on, type Handle } from 'remix/ui'

import { SIDEBAR_TREE, type TreeNode } from '../../shared/data.ts'

export const SidebarTree = clientEntry(import.meta.url, function SidebarTree(handle: Handle) {
  let expanded = new Set<string>()

  function toggle(id: string) {
    if (expanded.has(id)) expanded.delete(id)
    else expanded.add(id)
    handle.update()
  }

  function renderNodes(nodes: readonly TreeNode[], className: string, id?: string) {
    return (
      <ul
        className={className}
        id={id ? `disclosure-panel-${id}` : undefined}
        data-testid={id ? `disclosure-panel-${id}` : undefined}
        hidden={id ? !expanded.has(id) : undefined}
      >
        {nodes.map((node) =>
          node.children ? (
            <li key={node.id}>
              <button
                type="button"
                className="tree-toggle"
                data-testid={`disclosure-${node.id}`}
                aria-expanded={expanded.has(node.id) ? 'true' : 'false'}
                aria-controls={`disclosure-panel-${node.id}`}
                mix={on('click', () => toggle(node.id))}
              >
                {node.label}
              </button>
              {renderNodes(node.children, 'tree-panel', node.id)}
            </li>
          ) : (
            <li key={node.id}>
              <span className="tree-leaf" data-testid={`tree-leaf-${node.id}`}>
                {node.label}
              </span>
            </li>
          ),
        )}
      </ul>
    )
  }

  return () => renderNodes(SIDEBAR_TREE, 'tree')
})

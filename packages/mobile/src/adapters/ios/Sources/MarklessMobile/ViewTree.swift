#if canImport(UIKit)
import MarklessCore
import UIKit

private let headings: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
private let unimplementedElements: Set<String> = [
	"a", "audio", "canvas", "details", "dialog", "embed", "form", "iframe", "img", "label", "object", "option",
	"picture", "select", "summary", "svg", "textarea", "video",
]

/// The retained views of one payload: built by the view factory, then changed only by `apply(_:)`.
@MainActor
final class ViewTree {
	let root = UIView()
	private let runtime: NativeRuntime
	private let layout: StyleLayout?
	private let faces: [String: UIFontDescriptor]
	private let onAction: (NativeAction) -> Void
	private let nodes: [String: NativeNode]
	private let order: [String]
	/// The nodes each element, root (`""`) or branch arm (`branch#index`) places directly, in document order.
	private let slots: [String: [String]]
	private let events: [String: [NativeEvent]]
	private(set) var elements: [String: UIView] = [:]
	private(set) var labels: [String: UILabel] = [:]
	private var buttonOf: [String: UIButton] = [:]
	private var headingOf: [String: Bool] = [:]
	private var attributes: [String: [String: String]] = [:]
	private var branches: [String: (anchor: UIView, index: Int?, built: [String])] = [:]
	private var anchors = Set<ObjectIdentifier>()
	private var stackConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]

	init(
		runtime: NativeRuntime, layout: StyleLayout?, faces: [String: UIFontDescriptor], onAction: @escaping (NativeAction) -> Void
	) throws {
		self.runtime = runtime
		self.layout = layout
		self.faces = faces
		self.onAction = onAction
		let payload = runtime.payload
		nodes = Dictionary(uniqueKeysWithValues: payload.nodes.map { ($0.id, $0) })
		order = payload.nodes.map(\.id)
		let branchParents = Dictionary(uniqueKeysWithValues: payload.nodes.compactMap { node -> (String, String)? in
			if case .branch = node { return (node.id, node.parent ?? "") }
			return nil
		})
		var slots: [String: [String]] = [:]
		for node in payload.nodes {
			let parent = node.parent ?? ""
			let key = node.arm.flatMap { arm in branchParents[arm.branch] == parent ? "\(arm.branch)#\(arm.index)" : nil } ?? parent
			slots[key, default: []].append(node.id)
		}
		self.slots = slots
		events = Dictionary(grouping: payload.events, by: \.host)
		var index = 0
		_ = try build("", in: root, at: &index, button: nil, heading: false)
		if layout == nil { stackTree(root) }
	}

	func mount(in screen: UIView) {
		let guide = layout == nil ? screen.layoutMarginsGuide : screen.safeAreaLayoutGuide
		root.translatesAutoresizingMaskIntoConstraints = false
		screen.addSubview(root)
		NSLayoutConstraint.activate([
			root.topAnchor.constraint(equalTo: guide.topAnchor),
			root.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
			root.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
		])
		if let layout { root.heightAnchor.constraint(equalToConstant: layout.viewport.height).isActive = true }
	}

	/// The journal applier: the only code that changes a retained view after the first build.
	func apply(_ journal: [NativeJournalEntry]) throws {
		for entry in journal {
			switch entry {
			case let .text(node, value):
				guard let label = labels[node] else { throw HostError("journal names text node \(node), which is not shown") }
				label.text = value
				if let button = buttonOf[node] { refreshLabel(of: button) }
			case .state:
				if layout != nil { throw HostError("a styled cell changed, and switching styles needs dragon.native-style-export/1") }
			case let .property(node, _, value):
				guard let field = elements[node] as? UITextField else { throw HostError("journal names input \(node), which is not a shown field") }
				field.text = value
			case let .attribute(node, name, value):
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				attributes[node, default: [:]][name] = value
				try applyAttributes(node, view)
			case let .arm(node, index):
				guard let branch = branches[node], case let .branch(_, parent, _, _, _) = nodes[node] else {
					throw HostError("journal names branch \(node), which is not shown")
				}
				let container = parent.flatMap { elements[$0] } ?? root
				for id in branch.built { remove(id) }
				var position = (container.subviews.firstIndex(of: branch.anchor) ?? container.subviews.count) + 1
				let built = try index.map {
					try build("\(node)#\($0)", in: container, at: &position, button: buttonOf[parent ?? ""], heading: headingOf[parent ?? ""] ?? false)
				} ?? []
				branches[node] = (branch.anchor, index, built)
				if let button = buttonOf[parent ?? ""] { refreshLabel(of: button) }
				if layout == nil {
					stack(container)
					for id in built { if let view = elements[id] { stackTree(view) } }
				}
			}
		}
	}

	/// The view factory: builds the nodes of one slot list from current values, inserting them into `container` at `index`.
	private func build(_ key: String, in container: UIView, at index: inout Int, button: UIButton?, heading: Bool) throws -> [String] {
		let ids = slots[key] ?? []
		for id in ids {
			let node = nodes[id]!
			switch node {
			case let .element(_, element, _, staticAttributes, bindings, _):
				if unimplementedElements.contains(element) { throw HostError("<\(element)> \(id) has no iOS view yet") }
				let view: UIView
				if element == "button" {
					if button != nil { throw HostError("<button> \(id) is inside another button") }
					let control = UIButton(type: .custom)
					control.isAccessibilityElement = true
					control.accessibilityTraits = .button
					view = control
				} else if element == "input" {
					if button != nil { throw HostError("<input> \(id) is inside a button") }
					let field = UITextField()
					if layout == nil {
						field.borderStyle = .roundedRect
						field.widthAnchor.constraint(equalToConstant: 240).isActive = true
					}
					view = field
				} else {
					view = UIView()
					view.isUserInteractionEnabled = button == nil
				}
				let enclosing = (view as? UIButton) ?? button
				let isHeading = heading || headings.contains(element)
				buttonOf[id] = enclosing
				headingOf[id] = isHeading
				view.accessibilityIdentifier = id
				elements[id] = view
				if let style = layout?.styles[id] { try paint(view, style, faces: faces) }
				container.insertSubview(view, at: index)
				index += 1
				let onAction = onAction
				for event in events[id] ?? [] {
					switch (event.event, view) {
					case let (.activate, control as UIButton):
						control.addAction(UIAction { _ in onAction(NativeAction(event: .activate, host: id)) }, for: .touchUpInside)
					case let (.input, field as UITextField):
						field.addAction(
							UIAction { [weak field] _ in onAction(NativeAction(event: .input, host: id, value: field?.text ?? "")) },
							for: .editingChanged)
					default:
						throw HostError("\(event.event.rawValue) on <\(element)> \(id) has no iOS control event yet")
					}
				}
				var current = staticAttributes
				for binding in bindings where !binding.isProperty {
					current[binding.name] = marklessAttributeValue(binding.name, try runtime.evaluate(binding.value))
				}
				if let field = view as? UITextField {
					field.text = try runtime.properties().first { $0.node == id && $0.name == "value" }?.value ?? staticAttributes["value"]
				}
				attributes[id] = current
				var inner = 0
				_ = try build(id, in: view, at: &inner, button: enclosing, heading: isHeading)
				try applyAttributes(id, view)
			case let .text(_, _, parts, _):
				let label = UILabel()
				label.isUserInteractionEnabled = false
				label.numberOfLines = 0
				label.accessibilityIdentifier = id
				label.text = try runtime.text(of: parts)
				if let button {
					label.isAccessibilityElement = false
					buttonOf[id] = button
					if layout == nil { label.textColor = .tintColor }
				} else if heading {
					label.accessibilityTraits.insert(.header)
				}
				if let style = layout?.styles[id] { try paint(label, style, faces: faces) }
				labels[id] = label
				container.insertSubview(label, at: index)
				index += 1
				if let button { refreshLabel(of: button) }
			case .branch:
				let anchor = UIView()
				anchor.isHidden = true
				anchor.isAccessibilityElement = false
				anchors.insert(ObjectIdentifier(anchor))
				container.insertSubview(anchor, at: index)
				index += 1
				let arm = try runtime.arm(of: id)
				let built = try arm.map { try build("\(id)#\($0)", in: container, at: &index, button: button, heading: heading) } ?? []
				branches[id] = (anchor, arm, built)
			}
		}
		return ids
	}

	private func remove(_ id: String) {
		if let branch = branches.removeValue(forKey: id) {
			for inner in branch.built { remove(inner) }
			anchors.remove(ObjectIdentifier(branch.anchor))
			branch.anchor.removeFromSuperview()
			return
		}
		for child in slots[id] ?? [] { remove(child) }
		labels.removeValue(forKey: id)?.removeFromSuperview()
		if let view = elements.removeValue(forKey: id) {
			stackConstraints.removeValue(forKey: ObjectIdentifier(view))
			view.removeFromSuperview()
		}
		buttonOf.removeValue(forKey: id)
		headingOf.removeValue(forKey: id)
		attributes.removeValue(forKey: id)
	}

	/// Bound and static attributes as platform state; `class` reaches views only through the style export.
	private func applyAttributes(_ id: String, _ view: UIView) throws {
		let current = attributes[id] ?? [:]
		if let button = view as? UIButton {
			button.isEnabled = current["disabled"] == nil
			if button.isEnabled { button.accessibilityTraits.remove(.notEnabled) } else { button.accessibilityTraits.insert(.notEnabled) }
			refreshLabel(of: button)
		} else {
			view.accessibilityLabel = current["aria-label"]
		}
		if current["aria-pressed"] == "true" || current["aria-selected"] == "true" {
			view.accessibilityTraits.insert(.selected)
		} else {
			view.accessibilityTraits.remove(.selected)
		}
		view.accessibilityValue = current["aria-expanded"].map { $0 == "true" ? "expanded" : "collapsed" }
	}

	private func refreshLabel(of button: UIButton) {
		guard let id = button.accessibilityIdentifier else { return }
		if let label = attributes[id]?["aria-label"] {
			button.accessibilityLabel = label
			return
		}
		button.accessibilityLabel = order.compactMap { node in buttonOf[node] === button ? labels[node]?.text : nil }.joined()
	}

	private func stackTree(_ view: UIView) {
		guard !(view is UILabel || view is UITextField) else { return }
		stack(view)
		for child in view.subviews where !anchors.contains(ObjectIdentifier(child)) { stackTree(child) }
	}

	/// The temporary layout for rungs without Dragon: children top to bottom, start-aligned.
	private func stack(_ container: UIView) {
		NSLayoutConstraint.deactivate(stackConstraints[ObjectIdentifier(container)] ?? [])
		var constraints: [NSLayoutConstraint] = []
		var above = container.topAnchor
		for child in container.subviews where !anchors.contains(ObjectIdentifier(child)) {
			child.translatesAutoresizingMaskIntoConstraints = false
			constraints += [
				child.topAnchor.constraint(equalTo: above),
				child.leadingAnchor.constraint(equalTo: container.leadingAnchor),
				child.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor),
			]
			above = child.bottomAnchor
		}
		constraints.append(above.constraint(equalTo: container.bottomAnchor))
		NSLayoutConstraint.activate(constraints)
		stackConstraints[ObjectIdentifier(container)] = constraints
	}
}

@MainActor
private func paint(_ view: UIView, _ style: ResolvedStyle, faces: [String: UIFontDescriptor]) throws {
	guard let frame = style.frame else { throw HostError("\(view.accessibilityIdentifier ?? "a view") has no frame in the style export") }
	view.frame = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
	view.backgroundColor = style.background.map(uiColor) ?? .clear
	view.layer.borderWidth = style.borderWidth
	view.layer.borderColor = style.borderColor.map(uiColor)?.cgColor
	view.layer.cornerRadius = style.cornerRadius
	guard let label = view as? UILabel else {
		if style.font != nil || style.textColor != nil { throw HostError("\(view.accessibilityIdentifier ?? "a box") has text styles but is not text") }
		return
	}
	if let font = style.font {
		guard let face = faces[font.family] else { throw HostError("font \(font.family) was not registered") }
		label.font = UIFont(descriptor: face, size: font.size)
	}
	if let color = style.textColor { label.textColor = uiColor(color) }
}

private func uiColor(_ color: RGBA) -> UIColor {
	UIColor(red: color.r / 255, green: color.g / 255, blue: color.b / 255, alpha: color.alpha / 255)
}
#endif

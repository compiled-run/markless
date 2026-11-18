#if canImport(UIKit)
import AVFoundation
import MarklessCore
import UIKit

private let headings: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
private let unimplementedElements: Set<String> = [
	"canvas", "details", "embed", "form", "iframe", "object", "option",
	"picture", "select", "summary", "svg", "textarea", "video",
]

/// Where an instance is built: its row (`@key`, empty outside lists), the names its expressions see, and what encloses it.
private struct Context {
	var suffix = ""
	var scope = NativeScope.empty
	var button: UIButton?
	var heading = false
}

/// The retained views of one payload: built by the view factory, then changed only by `apply(_:)`.
@MainActor
final class ViewTree {
	let root = UIView()
	let keyboard: KeyboardDismisser
	private let runtime: NativeRuntime
	private let layout: StyleLayout?
	private let faces: [String: UIFontDescriptor]
	private let onAction: (NativeAction) -> Void
	/// The view of a device object (a camera's preview), made by the page's device.
	private let objectView: (_ object: String, _ device: String) throws -> UIView
	private let nodes: [String: NativeNode]
	/// The nodes each element, root (`""`), branch arm (`branch#index`) or list row (`repeat id`) places directly.
	private let slots: [String: [String]]
	private let events: [String: [NativeEvent]]
	private(set) var elements: [String: UIView] = [:]
	private(set) var labels: [String: UILabel] = [:]
	private var contexts: [String: Context] = [:]
	private var templates: [String: String] = [:]
	private var attributes: [String: [String: String]] = [:]
	private var branches: [String: (anchor: UIView, index: Int?, built: [String])] = [:]
	private var lists: [String: (anchor: UIView, keys: [String], built: [String: [String]])] = [:]
	private(set) var sheets: [String: SystemSheet] = [:]
	/// The controller that presents the page's system sheets.
	weak var presenter: UIViewController?
	private var anchors = Set<ObjectIdentifier>()
	private var assignment: Int
	/// Taps and drags on the page dismiss the keyboard; a stack makes them wait for its edge-swipe Back.
	let dismissGestures: [UIGestureRecognizer] = [UITapGestureRecognizer(), UIPanGestureRecognizer()]
	private var stackConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var forwards: [LabelForward] = []
	private var dialogIds = Set<String>()
	/// The open dialog's top layer and the place in the page its view returns to.
	private var topLayer: (layer: TopLayerView, home: UIView, index: Int)?

	init(
		runtime: NativeRuntime, layout: StyleLayout?, faces: [String: UIFontDescriptor], onAction: @escaping (NativeAction) -> Void,
		objectView: @escaping (_ object: String, _ device: String) throws -> UIView = { object, _ in throw HostError("no device to show \(object)") }
	) throws {
		self.runtime = runtime
		self.objectView = objectView
		self.layout = layout
		self.faces = faces
		self.onAction = onAction
		keyboard = KeyboardDismisser(root)
		assignment = layout?.start ?? 0
		let payload = runtime.payload
		let nodes = Dictionary(uniqueKeysWithValues: payload.nodes.map { ($0.id, $0) })
		self.nodes = nodes
		var slots: [String: [String]] = [:]
		for node in payload.nodes {
			let parent = node.parent ?? ""
			let key: String
			if let row = node.row, (nodes[row]?.parent ?? "") == parent {
				key = row
			} else if let arm = node.arm, (nodes[arm.branch]?.parent ?? "") == parent {
				key = "\(arm.branch)#\(arm.index)"
			} else {
				key = parent
			}
			slots[key, default: []].append(node.id)
		}
		self.slots = slots
		events = Dictionary(grouping: payload.events, by: \.host)
		var index = 0
		_ = try build("", in: root, at: &index, Context())
		for gesture in dismissGestures {
			gesture.cancelsTouchesInView = false
			gesture.addTarget(keyboard, action: #selector(KeyboardDismisser.dismiss))
			root.addGestureRecognizer(gesture)
		}
		if layout == nil {
			stackTree(root)
			for sheet in sheets.values { stackTree(sheet.content) }
		}
		refreshRelations()
	}

	func pageAppeared(_ host: UIViewController) {
		for sheet in sheets.values { sheet.hostAppeared(host) }
	}

	/// Before the page is rebuilt: its sheets go with it, without a `dismiss` action.
	func closeSheets() {
		for sheet in sheets.values { sheet.close(animated: false) }
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

	/// The colour behind the page in the current assignment: the export's canvas, else the web canvas's white.
	var canvas: UIColor? { layout.map { $0.canvases[assignment].map(uiColor) ?? .white } }

	/// The journal applier: the only code that changes a retained view after the first build.
	func apply(_ journal: [NativeJournalEntry]) throws {
		for entry in journal {
			switch entry {
			case let .text(node, value):
				guard let label = labels[node] else { throw HostError("journal names text node \(node), which is not shown") }
				label.text = value
				if let button = contexts[node]?.button { refreshLabel(of: button) }
			case let .property(node, _, value):
				guard let field = elements[node] as? UITextField else { throw HostError("journal names input \(node), which is not a shown field") }
				field.text = value
			case let .attribute(node, name, value):
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				attributes[node, default: [:]][name] = value
				applyAttributes(node, view)
			case let .sheet(node, open):
				guard let sheet = sheets[node] else { throw HostError("journal names sheet \(node), which is not built") }
				if open { sheet.open(from: presenter) } else { sheet.close() }
			case .navigate, .title:
				throw HostError("navigate and title entries reach the screen's controller, not its views")
			case .call, .release:
				throw HostError("a \(entry.json.jsonText) entry reaches the page's device, not its views")
			case let .dialog(node, open):
				try present(node, open: open)
			case let .command(node, command, preventScroll):
				guard let view = elements[node] else { throw HostError("journal names element \(node), which is not shown") }
				root.layoutIfNeeded()
				// As on the web, focus brings the element into view unless told not to; only a scrolling ancestor can.
				if command == "scrollIntoView" || !preventScroll {
					var ancestor = view.superview
					while let candidate = ancestor, !(candidate is UIScrollView) { ancestor = candidate.superview }
					if let scroll = ancestor as? UIScrollView { scroll.scrollRectToVisible(view.convert(view.bounds, to: scroll), animated: false) }
				}
				if command == "scrollIntoView" {
				} else if view is UITextField {
					view.becomeFirstResponder()
				} else {
					UIAccessibility.post(notification: .layoutChanged, argument: view)
				}
			case let .state(cell, value):
				guard let layout else { continue }
				assignment = try layout.next(from: assignment, cell: cell, value: value)
				for (id, view) in elements.map({ ($0.key, $0.value as UIView) }) + labels.map({ ($0.key, $0.value as UIView) }) {
					if let style = style(of: id) { try paint(view, style, faces: faces) }
				}
			case let .arm(node, index):
				guard let branch = branches[node], let context = contexts[node] else { throw HostError("journal names branch \(node), which is not shown") }
				let container = branch.anchor.superview ?? root
				for id in branch.built { remove(id) }
				var position = (container.subviews.firstIndex(of: branch.anchor) ?? container.subviews.count) + 1
				let built = try index.map { try build("\(templates[node] ?? node)#\($0)", in: container, at: &position, context) } ?? []
				branches[node] = (branch.anchor, index, built)
				settle(container, built: built, context)
			case let .rows(node, keys):
				guard let list = lists[node], let context = contexts[node] else { throw HostError("journal names list \(node), which is not shown") }
				let container = list.anchor.superview ?? root
				var built = list.built
				for key in list.keys where !keys.contains(key) {
					for id in built.removeValue(forKey: key) ?? [] { remove(id) }
				}
				let items = Dictionary(try runtime.rows(of: templates[node] ?? node).map { ($0.key, $0.item) }, uniquingKeysWith: { $1 })
				var position = container.subviews.count
				for key in keys where built[key] == nil {
					guard let item = items[key] else { throw HostError("\(node) has no current row \(key)") }
					built[key] = try buildRow(templates[node] ?? node, key: key, item: item, in: container, at: &position, context)
				}
				position = (container.subviews.firstIndex(of: list.anchor) ?? 0) + 1
				for key in keys {
					for id in built[key] ?? [] {
						guard let view = elements[id] ?? labels[id] else { continue }
						container.insertSubview(view, at: position)
						position += 1
					}
				}
				lists[node] = (list.anchor, keys, built)
				settle(container, built: keys.flatMap { built[$0] ?? [] }, context)
			}
		}
		refreshRelations()
	}

	/// The top layer: a full-screen view above the page and the bars holding the dialog's own view (styled by its CSS, not a
	/// system sheet). VoiceOver treats the page behind as inert, and its escape gesture closes the dialog as a cancel.
	private func present(_ node: String, open: Bool) throws {
		guard let view = elements[node] else { throw HostError("journal names dialog \(node), which is not shown") }
		if open {
			guard topLayer == nil else { throw HostError("a second dialog over \(node) has no top layer yet") }
			guard let screen = root.superview, let home = view.superview, let index = home.subviews.firstIndex(of: view) else {
				throw HostError("dialog \(node) opened before the page was mounted")
			}
			view.removeFromSuperview()
			let layer = TopLayerView()
			let onAction = onAction
			layer.onEscape = { onAction(NativeAction(event: .cancel, host: node)) }
			// Chrome's ::backdrop default, rgba(0, 0, 0, 0.1).
			layer.backgroundColor = UIColor(white: 0, alpha: 0.1)
			layer.accessibilityViewIsModal = true
			layer.translatesAutoresizingMaskIntoConstraints = false
			screen.addSubview(layer)
			view.isHidden = false
			view.backgroundColor = .white
			view.translatesAutoresizingMaskIntoConstraints = false
			layer.addSubview(view)
			let guide = layer.safeAreaLayoutGuide
			NSLayoutConstraint.activate([
				layer.topAnchor.constraint(equalTo: screen.topAnchor),
				layer.bottomAnchor.constraint(equalTo: screen.bottomAnchor),
				layer.leadingAnchor.constraint(equalTo: screen.leadingAnchor),
				layer.trailingAnchor.constraint(equalTo: screen.trailingAnchor),
				// Centred, as the web centres a modal dialog (dialog:modal { inset: 0; margin: auto }) on every platform.
				view.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
				view.centerYAnchor.constraint(equalTo: guide.centerYAnchor),
				view.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -32),
			])
			root.accessibilityElementsHidden = true
			topLayer = (layer, home, index)
			UIAccessibility.post(notification: .screenChanged, argument: view)
		} else {
			guard let top = topLayer else { return }
			view.removeFromSuperview()
			top.layer.removeFromSuperview()
			view.isHidden = true
			view.backgroundColor = .clear
			top.home.insertSubview(view, at: min(top.index, top.home.subviews.count))
			root.accessibilityElementsHidden = false
			if layout == nil { stack(top.home) }
			topLayer = nil
			UIAccessibility.post(notification: .screenChanged, argument: nil)
		}
	}

	/// The text an element shows, in view order: what `aria-labelledby` and `aria-describedby` read from it.
	private func text(within view: UIView) -> String {
		if let label = view as? UILabel { return label.text ?? "" }
		return view.subviews.map { text(within: $0) }.filter { !$0.isEmpty }.joined(separator: " ")
	}

	/// Labels and hints taken from the elements an attribute names by id, kept current after every journal; a `<label for>`
	/// names its control, so VoiceOver reads it there and not a second time on the label.
	private func refreshRelations() {
		for (id, view) in elements {
			let current = attributes[id] ?? [:]
			let named = { (attribute: String) -> String? in
				current[attribute].map { ids in
					ids.split(separator: " ").compactMap { self.elements[String($0)] }.map { self.text(within: $0) }.joined(separator: " ")
				}
			}
			if current["aria-label"] == nil, let label = named("aria-labelledby") { view.accessibilityLabel = label }
			if let hint = named("aria-describedby") { view.accessibilityHint = hint }
			if current["for"].flatMap({ elements[$0] }) != nil { view.accessibilityElementsHidden = true }
		}
	}

	private func style(of id: String) -> ResolvedStyle? {
		guard let layout, let template = templates[id] else { return nil }
		return layout.assignments[assignment][template]
	}

	private func settle(_ container: UIView, built: [String], _ context: Context) {
		if let button = context.button { refreshLabel(of: button) }
		if layout == nil {
			stack(container)
			for id in built { if let view = elements[id] { stackTree(view) } }
		}
	}

	private func buildRow(_ list: String, key: String, item: NativeValue, in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		var row = context
		row.suffix = "@\(key)"
		row.scope.items[list] = item
		return try build(list, in: container, at: &index, row)
	}

	private func anchor(in container: UIView, at index: inout Int) -> UIView {
		let anchor = UIView()
		anchor.isHidden = true
		anchor.isAccessibilityElement = false
		anchors.insert(ObjectIdentifier(anchor))
		container.insertSubview(anchor, at: index)
		index += 1
		return anchor
	}

	/// The view factory: builds one slot list's instances from current values, inserting them into `container` at `index`.
	private func build(_ key: String, in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		var built: [String] = []
		for template in slots[key] ?? [] {
			let node = nodes[template]!
			let id = template + context.suffix
			built.append(id)
			templates[id] = template
			contexts[id] = context
			switch node.kind {
			case let .element(element, staticAttributes, bindings):
				if unimplementedElements.contains(element) { throw HostError("<\(element)> \(id) has no iOS view yet") }
				let view: UIView
				if element == "button" || element == "a" {
					if context.button != nil { throw HostError("<\(element)> \(id) is inside another control") }
					let control = UIButton(type: .custom)
					control.isAccessibilityElement = true
					control.accessibilityTraits = element == "a" ? .link : .button
					view = control
				} else if element == "camera" {
					guard let object = nodes[template]?.object, let device = runtime.payload.objects.first(where: { $0.id == object })?.device else {
						throw HostError("<camera> \(id) shows no device object")
					}
					view = try objectView(object, device)
					if layout == nil {
						view.widthAnchor.constraint(equalToConstant: 240).isActive = true
						view.heightAnchor.constraint(equalToConstant: 180).isActive = true
					}
				} else if element == "audio" {
					if context.button != nil { throw HostError("<audio> \(id) is inside a button") }
					if !(slots[template] ?? []).isEmpty { throw HostError("<audio> \(id)'s children have no iOS view yet") }
					let audio = AudioButton()
					if layout == nil {
						audio.widthAnchor.constraint(equalToConstant: 120).isActive = true
						audio.heightAnchor.constraint(equalToConstant: 44).isActive = true
					}
					view = audio
				} else if element == "img" {
					let image = UIImageView()
					image.contentMode = .scaleAspectFit
					image.isAccessibilityElement = true
					image.accessibilityTraits = .image
					if layout == nil {
						image.widthAnchor.constraint(equalToConstant: 120).isActive = true
						image.heightAnchor.constraint(equalToConstant: 90).isActive = true
					}
					view = image
				} else if element == "input" {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					let field = UITextField()
					field.addAction(UIAction { [weak field] _ in field?.resignFirstResponder() }, for: .editingDidEndOnExit)
					if layout == nil {
						field.borderStyle = .roundedRect
						field.widthAnchor.constraint(equalToConstant: 240).isActive = true
					}
					view = field
				} else {
					view = UIView()
					view.isUserInteractionEnabled = context.button == nil
				}
				var inner = context
				inner.button = (view as? UIButton) ?? context.button
				inner.heading = context.heading || headings.contains(element)
				view.accessibilityIdentifier = id
				elements[id] = view
				if element == "dialog" {
					// A dialog shows nothing until showModal() puts it in the top layer (the UA's dialog:not([open]) { display: none }).
					dialogIds.insert(id)
					view.isHidden = true
				}
				if let style = style(of: id) { try paint(view, style, faces: faces) }
				container.insertSubview(view, at: index)
				index += 1
				try wire(events[template] ?? [], on: view, element: element, id: id, inRow: !context.suffix.isEmpty)
				let boundFor = try bindings.first { $0.name == "for" }.map { try runtime.evaluate($0.value, in: context.scope).text }
				if element == "label", let target = staticAttributes["for"] ?? boundFor {
					// A press on a label activates its control, as a browser does.
					let forward = LabelForward(target: target, onAction: onAction)
					forwards.append(forward)
					view.isUserInteractionEnabled = true
					view.addGestureRecognizer(UITapGestureRecognizer(target: forward, action: #selector(LabelForward.press)))
				}
				var current = staticAttributes
				for binding in bindings where !binding.isProperty {
					current[binding.name] = marklessAttributeValue(binding.name, try runtime.evaluate(binding.value, in: context.scope))
				}
				attributes[id] = current
				if let field = view as? UITextField {
					let bound = bindings.first { $0.isProperty && $0.name == "value" }
					field.text = try bound.map { binding in
						let value = try runtime.evaluate(binding.value, in: context.scope)
						return value == .null ? "" : value.text
					} ?? staticAttributes["value"]
				}
				var childIndex = 0
				_ = try build(template, in: view, at: &childIndex, inner)
				applyAttributes(id, view)
				// The stacking layout sizes a control by its text; one with none (a switch's thumb) gets the 44 pt touch target.
				if layout == nil, view is UIButton, text(within: view).isEmpty {
					view.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
					view.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
				}
			case let .text(parts):
				let label = UILabel()
				label.isUserInteractionEnabled = false
				label.numberOfLines = 0
				label.accessibilityIdentifier = id
				label.text = try runtime.text(of: parts, in: context.scope)
				if context.button != nil {
					label.isAccessibilityElement = false
				} else if context.heading {
					label.accessibilityTraits.insert(.header)
				}
				if let style = style(of: id) { try paint(label, style, faces: faces) }
				labels[id] = label
				container.insertSubview(label, at: index)
				index += 1
				if let button = context.button { refreshLabel(of: button) }
			case .branch:
				if !context.suffix.isEmpty { throw HostError("@if inside a list row (\(id)) has no iOS host support yet") }
				let marker = anchor(in: container, at: &index)
				let arm = try runtime.arm(of: template)
				let armViews = try arm.map { try build("\(template)#\($0)", in: container, at: &index, context) } ?? []
				branches[id] = (marker, arm, armViews)
			case .repeat:
				if !context.suffix.isEmpty { throw HostError("a list inside a list row (\(id)) has no iOS host support yet") }
				let marker = anchor(in: container, at: &index)
				var rows: [String: [String]] = [:]
				var keys: [String] = []
				for row in try runtime.rows(of: template) {
					if rows[row.key] != nil { throw HostError("\(id) has two rows keyed \(row.key)") }
					keys.append(row.key)
					rows[row.key] = try buildRow(template, key: row.key, item: row.item, in: container, at: &index, context)
				}
				lists[id] = (marker, keys, rows)
			case let .sheet(open, snapPoints, dismissible, modal):
				if !context.suffix.isEmpty || context.button != nil { throw HostError("a system sheet inside a list row or a control (\(id)) has no iOS host support") }
				let dismissedBy = (events[template] ?? []).filter { $0.event == .dismiss }
				if dismissible && dismissedBy.isEmpty { throw HostError("system sheet \(id) can be closed by the platform but has no dismiss handler") }
				let onAction = onAction
				let sheet = SystemSheet(snapPoints: snapPoints, dismissible: dismissible, modal: modal) {
					if !dismissedBy.isEmpty { onAction(NativeAction(event: .dismiss, host: id)) }
				}
				sheet.content.accessibilityIdentifier = id
				var childIndex = 0
				_ = try build(template, in: sheet.content, at: &childIndex, Context())
				sheets[id] = sheet
				if try runtime.evaluate(open).isTruthy { sheet.open(from: nil) }
			}
		}
		return built
	}

	private func wire(_ bound: [NativeEvent], on view: UIView, element: String, id: String) throws {
		let onAction = onAction
		for event in bound {
			switch (event.event, view) {
			case let (.activate, control as UIButton):
				control.addAction(UIAction { _ in onAction(NativeAction(event: .activate, host: id)) }, for: .touchUpInside)
			case (.activate, _) where !(view is UITextField):
				// An element that is not a button (a list row): a tap anywhere in it, its text included, presses it.
				view.isUserInteractionEnabled = true
				view.addGestureRecognizer(ActivateGesture { onAction(NativeAction(event: .activate, host: id)) })
			case let (.input, field as UITextField):
				field.addAction(
					UIAction { [weak field] _ in onAction(NativeAction(event: .input, host: id, value: field?.text ?? "")) },
					for: .editingChanged)
			default:
				throw HostError("\(event.event.rawValue) on <\(element)> \(id) has no iOS control event yet")
			}
		}
	}

	private func remove(_ id: String) {
		if let branch = branches.removeValue(forKey: id) {
			for inner in branch.built { remove(inner) }
			anchors.remove(ObjectIdentifier(branch.anchor))
			branch.anchor.removeFromSuperview()
		} else if let list = lists.removeValue(forKey: id) {
			for inner in list.built.values.joined() { remove(inner) }
			anchors.remove(ObjectIdentifier(list.anchor))
			list.anchor.removeFromSuperview()
		} else if let template = templates[id] {
			let suffix = String(id.dropFirst(template.count))
			for child in slots[template] ?? [] { remove(child + suffix) }
		}
		labels.removeValue(forKey: id)?.removeFromSuperview()
		if let view = elements.removeValue(forKey: id) {
			stackConstraints.removeValue(forKey: ObjectIdentifier(view))
			view.removeFromSuperview()
		}
		contexts.removeValue(forKey: id)
		templates.removeValue(forKey: id)
		attributes.removeValue(forKey: id)
	}

	/// Static and bound attributes as platform state; `class` reaches views only through the style export.
	private func applyAttributes(_ id: String, _ view: UIView) {
		let current = attributes[id] ?? [:]
		if let audio = view as? AudioButton {
			audio.isHidden = current["controls"] == nil
			audio.update(source: current["src"], label: current["aria-label"])
		} else if let button = view as? UIButton {
			button.isEnabled = current["disabled"] == nil
			if button.isEnabled { button.accessibilityTraits.remove(.notEnabled) } else { button.accessibilityTraits.insert(.notEnabled) }
			refreshLabel(of: button)
		} else if let image = view as? UIImageView {
			image.accessibilityLabel = current["aria-label"] ?? current["alt"]
			image.image = current["src"].flatMap { URL(string: $0) }.flatMap { $0.isFileURL ? UIImage(contentsOfFile: $0.path) : nil }
		} else {
			view.accessibilityLabel = current["aria-label"]
		}
		if current["role"] == "switch" {
			if #available(iOS 17.0, *) { view.accessibilityTraits.insert(.toggleButton) }
			view.accessibilityValue = current["aria-checked"] == "true" ? "1" : "0"
			return
		}
		if current["aria-pressed"] == "true" || current["aria-selected"] == "true" {
			view.accessibilityTraits.insert(.selected)
		} else {
			view.accessibilityTraits.remove(.selected)
		}
		view.accessibilityValue = current["aria-expanded"].map { $0 == "true" ? "expanded" : "collapsed" }
		view.accessibilityElementsHidden = current["aria-hidden"] == "true"
		// With a style export Dragon decides visibility (a hidden element has no frame); the stacking layout reads `hidden`.
		if layout == nil, !dialogIds.contains(id) {
			let hidden = current["hidden"] != nil
			if view.isHidden != hidden {
				view.isHidden = hidden
				if let parent = view.superview, !(parent is UIButton) { stack(parent) }
			}
		}
	}

	/// A button reads as its `aria-label`, or else its text in view order.
	private func refreshLabel(of button: UIButton) {
		if let id = button.accessibilityIdentifier, let label = attributes[id]?["aria-label"] {
			button.accessibilityLabel = label
			return
		}
		func texts(_ view: UIView) -> [String] {
			view.subviews.flatMap { child -> [String] in
				if let label = child as? UILabel { return [label.text ?? ""] }
				return texts(child)
			}
		}
		button.accessibilityLabel = texts(button).joined()
	}

	private func stackTree(_ view: UIView) {
		guard !(view is UILabel || view is UITextField || view is AudioButton) else { return }
		stack(view)
		for child in view.subviews where !anchors.contains(ObjectIdentifier(child)) { stackTree(child) }
	}

	/// The temporary layout for rungs without Dragon: children top to bottom, start-aligned.
	private func stack(_ container: UIView) {
		NSLayoutConstraint.deactivate(stackConstraints[ObjectIdentifier(container)] ?? [])
		var constraints: [NSLayoutConstraint] = []
		var above = container.topAnchor
		for child in container.subviews where !anchors.contains(ObjectIdentifier(child)) && !child.isHidden {
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

/// `<audio controls>`: a button reading "Play", or "Pause" while its file plays.
@MainActor
final class AudioButton: UIButton, AVAudioPlayerDelegate {
	private var player: AVAudioPlayer?
	private var source: String?
	private var label: String?

	init() {
		super.init(frame: .zero)
		configuration = .plain()
		isAccessibilityElement = true
		accessibilityTraits = .button
		addAction(UIAction { [weak self] _ in self?.toggle() }, for: .touchUpInside)
		refresh()
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("AudioButton is made in code") }

	/// A new `src` replaces the player; `label` (`aria-label`) is read instead of the title.
	func update(source: String?, label: String?) {
		self.label = label
		if source != self.source {
			self.source = source
			player?.stop()
			player = nil
		}
		refresh()
	}

	private func toggle() {
		if let player, player.isPlaying {
			player.pause()
		} else {
			if player == nil, let url = source.flatMap(URL.init(string:)) {
				player = try? AVAudioPlayer(contentsOf: url)
				player?.delegate = self
			}
			player?.play()
		}
		refresh()
	}

	private func refresh() {
		let title = player?.isPlaying == true ? "Pause" : "Play"
		configuration?.title = title
		accessibilityLabel = label ?? title
	}

	nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
		Task { @MainActor in self.refresh() }
	}
}

/// The top layer's view: VoiceOver's escape gesture (two-finger scrub) on it closes the dialog.
final class TopLayerView: UIView {
	var onEscape: (() -> Void)?
	override func accessibilityPerformEscape() -> Bool {
		onEscape?()
		return onEscape != nil
	}
}

/// Sends a label's tap to the control its `for` names.
@MainActor
final class LabelForward: NSObject {
	private let target: String
	private let onAction: (NativeAction) -> Void
	init(target: String, onAction: @escaping (NativeAction) -> Void) {
		self.target = target
		self.onAction = onAction
	}
	@objc func press() { onAction(NativeAction(event: .activate, host: target)) }
}

/// A tap or drag outside a field puts the keyboard away, as a scrolling screen does.
@MainActor
final class KeyboardDismisser: NSObject {
	private weak var root: UIView?
	init(_ root: UIView) { self.root = root }
	@objc func dismiss() { root?.endEditing(true) }
}

@MainActor
private func paint(_ view: UIView, _ style: ResolvedStyle, faces: [String: UIFontDescriptor]) throws {
	// Dragon gives an element it does not render (`display: none`, `[hidden]`) no frame.
	guard let frame = style.frame else {
		view.isHidden = true
		return
	}
	view.isHidden = false
	view.frame = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
	view.backgroundColor = style.background.map(uiColor) ?? .clear
	view.layer.borderWidth = style.borderWidth
	view.layer.borderColor = style.borderColor.map(uiColor)?.cgColor
	view.layer.cornerRadius = style.cornerRadius
	paintSides(view, style.sides)
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
/// One sublayer per side, for borders whose sides differ; Chrome's diagonal corner joins are not drawn.
private func paintSides(_ view: UIView, _ sides: [ResolvedStyle.Side]?) {
	let name = "markless-border-side"
	view.layer.sublayers?.filter { $0.name == name }.forEach { $0.removeFromSuperlayer() }
	guard let sides else { return }
	let b = view.bounds
	let rects = [
		CGRect(x: 0, y: 0, width: b.width, height: sides[0].width),
		CGRect(x: b.width - sides[1].width, y: 0, width: sides[1].width, height: b.height),
		CGRect(x: 0, y: b.height - sides[2].width, width: b.width, height: sides[2].width),
		CGRect(x: 0, y: 0, width: sides[3].width, height: b.height),
	]
	for (side, rect) in zip(sides, rects) where side.width > 0 {
		let layer = CALayer()
		layer.name = name
		layer.frame = rect
		layer.backgroundColor = uiColor(side.color).cgColor
		view.layer.addSublayer(layer)
	}
}

/// A tap that presses an element which is not a button.
private final class ActivateGesture: UITapGestureRecognizer {
	private let action: () -> Void
	init(_ action: @escaping () -> Void) {
		self.action = action
		super.init(target: nil, action: nil)
		addTarget(self, action: #selector(fire))
	}
	@objc private func fire() { if state == .ended { action() } }
}
#endif

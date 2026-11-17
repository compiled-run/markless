#if canImport(UIKit)
import MarklessCore
import UIKit

private let headings: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
private let unimplementedElements: Set<String> = [
	"a", "audio", "canvas", "details", "dialog", "embed", "form", "iframe", "img", "input", "label", "object", "option",
	"picture", "select", "summary", "svg", "textarea", "video",
]

/// The retained views of one payload: built once by the view factory, then changed only by `apply(_:)`.
@MainActor
final class ViewTree {
	private let layout: StyleLayout?
	private var outermost: [UIView] = []
	private var elements: [String: UIView] = [:]
	private var labels: [String: UILabel] = [:]
	private var buttonOfLabel: [String: UIButton] = [:]
	private var labelsOfButton: [ObjectIdentifier: [UILabel]] = [:]

	init(
		payload: NativeViewPayload, texts: [(node: String, text: String)], layout: StyleLayout?,
		faces: [String: UIFontDescriptor], onAction: @escaping (NativeAction) -> Void
	) throws {
		self.layout = layout
		let initial = Dictionary(uniqueKeysWithValues: texts.map { ($0.node, $0.text) })
		var wrapper: UIView?
		for (id, style) in layout?.wrappers ?? [] {
			let box = UIView()
			box.accessibilityIdentifier = id
			try paint(box, style, faces: faces)
			if let wrapper { wrapper.addSubview(box) } else { outermost.append(box) }
			wrapper = box
		}
		var headingOf: [String: Bool] = [:]
		var buttonOf: [String: UIButton] = [:]
		for node in payload.nodes {
			let parentView = try node.parent.map { parent in
				guard let view = elements[parent] else { throw HostError("\(node.id)'s parent \(parent) was not built") }
				return view
			}
			let underHeading = node.parent.flatMap { headingOf[$0] } ?? false
			let underButton = node.parent.flatMap { buttonOf[$0] }
			let view: UIView
			switch node {
			case let .element(id, element, _):
				if unimplementedElements.contains(element) { throw HostError("<\(element)> \(id) has no iOS view yet") }
				if element == "button" {
					if underButton != nil { throw HostError("<button> \(id) is inside another button") }
					let button = UIButton(type: .custom)
					button.isAccessibilityElement = true
					button.accessibilityTraits = .button
					labelsOfButton[ObjectIdentifier(button)] = []
					buttonOf[id] = button
					view = button
				} else {
					view = UIView()
					buttonOf[id] = underButton
				}
				view.isUserInteractionEnabled = element == "button" || underButton == nil
				headingOf[id] = underHeading || headings.contains(element)
				view.accessibilityIdentifier = id
				elements[id] = view
			case let .text(id, _, _):
				let label = UILabel()
				label.isUserInteractionEnabled = false
				label.numberOfLines = 0
				label.accessibilityIdentifier = id
				label.text = initial[id]
				if let button = underButton {
					label.isAccessibilityElement = false
					buttonOfLabel[id] = button
					labelsOfButton[ObjectIdentifier(button)]?.append(label)
				} else if underHeading {
					label.accessibilityTraits.insert(.header)
				}
				if layout == nil, underButton != nil { label.textColor = .tintColor }
				labels[id] = label
				view = label
			}
			if let style = layout?.styles[node.id] { try paint(view, style, faces: faces) }
			if let parentView { parentView.addSubview(view) } else if let wrapper { wrapper.addSubview(view) } else { outermost.append(view) }
		}
		for button in buttonOfLabel.values { refreshLabel(of: button) }
		for event in payload.events {
			guard let button = elements[event.host] as? UIButton else {
				throw HostError("\(event.event.rawValue) on \(event.host): only <button> is activatable on iOS yet")
			}
			let action = NativeAction(event: event.event, host: event.host)
			button.addAction(UIAction { _ in onAction(action) }, for: .touchUpInside)
		}
		if layout == nil { for view in outermost { stackChildren(of: view) } }
	}

	func mount(in screen: UIView) {
		let guide = layout == nil ? screen.layoutMarginsGuide : screen.safeAreaLayoutGuide
		let content = UIView()
		content.translatesAutoresizingMaskIntoConstraints = false
		screen.addSubview(content)
		NSLayoutConstraint.activate([
			content.topAnchor.constraint(equalTo: guide.topAnchor),
			content.leadingAnchor.constraint(equalTo: guide.leadingAnchor),
			content.trailingAnchor.constraint(equalTo: guide.trailingAnchor),
		])
		if let layout {
			content.heightAnchor.constraint(equalToConstant: layout.viewport.height).isActive = true
			for view in outermost { content.addSubview(view) }
		} else {
			stack(outermost, in: content)
		}
	}

	/// The journal applier: the only code that changes a retained view after the first build.
	func apply(_ journal: [NativeJournalEntry]) throws {
		for entry in journal {
			switch entry {
			case let .text(node, value):
				guard let label = labels[node] else { throw HostError("journal names unknown text node \(node)") }
				label.text = value
				if let button = buttonOfLabel[node] { refreshLabel(of: button) }
			}
		}
	}

	private func refreshLabel(of button: UIButton) {
		button.accessibilityLabel = (labelsOfButton[ObjectIdentifier(button)] ?? []).compactMap(\.text).joined()
	}

	private func stackChildren(of view: UIView) {
		let children = view.subviews
		stack(children, in: view)
		for child in children where !(child is UILabel) { stackChildren(of: child) }
	}
}

/// The temporary layout for rungs without Dragon: children top to bottom, start-aligned.
@MainActor
private func stack(_ children: [UIView], in container: UIView) {
	var above: NSLayoutYAxisAnchor = container.topAnchor
	for child in children {
		if child.superview !== container { container.addSubview(child) }
		child.translatesAutoresizingMaskIntoConstraints = false
		NSLayoutConstraint.activate([
			child.topAnchor.constraint(equalTo: above),
			child.leadingAnchor.constraint(equalTo: container.leadingAnchor),
			child.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor),
		])
		above = child.bottomAnchor
	}
	above.constraint(equalTo: container.bottomAnchor).isActive = true
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

#if canImport(UIKit)
import AVFoundation
import MarklessCore
import UIKit
import UIKit.UIGestureRecognizerSubclass

private let headings: Set<String> = ["h1", "h2", "h3", "h4", "h5", "h6"]
private let unimplementedElements: Set<String> = [
	"canvas", "details", "embed", "iframe", "object", "option",
	"picture", "select", "summary", "textarea", "video",
]

/// Where an instance is built: its row (`@key`, empty outside lists), the names its expressions see, and what encloses it.
private struct Context {
	var suffix = ""
	var scope = NativeScope.empty
	var button: UIButton?
	var heading = false
	/// The text look the browser's default stylesheet gives what is inside (bold headings, monospace `<pre>`).
	var look = TextLook()
}

/// Text properties a block's or a phrase element's default style passes to the text inside it.
struct TextLook: Equatable {
	var bold = false
	var italic = false
	var monospace = false
	var scale: CGFloat = 1
	var line: String?
	var shift: String?
	var highlight = false
	var preformatted = false

	func applying(_ style: NativeDefaultStyle?) -> TextLook {
		guard let style else { return self }
		var next = self
		next.bold = bold || style.bold
		next.italic = italic || style.italic
		next.monospace = monospace || style.monospace
		next.scale = scale * CGFloat(style.size ?? 1)
		next.line = style.line ?? line
		next.shift = style.shift ?? shift
		next.highlight = highlight || style.highlight
		next.preformatted = preformatted || style.preformatted
		return next
	}

	/// The label font size the stacking layout starts from (UILabel's own).
	static let baseSize: CGFloat = 17

	var attributes: [NSAttributedString.Key: Any] {
		let size = TextLook.baseSize * scale
		var font = monospace
			? UIFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
			: UIFont.systemFont(ofSize: size, weight: bold ? .bold : .regular)
		if italic, let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(.traitItalic)) {
			font = UIFont(descriptor: descriptor, size: size)
		}
		var attributes: [NSAttributedString.Key: Any] = [.font: font]
		if line == "underline" { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
		if line == "line-through" { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
		if shift == "super" { attributes[.baselineOffset] = TextLook.baseSize * 0.33 }
		if shift == "sub" { attributes[.baselineOffset] = -TextLook.baseSize * 0.2 }
		if highlight {
			attributes[.backgroundColor] = UIColor.yellow
			attributes[.foregroundColor] = UIColor.black
		}
		return attributes
	}
}

/// One paragraph of the stacking layout: a run of text nodes and phrase elements shown as one label.
@MainActor
final class Paragraph {
	/// The run's templates, in order.
	let nodes: [String]
	/// The row suffix of this instance (`@key`, or empty).
	let suffix: String
	let look: TextLook
	let label: UILabel
	/// The label, or the sideways scroller around it for preformatted text.
	let view: UIView
	init(nodes: [String], suffix: String, look: TextLook, label: UILabel, view: UIView) {
		self.nodes = nodes
		self.suffix = suffix
		self.look = look
		self.label = label
		self.view = view
	}
}

/// A `<pre>` paragraph's sideways scroller: its line is never wrapped.
final class PreformattedScroll: UIScrollView {}

/// An inline `<svg>`: draws the shapes compiled when the app was built, fitted into its box as the web fits the viewBox.
final class DrawingView: UIView {
	let drawing: NativeDrawing
	var currentColor: UIColor = .black { didSet { setNeedsDisplay() } }

	init(_ drawing: NativeDrawing) {
		self.drawing = drawing
		super.init(frame: .zero)
		isOpaque = false
		backgroundColor = .clear
		contentMode = .redraw
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("DrawingView is made in code") }

	override func draw(_ rect: CGRect) {
		guard let context = UIGraphicsGetCurrentContext() else { return }
		if let box = drawing.viewBox?.map({ CGFloat($0) }), box[2] > 0, box[3] > 0 {
			// SVG 2 xMidYMid meet: one scale that fits both axes, the rest centred.
			let scale = min(bounds.width / box[2], bounds.height / box[3])
			context.translateBy(x: -box[0] * scale + (bounds.width - box[2] * scale) / 2, y: -box[1] * scale + (bounds.height - box[3] * scale) / 2)
			context.scaleBy(x: scale, y: scale)
		}
		for shape in drawing.shapes {
			let path = CGMutablePath()
			var i = 0
			let p = shape.path
			while i < p.count {
				switch Int(p[i]) {
				case 0: path.move(to: CGPoint(x: p[i + 1], y: p[i + 2])); i += 3
				case 1: path.addLine(to: CGPoint(x: p[i + 1], y: p[i + 2])); i += 3
				case 3:
					path.addCurve(to: CGPoint(x: p[i + 5], y: p[i + 6]), control1: CGPoint(x: p[i + 1], y: p[i + 2]), control2: CGPoint(x: p[i + 3], y: p[i + 4]))
					i += 7
				case 4: path.closeSubpath(); i += 1
				default: i = p.count
				}
			}
			context.saveGState()
			if let t = shape.transform { context.concatenate(CGAffineTransform(a: t[0], b: t[1], c: t[2], d: t[3], tx: t[4], ty: t[5])) }
			if let fill = shape.fill {
				context.addPath(path)
				context.setFillColor(color(fill).cgColor)
				context.fillPath(using: shape.evenOdd ? .evenOdd : .winding)
			}
			if let stroke = shape.stroke, shape.width > 0 {
				context.addPath(path)
				context.setStrokeColor(color(stroke).cgColor)
				context.setLineWidth(shape.width)
				context.setLineCap(shape.cap == "round" ? .round : shape.cap == "square" ? .square : .butt)
				context.setLineJoin(shape.join == "round" ? .round : shape.join == "bevel" ? .bevel : .miter)
				context.setMiterLimit(shape.miterLimit)
				context.strokePath()
			}
			context.restoreGState()
		}
	}

	private func color(_ paint: NativeShape.Paint) -> UIColor {
		switch paint {
		case .currentColor: currentColor
		case let .color(c): UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: c.alpha / 255)
		}
	}
}

/// The retained views of one payload: built by the view factory, then changed only by `apply(_:)`.
@MainActor
final class ViewTree {
	let root = UIView()
	/// The page's own scroll view, as a browser's viewport: it fills the screen, insets its content by the safe areas and
	/// scrolls it under the bars.
	let page = UIScrollView()
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
	private let bodyLayer = CALayer()
	/// Each styled sheet's layout per resting height, the height it rests at, and each height's current assignment.
	private var sheetStyles: [String: (heights: [(snapPoint: Double, layout: StyleLayout)], height: Int, assignments: [Int])] = [:]
	/// The sheet each node inside a system sheet belongs to.
	private let sheetOf: [String: String]
	/// A tap on the page dismisses the keyboard; a stack makes it wait for its edge-swipe Back.
	let dismissGestures: [UIGestureRecognizer] = [UITapGestureRecognizer()]
	private var stackConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var forwards: [LabelForward] = []
	private var dialogIds = Set<String>()
	/// The stacking layout's paragraphs, by each text node and phrase element instance in them.
	private var paragraphs: [String: Paragraph] = [:]
	/// The current text of each text node instance shown in a paragraph.
	private var paragraphTexts: [String: String] = [:]
	/// Phrase element instances, which flow in a paragraph and have no view.
	private var flowing = Set<String>()
	/// Views the stacking layout sizes itself or never stacks into (a rule, a drawing, a list marker).
	private var leaves = Set<ObjectIdentifier>()
	/// Views stacked across their container's whole width.
	private var fullWidth = Set<ObjectIdentifier>()
	/// Start-side insets of blocks, in points.
	private var indents: [ObjectIdentifier: CGFloat] = [:]
	/// Lists and the marker kind their items show; each item's marker label.
	private var listMarkers: [ObjectIdentifier: String] = [:]
	private var itemMarkers: [ObjectIdentifier: UILabel] = [:]
	/// Table structure: tables, their rows and the rows' cells.
	private var tables = Set<ObjectIdentifier>()
	private var tableRows = Set<ObjectIdentifier>()
	private var tableCells = Set<ObjectIdentifier>()
	private var columnConstraints: [ObjectIdentifier: [NSLayoutConstraint]] = [:]
	private var tableViews: [ObjectIdentifier: UIView] = [:]
	/// Views a container holds that the stacking layout does not place (a list marker, a rule's line).
	private var decorations = Set<ObjectIdentifier>()
	/// The open dialog's top layer and the place in the page its view returns to.
	private var topLayer: (layer: TopLayerView, home: UIView, index: Int)?
	/// The scroll view each scroll container hosts its children in.
	private var scrollViews: [String: ContainerScrollView] = [:]
	/// What a stopped submit says, shown until the person's next action.
	private var message: UILabel?
	private var touches: TouchWatcher?
	/// Each drawn checkbox (false) or radio button (true) and whether it is checked.
	private var ticks: [String: (radio: Bool, checked: Bool)] = [:]

	init(
		runtime: NativeRuntime, layout: StyleLayout?, sheetLayouts: [String: [(snapPoint: Double, layout: StyleLayout)]] = [:],
		faces: [String: UIFontDescriptor], onAction: @escaping (NativeAction) -> Void,
		objectView: @escaping (_ object: String, _ device: String) throws -> UIView = { object, _ in throw HostError("no device to show \(object)") }
	) throws {
		self.runtime = runtime
		self.objectView = objectView
		self.layout = layout
		self.faces = faces
		self.onAction = onAction
		keyboard = KeyboardDismisser(page)
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
		var sheetOf: [String: String] = [:]
		for node in payload.nodes {
			guard let parent = node.parent else { continue }
			if case .sheet = nodes[parent]?.kind { sheetOf[node.id] = parent } else if let sheet = sheetOf[parent] { sheetOf[node.id] = sheet }
		}
		self.sheetOf = sheetOf
		sheetStyles = sheetLayouts.mapValues { heights in (heights, 0, heights.map(\.layout.start)) }
		events = Dictionary(grouping: payload.events, by: \.host)
		page.contentInsetAdjustmentBehavior = .always
		page.accessibilityIdentifier = "markless-page"
		page.addSubview(root)
		var index = 0
		_ = try build("", in: root, at: &index, Context())
		// A tap outside a field blurs it, as on the web; a drag scrolls and keeps the keyboard up.
		for gesture in dismissGestures {
			gesture.cancelsTouchesInView = false
			gesture.addTarget(keyboard, action: #selector(KeyboardDismisser.dismiss))
			page.addGestureRecognizer(gesture)
		}
		if layout == nil {
			stackTree(root)
			for sheet in sheets.values { stackTree(sheet.content) }
			alignTables()
		} else {
			try sizePage()
		}
		refreshRelations()
		if layout != nil {
			root.layer.insertSublayer(bodyLayer, at: 0)
			paintBody()
		}
	}

	/// Whether any of `view`'s box is inside `frame` (in `screen`'s space): an IntersectionObserver with no threshold, where a
	/// hidden view or one under a hidden ancestor has no box, and an edge touching the frame counts.
	func isOnScreen(_ view: UIView, within frame: CGRect, of screen: UIView) -> Bool {
		var at: UIView? = view
		while let current = at, current !== screen {
			if current.isHidden { return false }
			at = current.superview
		}
		guard at === screen else { return false }
		let box = view.convert(view.bounds, to: screen)
		return box.minX <= frame.maxX && box.maxX >= frame.minX && box.minY <= frame.maxY && box.maxY >= frame.minY
	}

	func pageAppeared(_ host: UIViewController) {
		for sheet in sheets.values { sheet.hostAppeared(host) }
	}

	/// Before the page is rebuilt: its sheets go with it, without a `dismiss` action.
	func closeSheets() {
		for sheet in sheets.values { sheet.close(animated: false) }
	}

	/// The page's scrollable size: Dragon's page range over the viewport it laid out at.
	private func sizePage() throws {
		guard let layout else { return }
		let viewport = layout.viewport
		let range = layout.pageScrolls[assignment]
		page.contentSize = CGSize(width: viewport.width + (range?.maxX ?? 0), height: viewport.height + (range?.maxY ?? 0))
		root.frame = CGRect(origin: .zero, size: page.contentSize)
		guard range == nil else { return }
		let drawn = root.subviews.reduce(CGRect.null) { $0.union($1.frame) }
		if drawn.maxX > viewport.width + 0.5 || drawn.maxY > viewport.height + 0.5 {
			throw HostError("the page is \(drawn.maxY) points tall on a \(viewport.height) point screen, and Dragon does not decide its scroll range: \(layout.pageScrollUndecided ?? "the style export has no page range")")
		}
	}

	func mount(in screen: UIView) {
		page.translatesAutoresizingMaskIntoConstraints = false
		screen.addSubview(page)
		screen.keyboardLayoutGuide.usesBottomSafeArea = false
		NSLayoutConstraint.activate([
			page.topAnchor.constraint(equalTo: screen.topAnchor),
			page.leadingAnchor.constraint(equalTo: screen.leadingAnchor),
			page.trailingAnchor.constraint(equalTo: screen.trailingAnchor),
			page.bottomAnchor.constraint(equalTo: screen.keyboardLayoutGuide.topAnchor),
		])
		let watcher = TouchWatcher { [weak self] in self?.dismissMessage() }
		screen.addGestureRecognizer(watcher)
		touches = watcher
		guard layout == nil else { return }
		root.translatesAutoresizingMaskIntoConstraints = false
		let content = page.contentLayoutGuide
		NSLayoutConstraint.activate([
			root.topAnchor.constraint(equalTo: content.topAnchor),
			root.bottomAnchor.constraint(equalTo: content.bottomAnchor),
			root.leadingAnchor.constraint(equalTo: screen.layoutMarginsGuide.leadingAnchor),
			root.trailingAnchor.constraint(equalTo: screen.layoutMarginsGuide.trailingAnchor),
			content.leadingAnchor.constraint(equalTo: page.frameLayoutGuide.leadingAnchor),
			content.widthAnchor.constraint(equalTo: page.frameLayoutGuide.widthAnchor),
		])
	}

	func unmount() {
		dismissMessage()
		if let touches { touches.view?.removeGestureRecognizer(touches) }
		touches = nil
		closeSheets()
		page.removeFromSuperview()
	}

	func dismissMessage() {
		message?.removeFromSuperview()
		message = nil
	}

	/// A stopped submit's message, pinned under the top of the page (or of the open dialog's top layer) and announced.
	private func show(_ text: String) {
		dismissMessage()
		guard let host = topLayer?.layer ?? page.superview else { return }
		let label = UILabel()
		label.text = text
		label.numberOfLines = 0
		label.textAlignment = .center
		label.textColor = .white
		label.backgroundColor = UIColor(white: 0.15, alpha: 0.92)
		label.layer.cornerRadius = 8
		label.layer.masksToBounds = true
		label.isAccessibilityElement = true
		label.translatesAutoresizingMaskIntoConstraints = false
		host.addSubview(label)
		let guide = host.safeAreaLayoutGuide
		NSLayoutConstraint.activate([
			label.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),
			label.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
			label.widthAnchor.constraint(lessThanOrEqualTo: guide.widthAnchor, constant: -32),
			label.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
		])
		message = label
		UIAccessibility.post(notification: .announcement, argument: text)
	}

	/// The colour behind the page in the current assignment: the export's canvas, else the web canvas's white.
	var canvas: UIColor? { layout.map { $0.canvases[assignment].map(uiColor) ?? .white } }

	/// body's own background, under every view of the page, where the current assignment gives it one.
	private func paintBody() {
		CATransaction.begin()
		CATransaction.setDisableActions(true)
		defer { CATransaction.commit() }
		guard let body = layout?.bodies[assignment] else {
			bodyLayer.isHidden = true
			return
		}
		bodyLayer.zPosition = -1
		bodyLayer.frame = CGRect(x: body.frame.x, y: body.frame.y, width: body.frame.width, height: body.frame.height)
		bodyLayer.backgroundColor = uiColor(body.color).cgColor
		bodyLayer.isHidden = false
	}

	/// Scrolls every scrolling ancestor of `target`, innermost first, as Chrome's scrollIntoView() (`scrollIntoViewAlign`) or
	/// focus() (`focusIntoViewAlign`) does.
	func bringIntoView(_ target: UIView, block: ScrollAlign, inline: ScrollAlign) {
		page.layoutIfNeeded()
		var chain: [UIScrollView] = []
		var ancestor = target.superview
		while let view = ancestor {
			if let scroll = view as? UIScrollView { chain.append(scroll) }
			ancestor = view.superview
		}
		guard let inner = chain.first else { return }
		let boxes = chain.enumerated().map { index, scroll -> ScrollBox in
			let inset = scroll.adjustedContentInset
			let width = scroll.bounds.width - inset.left - inset.right
			let height = scroll.bounds.height - inset.top - inset.bottom
			let origin = index + 1 < chain.count ? scroll.superview!.convert(scroll.frame.origin, to: chain[index + 1]) : scroll.frame.origin
			return ScrollBox(
				port: ScrollRect(x: origin.x + inset.left, y: origin.y + inset.top, width: width, height: height),
				offset: (scroll.contentOffset.x + inset.left, scroll.contentOffset.y + inset.top),
				range: ScrollOffsetRange(minX: 0, maxX: max(0, scroll.contentSize.width - width), minY: 0, maxY: max(0, scroll.contentSize.height - height)))
		}
		let shown = target.convert(target.bounds, to: inner)
		let offsets = scrollIntoView(
			boxes, target: ScrollRect(x: shown.minX, y: shown.minY, width: shown.width, height: shown.height), block: block, inline: inline)
		for (scroll, offset) in zip(chain, offsets) {
			let inset = scroll.adjustedContentInset
			scroll.setContentOffset(CGPoint(x: offset.x - inset.left, y: offset.y - inset.top), animated: false)
		}
	}

	/// The focused text field in this page, if any.
	var focusedField: UITextField? { elements.values.lazy.compactMap { $0 as? UITextField }.first { $0.isFirstResponder } }

	/// The journal applier: the only code that changes a retained view after the first build.
	func apply(_ journal: [NativeJournalEntry]) throws {
		for entry in journal {
			switch entry {
			case let .text(node, value):
				if let paragraph = paragraphs[node] {
					paragraphTexts[node] = value
					try render(paragraph)
					if let button = contexts[node]?.button { refreshLabel(of: button) }
					continue
				}
				guard let label = labels[node] else { throw HostError("journal names text node \(node), which is not shown") }
				label.text = value
				if let button = contexts[node]?.button { refreshLabel(of: button) }
			case let .checked(node, checked):
				if elements[node] is AbsentField { continue }
				guard let tick = ticks[node], let view = elements[node] else { throw HostError("journal names checkbox \(node), which is not shown") }
				ticks[node] = (tick.radio, checked)
				drawTick(node, view)
			case let .property(node, _, value):
				if elements[node] is AbsentField { continue }
				guard let field = elements[node] as? UITextField else { throw HostError("journal names input \(node), which is not a shown field") }
				field.text = value
			case let .attribute(node, name, value):
				if flowing.contains(node) {
					attributes[node, default: [:]][name] = value
					continue
				}
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
				// As on the web: scrollIntoView aligns the element to the start; focus brings it into view unless told not to.
				if command == "scrollIntoView" {
					bringIntoView(view, block: scrollIntoViewAlign.block, inline: scrollIntoViewAlign.inline)
					break
				}
				if !preventScroll { bringIntoView(view, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline) }
				if view is UITextField {
					view.becomeFirstResponder()
				} else {
					UIAccessibility.post(notification: .layoutChanged, argument: view)
				}
			case let .invalid(node, text):
				guard let view = elements[node] else { throw HostError("journal names field \(node), which is not shown") }
				if let field = view as? UITextField {
					root.layoutIfNeeded()
					bringIntoView(field, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
					field.becomeFirstResponder()
				}
				show(text)
			case let .timer(timer, ms):
				Task { @MainActor [weak self] in
					try? await Task.sleep(for: .milliseconds(ms))
					// A page left since (or never mounted) has no runtime holding this timer any more.
					guard let self, self.root.superview != nil else { return }
					self.onAction(NativeAction(event: .timer, timer: timer))
				}
			case let .state(cell, value):
				if let layout, cell != StyleBands.state || layout.stateCells.contains(cell) {
					assignment = try layout.next(from: assignment, cell: cell, value: value)
				}
				for (sheet, styles) in sheetStyles {
					var moved = styles
					for (index, height) in styles.heights.enumerated() where height.layout.stateCells.contains(cell) {
						moved.assignments[index] = try height.layout.next(from: styles.assignments[index], cell: cell, value: value)
					}
					sheetStyles[sheet] = moved
				}
				try repaint { _ in true }
				paintBody()
				try sizePage()
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
				var placed = Set<ObjectIdentifier>()
				for key in keys {
					for id in built[key] ?? [] {
						guard let view = paragraphs[id]?.view ?? elements[id] ?? labels[id], placed.insert(ObjectIdentifier(view)).inserted else { continue }
						container.insertSubview(view, at: position)
						position += 1
					}
				}
				lists[node] = (list.anchor, keys, built)
				settle(container, built: keys.flatMap { built[$0] ?? [] }, context)
			}
		}
		refreshRelations()
		if layout == nil { alignTables() }
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

	/// Paints a view and puts it at its frame; inside a scroll container, frames count from the scroll view's padding box.
	private func place(_ id: String, _ view: UIView, _ style: ResolvedStyle) throws {
		try paint(view, style, faces: faces)
		if let host = view.superview as? ContainerScrollView { view.frame.origin = CGPoint(x: view.frame.minX - host.inset.left, y: view.frame.minY - host.inset.top) }
		guard let scroll = scrollViews[id] else {
			if style.scroll != nil { throw HostError("\(id) became a scroll container after it was built") }
			return
		}
		guard let s = style.scroll else { throw HostError("\(id) stopped being a scroll container after it was built") }
		scroll.configure(s, in: view.bounds.size, cornerRadius: style.cornerRadius)
	}

	private func style(of id: String) -> ResolvedStyle? {
		guard let template = templates[id] else { return nil }
		if let sheet = sheetOf[template] {
			guard let styles = sheetStyles[sheet] else { return nil }
			return styles.heights[styles.height].layout.assignments[styles.assignments[styles.height]][template]
		}
		return layout?.assignments[assignment][template]
	}

	private func repaint(where included: (String) -> Bool) throws {
		for (id, view) in elements.map({ ($0.key, $0.value as UIView) }) + labels.map({ ($0.key, $0.value as UIView) }) where included(id) {
			if let style = style(of: id) { try place(id, view, style) }
		}
	}

	/// The sheet came to rest at another height: its content takes that height's layout.
	private func sheetRested(_ sheet: String, at snapPoint: Double) throws {
		guard var styles = sheetStyles[sheet], let height = styles.heights.firstIndex(where: { $0.snapPoint == snapPoint }) else { return }
		guard height != styles.height else { return }
		styles.height = height
		sheetStyles[sheet] = styles
		try repaint { id in templates[id].flatMap { sheetOf[$0] } == sheet }
	}

	/// A styled sheet's content area at a resting height, and the size its document takes there.
	private func sheetArea(_ sheet: String, at snapPoint: Double) -> (viewport: CGSize, content: CGSize)? {
		guard let styles = sheetStyles[sheet], let index = styles.heights.firstIndex(where: { $0.snapPoint == snapPoint }) else { return nil }
		let layout = styles.heights[index].layout
		let extent = layout.extents[styles.assignments[index]]
		return (
			CGSize(width: layout.viewport.width, height: layout.viewport.height),
			CGSize(width: layout.viewport.width, height: max(layout.viewport.height, extent)))
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
		row.scope.keys[list] = key
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
		let slot = slots[key] ?? []
		var position = 0
		while position < slot.count {
			let template = slot[position]
			let node = nodes[template]!
			if layout == nil, node.isText || node.defaultStyle?.flow != nil {
				// A run of text and phrase elements is one paragraph (`nativeParagraphs`).
				var run: [String] = []
				while position < slot.count, let next = nodes[slot[position]], next.isText || next.defaultStyle?.flow != nil {
					run.append(slot[position])
					position += 1
				}
				built += try buildParagraph(run, in: container, at: &index, context)
				continue
			}
			position += 1
			let id = template + context.suffix
			built.append(id)
			templates[id] = template
			contexts[id] = context
			switch node.kind {
			case let .element(element, staticAttributes, bindings):
				if unimplementedElements.contains(element) { throw HostError("<\(element)> \(id) has no iOS view yet") }
				let view: UIView
				if let drawing = node.drawing {
					let drawn = DrawingView(drawing)
					drawn.isUserInteractionEnabled = context.button == nil
					if layout == nil {
						leaves.insert(ObjectIdentifier(drawn))
						let ratio = drawing.viewBox.map { $0[3] / $0[2] }
						let unit = drawing.em ? Double(TextLook.baseSize * context.look.scale) : 1
						switch (drawing.width.map { $0 * unit }, drawing.height.map { $0 * unit }) {
						case let (width?, height?):
							drawn.widthAnchor.constraint(equalToConstant: width).isActive = true
							drawn.heightAnchor.constraint(equalToConstant: height).isActive = true
						case let (width?, nil):
							drawn.widthAnchor.constraint(equalToConstant: width).isActive = true
							drawn.heightAnchor.constraint(equalToConstant: width * (ratio ?? 0.5)).isActive = true
						case let (nil, height?):
							drawn.heightAnchor.constraint(equalToConstant: height).isActive = true
							drawn.widthAnchor.constraint(equalToConstant: height / (ratio ?? 0.5)).isActive = true
						case (nil, nil):
							if let ratio {
								// The web's inline svg without a size: the container's width, the viewBox's ratio.
								fullWidth.insert(ObjectIdentifier(drawn))
								drawn.heightAnchor.constraint(equalTo: drawn.widthAnchor, multiplier: ratio).isActive = true
							} else {
								drawn.widthAnchor.constraint(equalToConstant: 300).isActive = true
								drawn.heightAnchor.constraint(equalToConstant: 150).isActive = true
							}
						}
					}
					view = drawn
				} else if element == "button" || element == "a" {
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
				} else if element == "input", staticAttributes["type"] == "hidden"
					|| (["checkbox", "radio"].contains(staticAttributes["type"]) && staticAttributes["aria-hidden"] == "true")
				{
					view = AbsentField()
				} else if element == "input", ["checkbox", "radio"].contains(staticAttributes["type"]) {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					if !context.suffix.isEmpty { throw HostError("a checkbox in a list row (\(id)) has no iOS host support yet") }
					let control = UIButton(type: .custom)
					control.isAccessibilityElement = true
					control.accessibilityTraits = staticAttributes["type"] == "checkbox" ? [.button, .toggleButton] : .button
					ticks[id] = (staticAttributes["type"] == "radio", try runtime.isChecked(id))
					view = control
				} else if element == "input" {
					if context.button != nil { throw HostError("<input> \(id) is inside a button") }
					let field = UITextField()
					field.addAction(UIAction { [weak self, weak field] _ in
						self?.dismissMessage()
						field?.resignFirstResponder()
					}, for: .editingDidEndOnExit)
					field.addAction(UIAction { [weak self] _ in self?.dismissMessage() }, for: .editingChanged)
					field.addAction(UIAction { [weak self, weak field] _ in
						guard let self, let field else { return }
						self.bringIntoView(field, block: focusIntoViewAlign.block, inline: focusIntoViewAlign.inline)
					}, for: .editingDidBegin)
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
				inner.look = context.look.applying(node.defaultStyle)
				if layout == nil, let style = node.defaultStyle { applyBlockStyle(style, to: view) }
				if layout == nil, element == "li", listMarkers[ObjectIdentifier(container)] != nil { addMarker(to: view) }
				view.accessibilityIdentifier = id
				elements[id] = view
				if element == "dialog" {
					// A dialog shows nothing until showModal() puts it in the top layer (the UA's dialog:not([open]) { display: none }).
					dialogIds.insert(id)
					view.isHidden = true
				}
				container.insertSubview(view, at: index)
				index += 1
				if let style = style(of: id) {
					if style.scroll != nil {
						let scroll = ContainerScrollView()
						scroll.accessibilityIdentifier = "\(id):scroll"
						view.addSubview(scroll)
						scrollViews[id] = scroll
					}
					try place(id, view, style)
				}
				try wire(events[template] ?? [], on: view, element: element, id: id)
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
				_ = try build(template, in: scrollViews[id] ?? view, at: &childIndex, inner)
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
				labels[id] = label
				container.insertSubview(label, at: index)
				index += 1
				if let style = style(of: id) { try place(id, label, style) }
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
				if sheetStyles[template] != nil {
					sheet.area = { [weak self] snapPoint in self?.sheetArea(template, at: snapPoint) }
					sheet.onRest = { [weak self] snapPoint in
						do { try self?.sheetRested(template, at: snapPoint) } catch { fatalError("Markless iOS host: \(error)") }
					}
				} else if layout != nil {
					throw HostError("system sheet \(id) is on a styled page but has no styles of its own")
				}
				var childIndex = 0
				_ = try build(template, in: sheet.content, at: &childIndex, Context())
				sheets[id] = sheet
				if try runtime.evaluate(open).isTruthy { sheet.open(from: nil) }
			}
		}
		return built
	}

	/// `id` is the view's own id, a row's copy included (`<node>@<key>`): the runtime runs the handler in that row.
	private func wire(_ bound: [NativeEvent], on view: UIView, element: String, id: String) throws {
		let onAction = onAction
		for event in bound {
			if event.event == .submit { continue }
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
			case let (.enter, field as UITextField):
				field.addAction(UIAction { _ in onAction(NativeAction(event: .enter, host: id)) }, for: .editingDidEndOnExit)
			case (.idle, _), (.visible, _):
				// Raised by the screen's controller when the run loop goes idle or the element comes on screen.
				continue
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
		scrollViews.removeValue(forKey: id)
		paragraphs.removeValue(forKey: id)?.view.removeFromSuperview()
		paragraphTexts.removeValue(forKey: id)
		flowing.remove(id)
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
		if view is AbsentField { return }
		if let audio = view as? AudioButton {
			audio.isHidden = current["controls"] == nil
			audio.update(source: current["src"], label: current["aria-label"])
		} else if let button = view as? UIButton {
			button.isEnabled = current["disabled"] == nil
			refreshLabel(of: button)
		} else if let drawing = view as? DrawingView {
			// A named svg is an image to VoiceOver; an unnamed one, or one inside a control, is decoration.
			drawing.accessibilityLabel = current["aria-label"]
			drawing.isAccessibilityElement = current["aria-label"] != nil && contexts[id]?.button == nil
			drawing.accessibilityTraits = .image
		} else if let image = view as? UIImageView {
			image.accessibilityLabel = current["aria-label"] ?? current["alt"]
			image.image = current["src"].flatMap { URL(string: $0) }.flatMap { $0.isFileURL ? UIImage(contentsOfFile: $0.path) : nil }
		} else {
			view.accessibilityLabel = current["aria-label"]
		}
		if let field = view as? UITextField { field.isEnabled = current["disabled"] == nil }
		// aria-disabled only reads as dimmed: a press still reaches the button, as on the web.
		let disabled = (view is UIButton || view is UITextField) && current["disabled"] != nil
		if disabled || current["aria-disabled"] == "true" {
			view.accessibilityTraits.insert(.notEnabled)
		} else {
			view.accessibilityTraits.remove(.notEnabled)
		}
		if ticks[id] != nil {
			drawTick(id, view)
		} else if current["role"] == "switch" {
			if #available(iOS 17.0, *) { view.accessibilityTraits.insert(.toggleButton) }
			view.accessibilityValue = current["aria-checked"] == "true" ? "1" : "0"
			return
		} else {
			if current["aria-pressed"] == "true" || current["aria-selected"] == "true" {
				view.accessibilityTraits.insert(.selected)
			} else {
				view.accessibilityTraits.remove(.selected)
			}
			view.accessibilityValue = current["aria-expanded"].map { $0 == "true" ? "expanded" : "collapsed" }
		}
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

	private func drawTick(_ id: String, _ view: UIView) {
		guard let tick = ticks[id], let button = view as? UIButton else { return }
		let symbol = tick.radio ? (tick.checked ? "largecircle.fill.circle" : "circle") : (tick.checked ? "checkmark.square.fill" : "square")
		button.setImage(UIImage(systemName: symbol), for: .normal)
		button.accessibilityValue = tick.checked ? "1" : "0"
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
		guard !(view is UILabel || view is UITextField || view is AudioButton), !leaves.contains(ObjectIdentifier(view)) else { return }
		stack(view)
		for child in view.subviews where !anchors.contains(ObjectIdentifier(child)) { stackTree(child) }
	}

	/// The temporary layout for rungs without Dragon: children top to bottom, start-aligned.
	private func stack(_ container: UIView) {
		NSLayoutConstraint.deactivate(stackConstraints[ObjectIdentifier(container)] ?? [])
		if tableRows.contains(ObjectIdentifier(container)) {
			stackRow(container)
			return
		}
		var constraints: [NSLayoutConstraint] = []
		var above = container.topAnchor
		let indent = indents[ObjectIdentifier(container)] ?? 0
		var top = container
		while let parent = top.superview { top = parent }
		for child in stacked(container) {
			child.translatesAutoresizingMaskIntoConstraints = false
			let wide = fullWidth.contains(ObjectIdentifier(child))
			constraints += [
				child.topAnchor.constraint(equalTo: above),
				child.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: indent),
				wide
					? child.trailingAnchor.constraint(equalTo: container.trailingAnchor)
					: child.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor),
			]
			if wide {
				// As wide as the page allows: a box with no width of its own (a rule, a code block) takes the line.
				let page = child.widthAnchor.constraint(equalTo: top.widthAnchor)
				page.priority = .defaultHigh
				constraints.append(page)
			}
			above = child.bottomAnchor
		}
		constraints.append(above.constraint(equalTo: container.bottomAnchor))
		NSLayoutConstraint.activate(constraints)
		stackConstraints[ObjectIdentifier(container)] = constraints
		if let kind = listMarkers[ObjectIdentifier(container)] {
			var number = 0
			for child in stacked(container) {
				guard let marker = itemMarkers[ObjectIdentifier(child)] else { continue }
				number += 1
				marker.text = kind == "decimal" ? "\(number)." : "\u{2022}"
			}
		}
	}

	/// The children the stacking layout places: not anchors, decorations (a marker, a rule's line) or hidden views.
	private func stacked(_ container: UIView) -> [UIView] {
		container.subviews.filter { child in
			!anchors.contains(ObjectIdentifier(child)) && !decorations.contains(ObjectIdentifier(child)) && !child.isHidden
		}
	}

	/// A table row: its cells side by side, top-aligned; `alignTables` makes each column as wide as its widest cell.
	private func stackRow(_ row: UIView) {
		var constraints: [NSLayoutConstraint] = []
		var leading = row.leadingAnchor
		let cells = stacked(row)
		for (index, cell) in cells.enumerated() {
			cell.translatesAutoresizingMaskIntoConstraints = false
			let fit = row.bottomAnchor.constraint(equalTo: cell.bottomAnchor)
			fit.priority = .defaultLow
			let narrow = cell.widthAnchor.constraint(equalToConstant: 0)
			narrow.priority = .defaultLow
			constraints += [
				cell.topAnchor.constraint(equalTo: row.topAnchor),
				cell.leadingAnchor.constraint(equalTo: leading, constant: index == 0 ? 0 : 12),
				row.bottomAnchor.constraint(greaterThanOrEqualTo: cell.bottomAnchor),
				fit,
				narrow,
			]
			leading = cell.trailingAnchor
		}
		if cells.isEmpty { constraints.append(row.topAnchor.constraint(equalTo: row.bottomAnchor)) }
		else { constraints.append(leading.constraint(lessThanOrEqualTo: row.trailingAnchor)) }
		NSLayoutConstraint.activate(constraints)
		stackConstraints[ObjectIdentifier(row)] = constraints
	}

	/// Lines each table's cells up in columns across all its rows (thead, tbody, tfoot and list rows alike).
	private func alignTables() {
		for table in tableViews.values {
			NSLayoutConstraint.deactivate(columnConstraints[ObjectIdentifier(table)] ?? [])
			var rows: [UIView] = []
			func collect(_ view: UIView) {
				for child in stacked(view) {
					if tableRows.contains(ObjectIdentifier(child)) { rows.append(child) }
					else if !tables.contains(ObjectIdentifier(child)) { collect(child) }
				}
			}
			collect(table)
			let columns = rows.map { stacked($0) }
			var constraints: [NSLayoutConstraint] = []
			for column in 0..<(columns.map(\.count).max() ?? 0) {
				let cells = columns.compactMap { $0.count > column ? $0[column] : nil }
				for cell in cells.dropFirst() { constraints.append(cell.widthAnchor.constraint(equalTo: cells[0].widthAnchor)) }
			}
			NSLayoutConstraint.activate(constraints)
			columnConstraints[ObjectIdentifier(table)] = constraints
		}
	}

	/// The stacking layout's part of an element's default style: insets, rules, list markers and table structure.
	private func applyBlockStyle(_ style: NativeDefaultStyle, to view: UIView) {
		let id = ObjectIdentifier(view)
		if let indent = style.indent { indents[id] = CGFloat(indent) }
		if style.rule {
			// Chrome's hr: a 1 px inset line with 0.5em above and below.
			leaves.insert(id)
			fullWidth.insert(id)
			view.isAccessibilityElement = false
			view.heightAnchor.constraint(equalToConstant: 17).isActive = true
			let line = UIView()
			line.backgroundColor = .systemGray3
			line.translatesAutoresizingMaskIntoConstraints = false
			view.addSubview(line)
			decorations.insert(ObjectIdentifier(line))
			NSLayoutConstraint.activate([
				line.leadingAnchor.constraint(equalTo: view.leadingAnchor),
				line.trailingAnchor.constraint(equalTo: view.trailingAnchor),
				line.centerYAnchor.constraint(equalTo: view.centerYAnchor),
				line.heightAnchor.constraint(equalToConstant: 1),
			])
		}
		if let marker = style.marker { listMarkers[id] = marker }
		switch style.table {
		case "table":
			tables.insert(id)
			tableViews[id] = view
		case "row": tableRows.insert(id)
		case "cell": tableCells.insert(id)
		default: break
		}
	}

	/// A list item's marker, beside it in its list's inset; it is neither read nor part of the item's text.
	private func addMarker(to item: UIView) {
		let marker = UILabel()
		marker.isAccessibilityElement = false
		marker.isUserInteractionEnabled = false
		marker.translatesAutoresizingMaskIntoConstraints = false
		item.addSubview(marker)
		decorations.insert(ObjectIdentifier(marker))
		itemMarkers[ObjectIdentifier(item)] = marker
		NSLayoutConstraint.activate([
			marker.trailingAnchor.constraint(equalTo: item.leadingAnchor, constant: -6),
			marker.topAnchor.constraint(equalTo: item.topAnchor),
		])
	}

	/// A run of text nodes and phrase elements as one label (`nativeParagraphs`), kept current by `render`.
	private func buildParagraph(_ run: [String], in container: UIView, at index: inout Int, _ context: Context) throws -> [String] {
		let label = UILabel()
		label.isUserInteractionEnabled = false
		label.numberOfLines = 0
		label.accessibilityIdentifier = run[0] + context.suffix
		if context.button != nil {
			label.isAccessibilityElement = false
		} else if context.heading {
			label.accessibilityTraits.insert(.header)
		}
		var outer: UIView = label
		if context.look.preformatted {
			let scroll = PreformattedScroll()
			scroll.alwaysBounceVertical = false
			scroll.showsVerticalScrollIndicator = false
			label.translatesAutoresizingMaskIntoConstraints = false
			scroll.addSubview(label)
			NSLayoutConstraint.activate([
				label.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
				label.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
				label.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
				label.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
				scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: scroll.contentLayoutGuide.heightAnchor),
			])
			leaves.insert(ObjectIdentifier(scroll))
			fullWidth.insert(ObjectIdentifier(scroll))
			outer = scroll
		}
		// A table cell is as wide as its text: the column widens rather than wrapping a short word.
		if tableCells.contains(ObjectIdentifier(container)) {
			label.setContentCompressionResistancePriority(.required - 1, for: .horizontal)
			// A fixed wrap width keeps UIKit from wrapping at the narrow width it tries first.
			label.preferredMaxLayoutWidth = root.window?.windowScene?.screen.bounds.width ?? 390
		}
		let paragraph = Paragraph(nodes: run, suffix: context.suffix, look: context.look, label: label, view: outer)
		func register(_ template: String) throws {
			let id = template + context.suffix
			templates[id] = template
			contexts[id] = context
			paragraphs[id] = paragraph
			switch nodes[template]!.kind {
			case let .text(parts):
				paragraphTexts[id] = try runtime.text(of: parts, in: context.scope)
				labels[id] = label
			case let .element(_, staticAttributes, bindings):
				flowing.insert(id)
				var current = staticAttributes
				for binding in bindings where !binding.isProperty {
					current[binding.name] = marklessAttributeValue(binding.name, try runtime.evaluate(binding.value, in: context.scope))
				}
				attributes[id] = current
				for child in slots[template] ?? [] { try register(child) }
			default:
				throw HostError("\(id) cannot flow in a paragraph")
			}
		}
		for template in run { try register(template) }
		try render(paragraph)
		container.insertSubview(outer, at: index)
		index += 1
		if let button = context.button { refreshLabel(of: button) }
		return run.map { $0 + context.suffix }
	}

	private enum Piece {
		case text(String, TextLook)
		case lineBreak
	}

	/// The paragraph's text from its current values: each phrase element's look on its text, `<br>` a new line, `<q>` in
	/// quotes, and whitespace collapsed as CSS `white-space: normal` does, except in preformatted text.
	private func render(_ paragraph: Paragraph) throws {
		var pieces: [Piece] = []
		func walk(_ template: String, _ look: TextLook) {
			guard let node = nodes[template] else { return }
			if node.isText {
				pieces.append(.text(paragraphTexts[template + paragraph.suffix] ?? "", look))
				return
			}
			let style = node.defaultStyle
			if style?.flow == .break {
				pieces.append(.lineBreak)
				return
			}
			let inner = look.applying(style)
			if style?.quotes == true { pieces.append(.text("\u{201C}", inner)) }
			for child in slots[template] ?? [] { walk(child, inner) }
			if style?.quotes == true { pieces.append(.text("\u{201D}", inner)) }
		}
		for template in paragraph.nodes { walk(template, paragraph.look) }
		let out = NSMutableAttributedString()
		var run = ""
		var runLook = paragraph.look
		func flush() {
			if !run.isEmpty { out.append(NSAttributedString(string: run, attributes: runLook.attributes)) }
			run = ""
		}
		func emit(_ text: String, _ look: TextLook) {
			if look != runLook { flush(); runLook = look }
			run += text
		}
		let preformatted = paragraph.look.preformatted
		var pending: TextLook?
		var atLineStart = true
		for piece in pieces {
			switch piece {
			case .lineBreak:
				pending = nil
				emit("\n", paragraph.look)
				atLineStart = true
			case let .text(text, look):
				if preformatted {
					emit(text, look)
					continue
				}
				for character in text {
					if [" ", "\t", "\n", "\r", "\r\n", "\u{0C}"].contains(character) {
						if pending == nil { pending = look }
						continue
					}
					if let space = pending, !atLineStart { emit(" ", space) }
					pending = nil
					atLineStart = false
					emit(String(character), look)
				}
			}
		}
		flush()
		paragraph.label.attributedText = out
		// UIKit's own label for a UILabel reads its line breaks as spaces; the text a person reads keeps them.
		paragraph.label.accessibilityLabel = out.string
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
	if view is AbsentField { return }
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
	view.clipsToBounds = style.clipsChildren
	// Siblings draw by zPosition: in-flow boxes at 0, negative z-index below them, positioned boxes above in their context's order.
	view.layer.zPosition = style.paintOrder.map { CGFloat($0.bucket) * 100_000 + CGFloat($0.rank) + 1 } ?? 0
	// A layer mask clips the box and its subviews without touching their accessibility, as Chrome keeps clipped text exposed.
	if let r = style.clipRect {
		let mask = view.layer.mask ?? CALayer()
		mask.backgroundColor = UIColor.black.cgColor
		mask.frame = CGRect(x: r.x, y: r.y, width: r.width, height: r.height)
		view.layer.mask = mask
	} else {
		view.layer.mask = nil
	}
	paintSides(view, style.sides)
	paintDashed(view, style.dashedBorder)
	if let drawing = view as? DrawingView {
		// An svg's text colour is what its currentColor paints.
		if let color = style.textColor { drawing.currentColor = uiColor(color) }
		return
	}
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
@MainActor
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

/// A dashed or dotted border, drawn from Dragon's operations as Dragon's own UIKit paint draws them (dragonDrawBorderOps).
@MainActor
private func paintDashed(_ view: UIView, _ border: ResolvedStyle.DashedBorder?) {
	let name = "markless-border-ops"
	view.layer.sublayers?.filter { $0.name == name }.forEach { $0.removeFromSuperlayer() }
	guard let border else { return }
	let layer = DashedBorderLayer(border)
	layer.name = name
	layer.frame = view.bounds
	layer.contentsScale = view.traitCollection.displayScale
	view.layer.addSublayer(layer)
	layer.setNeedsDisplay()
}

private final class DashedBorderLayer: CALayer {
	private var border: ResolvedStyle.DashedBorder?
	init(_ border: ResolvedStyle.DashedBorder) {
		self.border = border
		super.init()
	}
	override init(layer: Any) {
		border = (layer as? DashedBorderLayer)?.border
		super.init(layer: layer)
	}
	required init?(coder: NSCoder) { fatalError("not built from a coder") }

	override func draw(in ctx: CGContext) {
		guard let border else { return }
		ctx.saveGState()
		ctx.scaleBy(x: 1 / border.scale, y: 1 / border.scale)
		ctx.translateBy(x: border.ops.originX, y: border.ops.originY)
		for o in border.ops.ops {
			let pts = o.points
			switch o.op {
			case "begin-layer":
				ctx.saveGState()
				ctx.setAlpha(o.alpha)
				ctx.beginTransparencyLayer(auxiliaryInfo: nil)
			case "end-layer":
				ctx.endTransparencyLayer()
				ctx.restoreGState()
			case "save": ctx.saveGState()
			case "restore": ctx.restoreGState()
			case "clip":
				ctx.setShouldAntialias(o.antialias)
				ctx.addPath(polygon(pts))
				ctx.clip()
				ctx.setShouldAntialias(true)
			default:
				let c = border.colors[o.side]
				ctx.setFillColor(UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: o.alpha).cgColor)
				ctx.setShouldAntialias(o.antialias)
				if o.op == "fill" {
					ctx.addPath(polygon(pts))
					ctx.fillPath()
				} else {
					ctx.fillEllipse(in: CGRect(x: pts[0] - pts[2], y: pts[1] - pts[2], width: 2 * pts[2], height: 2 * pts[2]))
				}
				ctx.setShouldAntialias(true)
			}
		}
		ctx.restoreGState()
	}

	private func polygon(_ pts: [Double]) -> CGPath {
		let path = CGMutablePath()
		path.addLines(between: stride(from: 0, to: pts.count - 1, by: 2).map { CGPoint(x: pts[$0], y: pts[$0 + 1]) })
		path.closeSubpath()
		return path
	}
}

/// A checkbox or hidden `<input>`: the form reads its state, the screen shows nothing for it.
private final class AbsentField: UIView {
	override init(frame: CGRect) {
		super.init(frame: frame)
		isHidden = true
		isUserInteractionEnabled = false
		isAccessibilityElement = false
		accessibilityElementsHidden = true
	}

	@available(*, unavailable)
	required init?(coder: NSCoder) { fatalError("an absent field is built by the view factory") }
}

/// Reports the start of every touch on the screen, then steps aside so no other gesture or control is held up.
private final class TouchWatcher: UIGestureRecognizer {
	private let began: () -> Void
	init(_ began: @escaping () -> Void) {
		self.began = began
		super.init(target: nil, action: nil)
		cancelsTouchesInView = false
		delaysTouchesEnded = false
	}

	override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
		began()
		state = .failed
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

/// A scroll container's scroll view over its padding box. A drag that starts toward an edge it is already at goes to the
/// scroll view around it, as the web chains a scroll to the page once a box is at its end.
@MainActor
final class ContainerScrollView: UIScrollView {
	private(set) var inset: (top: Double, left: Double, bottom: Double, right: Double) = (0, 0, 0, 0)

	func configure(_ scroll: ResolvedScroll, in box: CGSize, cornerRadius: Double) {
		inset = scroll.inset
		contentInsetAdjustmentBehavior = .never
		let port = CGSize(width: box.width - inset.left - inset.right, height: box.height - inset.top - inset.bottom)
		frame = CGRect(x: inset.left, y: inset.top, width: port.width, height: port.height)
		contentSize = CGSize(
			width: port.width + (scroll.x ? scroll.range.maxX : 0), height: port.height + (scroll.y ? scroll.range.maxY : 0))
		contentOffset = CGPoint(x: min(contentOffset.x, contentSize.width - port.width), y: min(contentOffset.y, contentSize.height - port.height))
		showsVerticalScrollIndicator = scroll.indicators
		showsHorizontalScrollIndicator = scroll.indicators
		bouncesVertically = scroll.bounceY
		bouncesHorizontally = scroll.bounceX
		layer.cornerRadius = max(0, cornerRadius - min(inset.top, inset.left))
	}

	override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
		guard gesture === panGestureRecognizer else { return super.gestureRecognizerShouldBegin(gesture) }
		let velocity = panGestureRecognizer.velocity(in: self)
		let vertical = abs(velocity.y) >= abs(velocity.x)
		let at = vertical ? contentOffset.y : contentOffset.x
		let end = vertical ? contentSize.height - bounds.height : contentSize.width - bounds.width
		let toward = vertical ? -velocity.y : -velocity.x
		if (toward > 0 && at >= end - 0.5) || (toward < 0 && at <= 0.5) { return false }
		return super.gestureRecognizerShouldBegin(gesture)
	}
}
#endif

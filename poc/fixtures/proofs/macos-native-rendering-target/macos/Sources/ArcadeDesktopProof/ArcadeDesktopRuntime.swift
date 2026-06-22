import AppKit
import Foundation
import JavaScriptCore

public enum ArcadeDesktopRuntimeError: Error, Equatable {
	case duplicateHostNode(String)
	case missingParent(String)
	case missingResource(String)
	case missingSymbol(String)
	case missingView(String)
	case unsupportedEvent(String)
	case unsupportedHostNode(String)
	case unsupportedTextTarget(String)
}

@MainActor
public final class ArcadeDesktopRuntime {
	private enum NativeTextTarget {
		case label(NSTextField)
		case buttonTitle(NSButton)
	}

	private final class NativeEventTarget: NSObject {
		private weak var runtime: ArcadeDesktopRuntime?
		private let symbolId: String

		init(runtime: ArcadeDesktopRuntime, symbolId: String) {
			self.runtime = runtime
			self.symbolId = symbolId
		}

		@MainActor
		@objc func activate(_ sender: Any?) {
			runtime?.runSymbol(symbolId)
		}
	}

	public let artifact: ArcadeProofArtifact

	private let context: JSContext
	private var viewsByHostNodeId: [String: NSView] = [:]
	private var textTargetsByHostNodeId: [String: NativeTextTarget] = [:]
	private var eventTargets: [NativeEventTarget] = []
	private var eventTargetsByHostNodeId: [String: NativeEventTarget] = [:]

	public init(artifact: ArcadeProofArtifact) throws {
		self.artifact = artifact
		self.context = JSContext()

		try installGraph()
		try installSymbols()
	}

	public func mount() throws -> NSView {
		for node in artifact.host.nodes {
			try createNode(node)
		}

		try installEvents()
		try flushTextBindings()

		guard let root = viewsByHostNodeId["host:root"] else {
			throw ArcadeDesktopRuntimeError.missingView("host:root")
		}

		return root
	}

	public func activate(hostNodeId: String) throws {
		guard viewsByHostNodeId[hostNodeId] is NSButton else {
			throw ArcadeDesktopRuntimeError.missingView(hostNodeId)
		}
		guard let target = eventTargetsByHostNodeId[hostNodeId] else {
			throw ArcadeDesktopRuntimeError.unsupportedEvent(hostNodeId)
		}

		target.activate(nil)
	}

	public func textValue(hostNodeId: String) throws -> String {
		guard let target = textTargetsByHostNodeId[hostNodeId] else {
			throw ArcadeDesktopRuntimeError.unsupportedTextTarget(hostNodeId)
		}

		switch target {
		case let .label(label):
			return label.stringValue
		case let .buttonTitle(button):
			return button.title
		}
	}

	public func graphNumber(_ cellId: String) -> Double {
		let reader = context.objectForKeyedSubscript("__arcadeRead")
		return reader?.call(withArguments: [cellId])?.toDouble() ?? .nan
	}

	private func installGraph() throws {
		_ = context.evaluateScript("var graph = {};")

		guard let graph = context.objectForKeyedSubscript("graph") else {
			return
		}

		for cell in artifact.graph.cells {
			graph.setObject(cell.initial, forKeyedSubscript: cell.id as NSString)
		}
	}

	private func installSymbols() throws {
		var source = "var symbols = {};\n"

		for (symbolId, symbol) in artifact.symbols {
			source += "symbols[\(try jsString(symbolId))] = function() { \(symbol.body) };\n"
		}

		source += """
		function __arcadeRunSymbol(id) {
			if (!symbols[id]) {
				throw new Error("Unknown Arcade symbol " + id);
			}
			symbols[id]();
		}
		function __arcadeRead(id) {
			return graph[id];
		}
		"""

		_ = context.evaluateScript(source)
	}

	private func createNode(_ node: ArcadeHostNode) throws {
		if viewsByHostNodeId[node.id] != nil || textTargetsByHostNodeId[node.id] != nil {
			throw ArcadeDesktopRuntimeError.duplicateHostNode(node.id)
		}

		switch node.type {
		case "main":
			let stack = NSStackView()
			stack.orientation = .vertical
			stack.alignment = .centerX
			stack.spacing = 12
			stack.edgeInsets = NSEdgeInsets(top: 28, left: 32, bottom: 28, right: 32)
			viewsByHostNodeId[node.id] = stack
		case "h1":
			let label = NSTextField(labelWithString: node.staticText ?? "")
			label.font = NSFont.systemFont(ofSize: 24, weight: .semibold)
			label.alignment = .center
			viewsByHostNodeId[node.id] = label
			textTargetsByHostNodeId[node.id] = .label(label)
			try append(node: label, toParent: node.parent)
		case "button":
			let button = NSButton(title: "", target: nil, action: nil)
			button.bezelStyle = .rounded
			button.controlSize = .large
			button.setButtonType(.momentaryPushIn)
			viewsByHostNodeId[node.id] = button
			try append(node: button, toParent: node.parent)
		case "text":
			guard let parent = node.parent else {
				throw ArcadeDesktopRuntimeError.missingParent(node.id)
			}
			guard let button = viewsByHostNodeId[parent] as? NSButton else {
				throw ArcadeDesktopRuntimeError.unsupportedTextTarget(node.id)
			}
			textTargetsByHostNodeId[node.id] = .buttonTitle(button)
		default:
			throw ArcadeDesktopRuntimeError.unsupportedHostNode(node.type)
		}
	}

	private func append(node: NSView, toParent parentId: String?) throws {
		guard let parentId else {
			return
		}

		guard let parent = viewsByHostNodeId[parentId] else {
			throw ArcadeDesktopRuntimeError.missingParent(parentId)
		}

		if let stack = parent as? NSStackView {
			stack.addArrangedSubview(node)
		} else {
			parent.addSubview(node)
		}
	}

	private func installEvents() throws {
		for event in artifact.host.events {
			guard event.nativeEvent == "action" else {
				throw ArcadeDesktopRuntimeError.unsupportedEvent(event.nativeEvent)
			}

			guard let button = viewsByHostNodeId[event.node] as? NSButton else {
				throw ArcadeDesktopRuntimeError.missingView(event.node)
			}

			let target = NativeEventTarget(runtime: self, symbolId: event.symbolId)
			eventTargets.append(target)
			eventTargetsByHostNodeId[event.node] = target
			button.target = target
			button.action = #selector(NativeEventTarget.activate(_:))
		}
	}

	private func runSymbol(_ symbolId: String) {
		let runner = context.objectForKeyedSubscript("__arcadeRunSymbol")
		_ = runner?.call(withArguments: [symbolId])
		try? flushTextBindings()
	}

	private func flushTextBindings() throws {
		let reader = context.objectForKeyedSubscript("__arcadeRead")

		for binding in artifact.host.textBindings {
			let value = reader?.call(withArguments: [binding.sourceCell])?.toString() ?? ""
			let text = binding.template.replacingOccurrences(of: "${value}", with: value)

			guard let target = textTargetsByHostNodeId[binding.node] else {
				throw ArcadeDesktopRuntimeError.unsupportedTextTarget(binding.node)
			}

			switch target {
			case let .label(label):
				label.stringValue = text
			case let .buttonTitle(button):
				button.title = text
				button.setAccessibilityLabel(text)
			}
		}
	}

	private func jsString(_ value: String) throws -> String {
		let data = try JSONSerialization.data(withJSONObject: [value])
		let encoded = String(decoding: data, as: UTF8.self)
		return String(encoded.dropFirst().dropLast())
	}
}

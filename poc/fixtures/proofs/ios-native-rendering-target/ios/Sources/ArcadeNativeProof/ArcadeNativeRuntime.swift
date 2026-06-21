import Foundation
import JavaScriptCore
import UIKit

public enum ArcadeNativeRuntimeError: Error, Equatable {
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
public final class ArcadeNativeRuntime {
	private enum NativeTextTarget {
		case label(UILabel)
		case buttonTitle(UIButton)
	}

	private final class NativeEventTarget: NSObject {
		private weak var runtime: ArcadeNativeRuntime?
		private let symbolId: String

		init(runtime: ArcadeNativeRuntime, symbolId: String) {
			self.runtime = runtime
			self.symbolId = symbolId
		}

		@MainActor
		@objc func activate() {
			runtime?.runSymbol(symbolId)
		}
	}

	public let artifact: ArcadeProofArtifact

	private let context: JSContext
	private var viewsByHostNodeId: [String: UIView] = [:]
	private var textTargetsByHostNodeId: [String: NativeTextTarget] = [:]
	private var eventTargets: [NativeEventTarget] = []
	private var eventTargetsByHostNodeId: [String: NativeEventTarget] = [:]

	public init(artifact: ArcadeProofArtifact) throws {
		self.artifact = artifact
		self.context = JSContext()

		try installGraph()
		try installSymbols()
	}

	public func mount() throws -> UIView {
		for node in artifact.host.nodes {
			try createNode(node)
		}

		try installEvents()
		try flushTextBindings()

		guard let root = viewsByHostNodeId["host:root"] else {
			throw ArcadeNativeRuntimeError.missingView("host:root")
		}

		return root
	}

	public func activate(hostNodeId: String) throws {
		guard viewsByHostNodeId[hostNodeId] is UIButton else {
			throw ArcadeNativeRuntimeError.missingView(hostNodeId)
		}
		guard let target = eventTargetsByHostNodeId[hostNodeId] else {
			throw ArcadeNativeRuntimeError.unsupportedEvent(hostNodeId)
		}

		target.activate()
	}

	public func textValue(hostNodeId: String) throws -> String {
		guard let target = textTargetsByHostNodeId[hostNodeId] else {
			throw ArcadeNativeRuntimeError.unsupportedTextTarget(hostNodeId)
		}

		switch target {
		case let .label(label):
			return label.text ?? ""
		case let .buttonTitle(button):
			return button.configuration?.title ?? button.title(for: .normal) ?? ""
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
			throw ArcadeNativeRuntimeError.duplicateHostNode(node.id)
		}

		switch node.type {
		case "main":
			let stack = UIStackView()
			stack.axis = .vertical
			stack.alignment = .center
			stack.spacing = 12
			viewsByHostNodeId[node.id] = stack
		case "h1":
			let label = UILabel()
			label.text = node.staticText
			label.font = .preferredFont(forTextStyle: .title1)
			label.accessibilityTraits.insert(.header)
			viewsByHostNodeId[node.id] = label
			textTargetsByHostNodeId[node.id] = .label(label)
			try append(node: label, toParent: node.parent)
		case "button":
			let button = UIButton(type: .system)
			var configuration = UIButton.Configuration.filled()
			configuration.buttonSize = .large
			configuration.cornerStyle = .medium
			button.configuration = configuration
			button.accessibilityTraits.insert(.button)
			viewsByHostNodeId[node.id] = button
			try append(node: button, toParent: node.parent)
		case "text":
			guard let parent = node.parent else {
				throw ArcadeNativeRuntimeError.missingParent(node.id)
			}
			guard let button = viewsByHostNodeId[parent] as? UIButton else {
				throw ArcadeNativeRuntimeError.unsupportedTextTarget(node.id)
			}
			textTargetsByHostNodeId[node.id] = .buttonTitle(button)
		default:
			throw ArcadeNativeRuntimeError.unsupportedHostNode(node.type)
		}
	}

	private func append(node: UIView, toParent parentId: String?) throws {
		guard let parentId else {
			return
		}

		guard let parent = viewsByHostNodeId[parentId] else {
			throw ArcadeNativeRuntimeError.missingParent(parentId)
		}

		if let stack = parent as? UIStackView {
			stack.addArrangedSubview(node)
		} else {
			parent.addSubview(node)
		}
	}

	private func installEvents() throws {
		for event in artifact.host.events {
			guard event.nativeEvent == "touchUpInside" else {
				throw ArcadeNativeRuntimeError.unsupportedEvent(event.nativeEvent)
			}

			guard let button = viewsByHostNodeId[event.node] as? UIButton else {
				throw ArcadeNativeRuntimeError.missingView(event.node)
			}

			let target = NativeEventTarget(runtime: self, symbolId: event.symbolId)
			eventTargets.append(target)
			eventTargetsByHostNodeId[event.node] = target
			button.addTarget(target, action: #selector(NativeEventTarget.activate), for: .touchUpInside)
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
				throw ArcadeNativeRuntimeError.unsupportedTextTarget(binding.node)
			}

			switch target {
			case let .label(label):
				label.text = text
			case let .buttonTitle(button):
				var configuration = button.configuration
				configuration?.title = text
				button.configuration = configuration
				button.setTitle(text, for: .normal)
				button.accessibilityLabel = text
			}
		}
	}

	private func jsString(_ value: String) throws -> String {
		let data = try JSONSerialization.data(withJSONObject: [value])
		let encoded = String(decoding: data, as: UTF8.self)
		return String(encoded.dropFirst().dropLast())
	}
}

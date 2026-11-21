/// The values a row's `class` or `ui-*` binding can give, as the style input lists them (style-input.ts `rowAttributeOptions`):
/// literals chosen by conditions, in first-seen order; nil for any other binding.
public func rowAttributeOptions(_ name: String, _ expr: NativeExpr) -> [String?]? {
	if givesBoolean(expr) {
		let options = [marklessAttributeValue(name, .bool(true)), marklessAttributeValue(name, .bool(false))]
		return options[0] == options[1] ? [options[0]] : options
	}
	switch expr {
	case let .literal(value):
		return [marklessAttributeValue(name, value)]
	case let .conditional(_, whenTrue, whenFalse):
		guard let a = rowAttributeOptions(name, whenTrue), let b = rowAttributeOptions(name, whenFalse) else { return nil }
		var out: [String?] = []
		for value in a + b where !out.contains(where: { $0 == value }) { out.append(value) }
		return out
	default:
		return nil
	}
}

/// Whether an expression's value is always true or false: a comparison, a negation, or `&&`, `||` and `?:` of those.
private func givesBoolean(_ expr: NativeExpr) -> Bool {
	switch expr {
	case let .literal(value):
		if case .bool = value { return true }
		return false
	case let .unary(op, _):
		return op == "!"
	case let .binary(op, _, _):
		return ["===", "!==", "<", "<=", ">", ">="].contains(op)
	case let .logical(op, left, right):
		return op != "??" && givesBoolean(left) && givesBoolean(right)
	case let .conditional(_, whenTrue, whenFalse):
		return givesBoolean(whenTrue) && givesBoolean(whenFalse)
	default:
		return false
	}
}

extension StyleExport {
	/// The rows each list of the page shows now, for laying the page out at assignment `k`: each row's key, the assignment its
	/// own states (the value its `class` or `ui-*` binding gives) reach from `k`, and its texts by the template's text node id.
	public func shownRows(_ payload: NativeViewPayload, runtime: NativeRuntime) throws -> (Int) throws -> [String: [LaidOutRow]] {
		let texts = Dictionary(try runtime.texts().map { ($0.node, $0.text) }, uniquingKeysWith: { a, _ in a })
		let attributes = Dictionary(try runtime.attributes().map { ("\($0.node)\u{0}\($0.name)", $0.value) }, uniquingKeysWith: { a, _ in a })
		let lists = Dictionary(try runtime.rows().map { ($0.node, $0.keys) }, uniquingKeysWith: { a, _ in a })
		// Each row state of the export: its index, the template element and attribute it follows, and the values it lists.
		var rowStates: [(state: Int, node: String, attribute: String, options: [String?], list: String)] = []
		for (index, state) in states.enumerated() {
			guard let hash = state.key.lastIndex(of: "#") else { continue }
			let nodeId = String(state.key[..<hash])
			let attribute = String(state.key[state.key.index(after: hash)...])
			guard let node = payload.nodes.first(where: { $0.id == nodeId }), let list = node.row,
				case let .element(_, _, bindings) = node.kind,
				let binding = bindings.first(where: { !$0.isProperty && $0.name == attribute }),
				let options = rowAttributeOptions(attribute, binding.value)
			else { continue }
			rowStates.append((index, nodeId, attribute, options, list))
		}
		let rowTexts = payload.nodes.filter { node in
			if case .text = node.kind { return node.row != nil }
			return false
		}
		return { k in
			var out: [String: [LaidOutRow]] = [:]
			for node in payload.nodes {
				guard case .repeat = node.kind, node.row == nil else { continue }
				out[node.id] = try (lists[node.id] ?? []).map { key in
					var reached = k
					for row in rowStates where row.list == node.id {
						let value = attributes["\(row.node)@\(key)\u{0}\(row.attribute)"] ?? nil
						guard let option = row.options.firstIndex(where: { $0 == value }) else {
							throw PayloadError(path: "rows", reason: "\(row.node)@\(key) has \(row.attribute) \(value ?? "absent"), which its style lists no state for")
						}
						guard let column = self.states[row.state].domain.firstIndex(where: { $0.strictlyEquals(.string(String(option))) }) else {
							throw PayloadError(path: "rows", reason: "the style state \(self.states[row.state].key) has no value \(option)")
						}
						reached = self.next[reached][row.state][column]
						guard reached >= 0 else { throw PayloadError(path: "rows", reason: "\(row.node)@\(key)'s style is unreachable") }
					}
					var own: [String: String] = [:]
					for text in rowTexts where text.row == node.id { own[text.id] = texts["\(text.id)@\(key)"] ?? "" }
					return LaidOutRow(key: key, assignment: reached, texts: own)
				}
			}
			return out
		}
	}
}

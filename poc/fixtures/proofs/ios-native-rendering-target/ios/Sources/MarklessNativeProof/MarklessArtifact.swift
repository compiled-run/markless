import Foundation

public struct MarklessProofArtifact: Decodable {
	public let schema: String
	public let source: String
	public let targetProfile: String
	public let graph: MarklessGraphPlan
	public let host: MarklessHostPlan
	public let symbols: [String: MarklessSymbolPlan]
}

public struct MarklessGraphPlan: Decodable {
	public let cells: [MarklessGraphCell]
}

public struct MarklessGraphCell: Decodable {
	public let id: String
	public let initial: Double
	public let type: String
}

public struct MarklessHostPlan: Decodable {
	public let nodes: [MarklessHostNode]
	public let events: [MarklessEventBinding]
	public let textBindings: [MarklessTextBinding]
}

public struct MarklessHostNode: Decodable {
	public let id: String
	public let type: String
	public let parent: String?
	public let staticText: String?
}

public struct MarklessEventBinding: Decodable {
	public let node: String
	public let authoredEvent: String
	public let semanticEvent: String
	public let nativeEvent: String
	public let symbolId: String
}

public struct MarklessTextBinding: Decodable {
	public let node: String
	public let sourceCell: String
	public let template: String
}

public struct MarklessSymbolPlan: Decodable {
	public let kind: String
	public let body: String
}

public enum MarklessNativeProofResources {
	public static func loadArtifact() throws -> MarklessProofArtifact {
		#if SWIFT_PACKAGE
			return try loadArtifact(from: Bundle.module)
		#else
			return try loadArtifact(from: Bundle.main)
		#endif
	}

	public static func loadArtifact(from bundle: Bundle) throws -> MarklessProofArtifact {
		guard let url = bundle.url(forResource: "artifact", withExtension: "json") else {
			throw MarklessNativeRuntimeError.missingResource("artifact.json")
		}

		let data = try Data(contentsOf: url)
		return try JSONDecoder().decode(MarklessProofArtifact.self, from: data)
	}
}

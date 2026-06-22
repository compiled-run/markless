import Foundation

public struct ArcadeProofArtifact: Decodable {
	public let schema: String
	public let source: String
	public let targetProfile: String
	public let nativeTarget: String
	public let graph: ArcadeGraphPlan
	public let host: ArcadeHostPlan
	public let symbols: [String: ArcadeSymbolPlan]
}

public struct ArcadeGraphPlan: Decodable {
	public let cells: [ArcadeGraphCell]
}

public struct ArcadeGraphCell: Decodable {
	public let id: String
	public let initial: Double
	public let type: String
}

public struct ArcadeHostPlan: Decodable {
	public let nodes: [ArcadeHostNode]
	public let events: [ArcadeEventBinding]
	public let textBindings: [ArcadeTextBinding]
}

public struct ArcadeHostNode: Decodable {
	public let id: String
	public let type: String
	public let parent: String?
	public let staticText: String?
}

public struct ArcadeEventBinding: Decodable {
	public let node: String
	public let authoredEvent: String
	public let semanticEvent: String
	public let nativeEvent: String
	public let symbolId: String
}

public struct ArcadeTextBinding: Decodable {
	public let node: String
	public let sourceCell: String
	public let template: String
}

public struct ArcadeSymbolPlan: Decodable {
	public let kind: String
	public let body: String
}

public enum ArcadeDesktopProofResources {
	public static func loadArtifact() throws -> ArcadeProofArtifact {
		#if SWIFT_PACKAGE
			return try loadArtifact(from: Bundle.module)
		#else
			return try loadArtifact(from: Bundle.main)
		#endif
	}

	public static func loadArtifact(from bundle: Bundle) throws -> ArcadeProofArtifact {
		guard let url = bundle.url(forResource: "artifact", withExtension: "json") else {
			throw ArcadeDesktopRuntimeError.missingResource("artifact.json")
		}

		let data = try Data(contentsOf: url)
		return try JSONDecoder().decode(ArcadeProofArtifact.self, from: data)
	}
}

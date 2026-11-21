import DesignSystem
import FirebaseFirestore
import Foundation
import ResonanceKit

/// A card on my map: where it sits (world units, top-left) and the region it's filed in.
struct MapNode: Equatable, Sendable {
    let cardId: String
    var x: Double
    var y: Double
    var groupId: String?
}

/// A directed arrow between two of my cards (`{source}_{target}`), with its optional words.
struct MapEdge: Equatable, Sendable {
    let id: String
    let sourceCardId: String
    let targetCardId: String
    var label: String
}

/// A region (分類): a titled, tinted box cards are filed into.
struct MapGroup: Equatable, Sendable {
    let id: String
    var title: String
    var hue: Double
    var x: Double
    var y: Double
    var w: Double
    var h: Double
}

/// What a node shows of its card (the fields ThoughtMapNode reads).
struct MapCard: Equatable, Sendable {
    let id: String
    let authorId: String
    let slug: String?
    let title: String
    let story: String
    let tags: [String]
    let visibility: String
    let publishedAt: Date?
    let mediaURL: URL?
    let accentHue: Double?
    /// The cover's frame (round 25 §G1): the node's square thumb is cut from it. Nil: the centre.
    var coverFrame: CoverFraming? = nil
    /// The cover itself when `mediaURL` is its smaller copy (B2): asked for once if that fails.
    var mediaFallbackURL: URL? = nil
}

extension MapCard {
    /// A card as the server summarises it (GET /cards?keys=): its excerpt
    /// stands in for the story, and an anonymous one has no author (`authorId`
    /// empty) — the server never names it.
    nonisolated init(summary c: FeedCard) {
        self.init(id: c.id, authorId: c.author?.value1.id ?? "", slug: c.slug, title: c.title, story: c.excerpt,
                  tags: c.tags, visibility: c.visibility.rawValue, publishedAt: c.publishedAt.flatMap(ISO8601.date),
                  mediaURL: c.listCoverURL, accentHue: c.accentHue, coverFrame: c.coverFraming,
                  mediaFallbackURL: c.listCoverFallbackURL)
    }

    /// A card document's `media` as the map draws it (B2): the smaller copy (`thumbUrl`) and the cover to fall back
    /// on — the copy only while it is the current cover's (`ThoughtMapService.isCopy`), else the cover alone. Nil for
    /// no picture.
    nonisolated static func cover(media: [String: Any]?) -> (url: URL?, fallback: URL?) {
        guard (media?["type"] as? String) == "image", let full = media?["url"] as? String, !full.isEmpty else { return (nil, nil) }
        let fullURL = URL(string: full)
        if let thumb = media?["thumbUrl"] as? String, ThoughtMapService.isCopy(thumb, of: full), let thumbURL = URL(string: thumb) {
            return (thumbURL, fullURL)
        }
        return (fullURL, nil)
    }
}

/// The thought map (thoughtMaps/{uid}/nodes|edges|groups). With `features.apiThoughtMap` (Phase 2 of the
/// middleware decouple) through `/api/v1`, as the web's client/thoughtMap.ts: read whole (GET /me/thought-map, once
/// every change made here has landed) and changed through the account's `MapOpQueue` (POST /me/thought-map/ops
/// batches, in order, a drop's moves folded). Otherwise read and written straight to Firestore — the owner's own
/// documents, `isSelf` in the rules — the older path kept one release. Either way the canvas has drawn the change
/// before it gets here. The cards the map holds are read as before (`cards()`).
struct ThoughtMapService {
    let uid: String
    /// Cards' summaries from the server, by id (GET /cards?keys=): for the cards
    /// the rules won't let this client read (someone else's anonymous card).
    let summaries: @Sendable ([String]) async throws -> [FeedCard]
    /// The `/api/v1` path: the account's op queue and the map's read; nil: Firestore.
    var ops: MapOpQueue? = nil
    var api: ThoughtMapAPI? = nil

    /// Which path this service takes.
    var usesAPI: Bool { ops != nil && api != nil }
    private var db: Firestore { FirebaseBootstrap.db }
    private var map: DocumentReference { db.collection("thoughtMaps").document(uid) }
    private var nodesCol: CollectionReference { map.collection("nodes") }
    private var edgesCol: CollectionReference { map.collection("edges") }
    private var groupsCol: CollectionReference { map.collection("groups") }

    struct Loaded {
        var nodes: [MapNode]
        var edges: [MapEdge]
        var groups: [MapGroup]
    }

    /// loadMyThoughtMap: the three collections in full (document-id order).
    func load() async throws -> Loaded {
        if let ops, let api {
            await ops.flush()
            return Self.loaded(try await api.map())
        }
        async let n = nodesCol.getDocuments()
        async let e = edgesCol.getDocuments()
        async let g = groupsCol.getDocuments()
        let (nodes, edges, groups) = try await (n, e, g)
        return Loaded(
            nodes: nodes.documents.map { d in
                MapNode(cardId: d.get("cardId") as? String ?? d.documentID, x: Self.num(d.get("x")) ?? 0,
                        y: Self.num(d.get("y")) ?? 0, groupId: d.get("groupId") as? String)
            },
            edges: edges.documents.map { d in
                MapEdge(id: d.documentID, sourceCardId: d.get("sourceCardId") as? String ?? "",
                        targetCardId: d.get("targetCardId") as? String ?? "", label: d.get("label") as? String ?? "")
            },
            groups: groups.documents.map { d in
                MapGroup(id: d.documentID, title: d.get("title") as? String ?? "", hue: Self.num(d.get("hue")) ?? 55,
                         x: Self.num(d.get("x")) ?? 0, y: Self.num(d.get("y")) ?? 0,
                         w: Self.num(d.get("w")) ?? 320, h: Self.num(d.get("h")) ?? 240)
            })
    }

    /// The map as GET /me/thought-map answers it (numbers a stored item lacks already read as below).
    nonisolated static func loaded(_ map: ThoughtMapAPI.Map) -> Loaded {
        Loaded(nodes: map.nodes.map { MapNode(cardId: $0.cardId, x: $0.x, y: $0.y, groupId: $0.groupId) },
               edges: map.edges.map { MapEdge(id: $0.id, sourceCardId: $0.sourceCardId, targetCardId: $0.targetCardId, label: $0.label) },
               groups: map.groups.map { MapGroup(id: $0.id, title: $0.title, hue: $0.hue, x: $0.x, y: $0.y, w: $0.w, h: $0.h) })
    }

    static func edgeId(_ source: String, _ target: String) -> String { "\(source)_\(target)" }

    /// One op of the flat `MapOp`, its kind's fields only.
    nonisolated static func op(_ kind: ThoughtMapAPI.Op.OpPayload, cardId: String? = nil, x: Double? = nil, y: Double? = nil,
                               groupId: String? = nil, source: String? = nil, target: String? = nil, label: String? = nil,
                               id: String? = nil, title: String? = nil, hue: Double? = nil, w: Double? = nil, h: Double? = nil) -> ThoughtMapAPI.Op {
        ThoughtMapAPI.Op(op: kind, cardId: cardId, x: x, y: y, groupId: groupId, sourceCardId: source, targetCardId: target,
                         label: label, id: id, title: title, hue: hue, w: w, h: h)
    }

    /// The ops that move a card and file it in `groupId` (nil: unfiled), as the web's moveMapNode.
    nonisolated static func moveOps(_ cardId: String, x: Double, y: Double, groupId: String?) -> [ThoughtMapAPI.Op] {
        if let groupId { return [op(.moveNode, cardId: cardId, x: x, y: y, groupId: groupId)] }
        return [op(.moveNode, cardId: cardId, x: x, y: y), op(.setNodeGroup, cardId: cardId)]
    }

    /// A group's patch (`title`, `hue`, `x`, `y`, `w`, `h`) as one op.
    nonisolated static func updateGroupOp(_ id: String, _ patch: [String: Any]) -> ThoughtMapAPI.Op {
        func num(_ k: String) -> Double? { (patch[k] as? NSNumber)?.doubleValue }
        return op(.updateGroup, x: num("x"), y: num("y"), groupId: id, title: patch["title"] as? String, hue: num("hue"),
                  w: num("w"), h: num("h"))
    }

    func addNode(_ cardId: String, x: Double, y: Double) async throws {
        if let ops { return try await ops.enqueue([Self.op(.addNode, cardId: cardId, x: x, y: y)]) }
        try await nodesCol.document(cardId).setData([
            "cardId": cardId, "x": x, "y": y, "groupId": NSNull(),
            "createdAt": FieldValue.serverTimestamp(), "updatedAt": FieldValue.serverTimestamp(),
        ])
    }

    func moveNode(_ cardId: String, x: Double, y: Double, groupId: String?) async throws {
        if let ops { return try await ops.enqueue(Self.moveOps(cardId, x: x, y: y, groupId: groupId)) }
        try await nodesCol.document(cardId).updateData([
            "x": x, "y": y, "groupId": groupId ?? NSNull(), "updatedAt": FieldValue.serverTimestamp(),
        ])
    }

    /// setNodeGroups: re-file cards in one batch.
    func setNodeGroups(_ changes: [(cardId: String, groupId: String?)]) async throws {
        guard !changes.isEmpty else { return }
        if let ops { return try await ops.enqueue(changes.map { Self.op(.setNodeGroup, cardId: $0.cardId, groupId: $0.groupId) }) }
        let batch = db.batch()
        for c in changes {
            batch.updateData(["groupId": c.groupId ?? NSNull(), "updatedAt": FieldValue.serverTimestamp()],
                             forDocument: nodesCol.document(c.cardId))
        }
        try await batch.commit()
    }

    /// removeMapNode: the node and every arrow touching it (the card itself stays).
    func removeNode(_ cardId: String) async throws {
        if let ops { return try await ops.enqueue([Self.op(.removeNode, cardId: cardId)]) }
        async let out = edgesCol.whereField("sourceCardId", isEqualTo: cardId).getDocuments()
        async let inn = edgesCol.whereField("targetCardId", isEqualTo: cardId).getDocuments()
        let (a, b) = try await (out, inn)
        let batch = db.batch()
        batch.deleteDocument(nodesCol.document(cardId))
        for d in a.documents + b.documents { batch.deleteDocument(d.reference) }
        try await batch.commit()
    }

    func createEdge(_ source: String, _ target: String, label: String = "") async throws {
        guard source != target else { return }
        if let ops { return try await ops.enqueue([Self.op(.addEdge, source: source, target: target, label: label)]) }
        try await edgesCol.document(Self.edgeId(source, target)).setData([
            "sourceCardId": source, "targetCardId": target, "label": label, "createdAt": FieldValue.serverTimestamp(),
        ])
    }

    func updateEdgeLabel(_ id: String, _ label: String) async throws {
        if let ops { return try await ops.enqueue([Self.op(.setEdgeLabel, label: label, id: id)]) }
        try await edgesCol.document(id).updateData(["label": label])
    }

    func removeEdge(_ id: String) async throws {
        if let ops { return try await ops.enqueue([Self.op(.removeEdge, id: id)]) }
        try await edgesCol.document(id).delete()
    }

    func createGroup(title: String, hue: Double, x: Double, y: Double, w: Double, h: Double) async throws -> String {
        if let ops {
            // Under an id made here (the server takes the one the client chose); answered once stored.
            let id = DraftService.newId()
            try await ops.enqueue([Self.op(.addGroup, x: x, y: y, groupId: id, title: title, hue: hue, w: w, h: h)])
            return id
        }
        let ref = groupsCol.document()
        try await ref.setData(["title": title, "hue": hue, "x": x, "y": y, "w": w, "h": h,
                               "createdAt": FieldValue.serverTimestamp()])
        return ref.documentID
    }

    func updateGroup(_ id: String, _ patch: [String: Any]) async throws {
        if let ops { return try await ops.enqueue([Self.updateGroupOp(id, patch)]) }
        try await groupsCol.document(id).updateData(patch)
    }

    /// A region moved with its cards: the web's two writes, here in one batch so they land together.
    func moveGroup(_ id: String, x: Double, y: Double, members: [(cardId: String, x: Double, y: Double)]) async throws {
        if let ops {
            return try await ops.enqueue([Self.op(.updateGroup, x: x, y: y, groupId: id)]
                + members.map { Self.op(.moveNode, cardId: $0.cardId, x: $0.x, y: $0.y) })
        }
        let batch = db.batch()
        batch.updateData(["x": x, "y": y], forDocument: groupsCol.document(id))
        for m in members {
            batch.updateData(["x": m.x, "y": m.y, "updatedAt": FieldValue.serverTimestamp()], forDocument: nodesCol.document(m.cardId))
        }
        try await batch.commit()
    }

    /// removeMapGroup: the region goes, its cards stay on the map, unfiled.
    func removeGroup(_ id: String) async throws {
        if let ops { return try await ops.enqueue([Self.op(.removeGroup, groupId: id)]) }
        let members = try await nodesCol.whereField("groupId", isEqualTo: id).getDocuments()
        let batch = db.batch()
        batch.deleteDocument(groupsCol.document(id))
        for d in members.documents {
            batch.updateData(["groupId": NSNull(), "updatedAt": FieldValue.serverTimestamp()], forDocument: d.reference)
        }
        try await batch.commit()
    }

    // MARK: - The cards the map can hold (useMyThoughtMap)

    /// How many of my own cards the map reads: the newest 40 published, and as many never published.
    static let ownLimit = 40
    /// How many never-published cards are read to find the most recently edited (Android's DRAFT_SCAN).
    static let draftScan = 200

    /// My own cards — the newest 40 published (getCardsByAuthor) and, in a query of their own, the 40
    /// never-published 私人卡 most recently edited (C4: in a `publishedAt` order a draft's null sorts
    /// last, so past 40 published cards none reached the tray) — and the originals I resonated with
    /// (my latest 60 cards' references, read as `read` reads them — one nobody lets me read any more
    /// just isn't there).
    func cards() async throws -> (cards: [String: MapCard], resonated: Set<String>) {
        let cardsCol = db.collection("cards")
        async let ownSnap = cardsCol.whereField("authorId", isEqualTo: uid)
            .order(by: "publishedAt", descending: true).limit(to: Self.ownLimit).getDocuments()
        async let draftSnap = cardsCol.whereField("authorId", isEqualTo: uid).whereField("publishedAt", isEqualTo: NSNull())
            .limit(to: Self.draftScan).getDocuments()
        async let replySnap = cardsCol.whereField("authorId", isEqualTo: uid).limit(to: 60).getDocuments()
        let (own, drafts, replies) = try await (ownSnap, draftSnap, replySnap)
        let refs = Array(Set(replies.documents.compactMap { $0.get("referenceCardId") as? String }))
        let originals = await read(refs)
        var byId: [String: MapCard] = [:]
        for c in originals { byId[c.id] = c }
        for d in own.documents { if let c = Self.card(d), c.publishedAt != nil { byId[c.id] = c } }
        for c in Self.newestDrafts(drafts.documents.map { (id: $0.documentID, data: $0.data()) }, keep: Self.ownLimit) {
            byId[c.id] = c
        }
        let resonated = Set(originals.filter { $0.authorId != uid }.map(\.id))
        return (byId, resonated)
    }

    /// The never-published cards the map holds: the `keep` most recently edited (`updatedAt`, newest
    /// first; one without a date after those with one), the trash's left out.
    nonisolated static func newestDrafts(_ docs: [(id: String, data: [String: Any])], keep: Int) -> [MapCard] {
        let dated = docs.map { doc in (doc, ((doc.data["updatedAt"] as? Timestamp)?.dateValue()) ?? .distantPast) }
        return dated.sorted { $0.1 > $1.1 }
            .compactMap { pair in card(id: pair.0.id, data: pair.0.data) }
            .prefix(keep)
            .map { $0 }
    }

    /// One card as it is now: nil when it is gone, or no longer readable by me (deleted, made
    /// private); a read that failed for now throws. One the rules won't read here is asked of
    /// the server, as `read` does.
    func card(_ id: String) async throws -> MapCard? {
        do {
            if let card = Self.card(try await db.collection("cards").document(id).getDocument()) { return card }
        } catch where FirestoreFailure.isGone(error) {}
        return try await summaries([id]).first { $0.id == id }.map(MapCard.init(summary:))
    }

    /// Cards already on the map that the newest-40 read didn't bring (an older card placed long ago).
    func cards(ids: [String]) async -> [MapCard] {
        await read(ids)
    }

    private func read(_ ids: [String]) async -> [MapCard] {
        let cardsCol = db.collection("cards")
        // My own cards first, 30 to a query (audit I12) instead of one read each: scoped `authorId == me`,
        // which the rules' list allows; someone else's card in a chunk is simply not in its answer. A
        // chunk that fails, and every card not mine, is read one at a time as before.
        var own: [String: MapCard] = [:]
        // Answered by a query: mine (one in the trash is not drawn, and isn't asked for again).
        var answered = Set<String>()
        let unique = Array(NSOrderedSet(array: ids)) as? [String] ?? ids
        for start in stride(from: 0, to: unique.count, by: Self.idsPerQuery) {
            let chunk = Array(unique[start..<min(unique.count, start + Self.idsPerQuery)])
            guard let snap = try? await cardsCol.whereField("authorId", isEqualTo: uid)
                .whereField(FieldPath.documentID(), in: chunk).getDocuments() else { continue }
            for d in snap.documents {
                answered.insert(d.documentID)
                if let card = Self.card(d) { own[card.id] = card }
            }
        }
        let rest = ids.filter { !answered.contains($0) }
        let others = rest.isEmpty ? [] : await Self.read(rest, underRules: { id in try? await Self.card(cardsCol.document(id).getDocument()) },
                                                         server: summaries)
        var byId = own
        for card in others where byId[card.id] == nil { byId[card.id] = card }
        return ids.compactMap { byId[$0] }
    }

    /// The most ids one Firestore `in` filter takes.
    static let idsPerQuery = 30

    /// Cards by id, in the order asked: each read under the rules, and those the
    /// rules won't read here (someone else's anonymous card) asked of the server
    /// in one request, which leaves an anonymous card's author out — as the web's
    /// useMyThoughtMap does. A card neither will read isn't there; should the
    /// server fail, those cards are just not shown this time.
    nonisolated static func read(_ ids: [String], underRules: @escaping @Sendable (String) async -> MapCard?,
                                 server: @Sendable ([String]) async throws -> [FeedCard]) async -> [MapCard] {
        let read = await withTaskGroup(of: (String, MapCard?).self) { group in
            for id in ids { group.addTask { (id, await underRules(id)) } }
            var read: [String: MapCard] = [:]
            for await (id, card) in group { if let card { read[id] = card } }
            return read
        }
        let unread = ids.filter { !read.keys.contains($0) }
        var summarised: [String: MapCard] = [:]
        if !unread.isEmpty, let cards = try? await server(unread) {
            for c in cards { summarised[c.id] = MapCard(summary: c) }
        }
        return ids.compactMap { read[$0] ?? summarised[$0] }
    }

    nonisolated private static func card(_ d: DocumentSnapshot) -> MapCard? {
        guard d.exists, let data = d.data() else { return nil }
        return card(id: d.documentID, data: data)
    }

    /// A card's document as the map holds it — nil for one in the trash (trash.spec §5.6): it and its
    /// arrows aren't drawn, and its node, edges and labels stay stored, so a restore puts it back in
    /// place. (The server's `?keys=` fallback leaves trashed cards out for everyone, its owner too.)
    nonisolated static func card(id: String, data d: [String: Any]) -> MapCard? {
        guard d["trashedAt"] == nil || d["trashedAt"] is NSNull else { return nil }
        let media = d["media"] as? [String: Any]
        let cover = MapCard.cover(media: media)
        return MapCard(
            id: id,
            authorId: d["authorId"] as? String ?? "",
            slug: d["slug"] as? String,
            title: d["thoughtCore"] as? String ?? "",
            story: d["story"] as? String ?? "",
            tags: d["tags"] as? [String] ?? [],
            visibility: d["visibility"] as? String ?? "public",
            publishedAt: (d["publishedAt"] as? Timestamp)?.dateValue(),
            mediaURL: cover.url,
            accentHue: num(d["accentHue"]), coverFrame: CoverFrames.of(media: media), mediaFallbackURL: cover.fallback)
    }

    /// Whether a document's `media.thumbUrl` is the smaller copy of its `media.url` (B2): the cover's address with
    /// its last extension replaced by `-w960.webp` (`…/B.webp` → `…/B-w960.webp`). A draft's save merges `media`, so a
    /// changed cover can keep the old cover's `thumbUrl`, which is then not this cover's and is ignored.
    nonisolated static func isCopy(_ thumb: String, of url: String) -> Bool {
        guard !thumb.isEmpty, !url.isEmpty else { return false }
        let slash = url.lastIndex(of: "/").map { url.index(after: $0) } ?? url.startIndex
        let stem = url[slash...].lastIndex(of: ".").map { String(url[..<$0]) } ?? url
        return thumb == stem + "-w960.webp"
    }

    nonisolated private static func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }
}

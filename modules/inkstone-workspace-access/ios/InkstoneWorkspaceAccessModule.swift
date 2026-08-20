import ExpoModulesCore
import Foundation

public final class InkstoneWorkspaceAccessModule: Module {
  private var activeURLs: [String: URL] = [:]

  public func definition() -> ModuleDefinition {
    Name("InkstoneWorkspaceAccess")

    Function("createBookmark") { (uri: String) -> String in
      let url = try self.fileURL(uri)
      let started = url.startAccessingSecurityScopedResource()
      defer {
        if started {
          url.stopAccessingSecurityScopedResource()
        }
      }
      let data = try url.bookmarkData(
        options: [.withSecurityScope],
        includingResourceValuesForKeys: [.isDirectoryKey],
        relativeTo: nil
      )
      return data.base64EncodedString()
    }

    Function("resolveBookmark") { (serializedBookmark: String) -> [String: Any] in
      guard let data = Data(base64Encoded: serializedBookmark) else {
        throw InvalidWorkspaceBookmarkException()
      }
      var stale = false
      let url = try URL(
        resolvingBookmarkData: data,
        options: [.withSecurityScope, .withoutUI],
        relativeTo: nil,
        bookmarkDataIsStale: &stale
      )
      let values = try url.resourceValues(forKeys: [.isDirectoryKey])
      guard values.isDirectory == true, url.startAccessingSecurityScopedResource() else {
        throw WorkspaceAccessDeniedException()
      }

      let key = url.absoluteString
      if let previous = self.activeURLs.updateValue(url, forKey: key) {
        previous.stopAccessingSecurityScopedResource()
      }
      let refreshed = stale
        ? try url.bookmarkData(
          options: [.withSecurityScope],
          includingResourceValuesForKeys: [.isDirectoryKey],
          relativeTo: nil
        ).base64EncodedString()
        : serializedBookmark
      return ["uri": key, "stale": stale, "serializedBookmark": refreshed]
    }

    Function("stopAccessing") { (uri: String) in
      self.activeURLs.removeValue(forKey: uri)?.stopAccessingSecurityScopedResource()
    }

    OnDestroy {
      self.stopAllAccess()
    }
  }

  private func fileURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL else {
      throw InvalidWorkspaceURLException()
    }
    let values = try url.resourceValues(forKeys: [.isDirectoryKey])
    guard values.isDirectory == true else {
      throw InvalidWorkspaceURLException()
    }
    return url
  }

  private func stopAllAccess() {
    for url in activeURLs.values {
      url.stopAccessingSecurityScopedResource()
    }
    activeURLs.removeAll()
  }
}

private final class InvalidWorkspaceURLException: Exception {
  override var reason: String { "The selected workspace URL is not a readable directory." }
}

private final class InvalidWorkspaceBookmarkException: Exception {
  override var reason: String { "The persisted workspace bookmark is invalid." }
}

private final class WorkspaceAccessDeniedException: Exception {
  override var reason: String { "The persisted workspace bookmark needs reauthorization." }
}

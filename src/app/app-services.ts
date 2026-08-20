import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { createExpoAiSecretStore } from "../ai/expo-ai-secret-store";
import { createExpoAiStore } from "../ai/expo-ai-store";
import type { AiSecretStore } from "../ai/ai-secret-store";
import type { AiStore } from "../ai/ai-store";
import { createAiConnectionTester } from "../ai/connection-test";
import { createAiConversationService } from "../ai/conversation-service";
import { createAiGenieService } from "../ai/genie-service";
import { createAiAutomationRunner } from "../ai/automation-runner";
import { createFetchAiHttpTransport } from "../ai/http-transport";
import {
  createAiProviderProfileManager,
  type AiProviderProfileManager,
} from "../ai/provider-profile-manager";
import { createAiProviderRegistry, type AiProviderRegistry } from "../ai/provider-registry";
import type { BackupBinaryWorkspace, BackupService } from "../backup/backup-service";
import { createAdapterBackupWorkspace } from "../backup/adapter-backup-workspace";
import { createCompositeBackupWorkspace } from "../backup/composite-backup-workspace";
import { createAutomaticBackupConfigStore } from "../backup/automatic-backup-config";
import {
  createAutomaticBackupManager,
  type AutomaticBackupManager,
} from "../backup/expo-automatic-backup";
import { createExpoBackupFiles, type ExpoBackupFiles } from "../backup/expo-backup-files";
import { createBackupService } from "../backup/vmbak-service";

import {
  parseDocumentId,
  parseSessionId,
  parseWorkspaceId,
  type DocumentId,
  type SessionId,
  type WorkspaceId,
} from "../domain/identifiers";
import { isEditableTextFormat } from "../formats/format-path";
import { bytesToDataUri } from "../formats/local-resource";
import { createPrivateVaultHistoryStore } from "../history/private-vault-history-store";
import type { HistoryStore } from "../history/history-store";
import { createExpoSearchIndex } from "../search/expo-search-index";
import {
  createIndexedHistoryStore,
  synchronizeHistoryIndex,
} from "../search/indexed-history-store";
import {
  createIndexedWorkspaceRepository,
  type IndexedWorkspaceRepository,
} from "../search/indexed-workspace-repository";
import type { SearchIndex } from "../search/search-index";
import { createWorkspaceSearch, type WorkspaceSearch } from "../search/workspace-search";
import { createExpoPhase6Store } from "../phase6/expo-phase6-store";
import type { Phase6Store } from "../phase6/phase6-store";
import { createPrivateVaultRecoveryStore } from "../recovery/private-vault-recovery-store";
import type { RecoveryDraftStore } from "../recovery/recovery-draft-store";
import {
  createExpoVaultStorage,
  type ExpoFileSystemAdapter,
} from "../workspace/expo-vault-storage";
import { createExpoWorkspaceAdapter } from "../workspace/expo-workspace-adapter";
import { LINKED_CAPABILITIES } from "../workspace/linked-workspace-capabilities";
import { createPrivateVaultRepository } from "../workspace/private-vault-repository";
import {
  createWorkspaceCatalogStore,
  type WorkspaceCatalogStore,
  type WorkspaceRecord,
} from "../workspace/workspace-catalog";
import { createWorkspaceAdapterRepository } from "../workspace/workspace-adapter-repository";
import { createWorkspaceDirectoryStore } from "../workspace/workspace-directory-store";
import { parseWorkspacePath } from "../workspace/workspace-path";
import { deriveWorkspaceDocumentId } from "../workspace/workspace-document-id";
import { createExpoWorkspaceGrantService } from "../workspace/expo-workspace-grant-service";
import {
  workspaceGrantRuntimeUri,
  type WorkspaceGrantService,
} from "../workspace/workspace-grant-service";
import { createWorkspaceManager, type WorkspaceManager } from "../workspace/workspace-manager";
import type { WorkspaceRepository } from "../workspace/workspace-repository";
import { createScopedVaultStorage } from "../workspace/scoped-vault-storage";
import {
  createWorkspaceFileShare,
  type WorkspaceShareSource,
} from "../workspace/workspace-file-share";
import {
  createAdapterShareSource,
  createRepositoryShareSource,
} from "../workspace/workspace-share-source";
import { cleanupExpiredShareCache } from "../workspace/workspace-share-cache";
import {
  createAdapterWorkspaceBrowser,
  type WorkspaceBrowser,
} from "../workspace/workspace-browser";
import { createManagedWorkspaceBrowser } from "../workspace/managed-workspace-browser";
import { createFileActivityStore, type FileActivityStore } from "./file-activity-store";
import {
  MANAGED_WORKSPACE_DEFAULT_LOCATION,
  MANAGED_WORKSPACE_DEFAULT_NAME,
} from "./managed-workspace-identity";
import { createSettingsStore, type SettingsStore } from "./settings-store";
import {
  createAttachmentImporter,
  type AttachmentImporter,
  type PickedAttachment,
} from "./attachment-import";

export type AppServices = Readonly<{
  repository: WorkspaceRepository;
  browser: WorkspaceBrowser;
  activeWorkspace: WorkspaceRecord;
  managedWorkspace: WorkspaceRecord;
  workspaceCatalog: WorkspaceCatalogStore;
  workspaceGrantService: WorkspaceGrantService;
  workspaceManager: WorkspaceManager;
  recoveryStore: RecoveryDraftStore;
  historyStore: HistoryStore;
  fileActivityStore: FileActivityStore;
  searchIndex: SearchIndex;
  workspaceSearch: WorkspaceSearch;
  phase6Store: Phase6Store;
  aiStore: AiStore;
  aiSecretStore: AiSecretStore;
  aiProviderProfiles: AiProviderProfileManager;
  aiProviders: AiProviderRegistry;
  aiConnectionTester: ReturnType<typeof createAiConnectionTester>;
  aiConversations: ReturnType<typeof createAiConversationService>;
  aiGenies: ReturnType<typeof createAiGenieService>;
  aiAutomations: ReturnType<typeof createAiAutomationRunner>;
  backupService: BackupService;
  backupFiles: ExpoBackupFiles;
  automaticBackup: AutomaticBackupManager;
  settingsStore: SettingsStore;
  attachmentImporter: AttachmentImporter;
  readWorkspaceResource: (path: string) => Promise<string | null>;
  shareDrawingExport: (name: string, format: "png" | "svg", contents: string) => Promise<boolean>;
  synchronizeSearchIndex: () => Promise<void>;
  createDocumentId: () => DocumentId;
  createSessionId: () => SessionId;
  activateWorkspace: (record: WorkspaceRecord) => AppServices;
}>;

function createDocumentId(): DocumentId {
  const parsed = parseDocumentId(Crypto.randomUUID());
  if (!parsed.ok) throw new Error("The platform generated an invalid document identity");
  return parsed.value;
}

function createSessionId(): SessionId {
  const parsed = parseSessionId(Crypto.randomUUID());
  if (!parsed.ok) throw new Error("The platform generated an invalid session identity");
  return parsed.value;
}

function createWorkspaceId(): WorkspaceId {
  const parsed = parseWorkspaceId(Crypto.randomUUID());
  if (!parsed.ok) throw new Error("The platform generated an invalid workspace identity");
  return parsed.value;
}

async function hashMarkdown(markdown: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, markdown);
}

async function hashBytes(contents: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(contents.byteLength);
  stableBytes.set(contents);
  const digest = new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, stableBytes),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createAppServices(): AppServices {
  const storage = createExpoVaultStorage(FileSystem as ExpoFileSystemAdapter);
  const searchIndex = createExpoSearchIndex();
  const phase6Store = createExpoPhase6Store();
  const aiStore = createExpoAiStore();
  const aiSecretStore = createExpoAiSecretStore();
  const aiProviderProfiles = createAiProviderProfileManager({
    store: aiStore,
    secrets: aiSecretStore,
    createId: Crypto.randomUUID,
    now: () => new Date(),
  });
  const aiProviders = createAiProviderRegistry(createFetchAiHttpTransport());
  const aiConnectionTester = createAiConnectionTester({
    store: aiStore,
    secrets: aiSecretStore,
    profiles: aiProviderProfiles,
    providers: aiProviders,
  });
  const aiConversations = createAiConversationService({
    store: aiStore,
    secrets: aiSecretStore,
    providers: aiProviders,
    createId: Crypto.randomUUID,
    now: () => new Date(),
  });
  const aiGenies = createAiGenieService({
    store: aiStore,
    secrets: aiSecretStore,
    providers: aiProviders,
  });
  const managedRepository = createPrivateVaultRepository({
    storage,
    createId: createDocumentId,
    hashMarkdown,
  });
  const workspaceCatalog = createWorkspaceCatalogStore(storage);
  const recoveryStore = createPrivateVaultRecoveryStore(storage);
  const historyStore = createPrivateVaultHistoryStore({
    storage,
    createId: Crypto.randomUUID,
    now: () => new Date(),
  });

  async function pickAttachment(): Promise<PickedAttachment | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    const file = new File(asset.uri);
    return Object.freeze({
      name: asset.name,
      mimeType: asset.mimeType ?? file.type ?? null,
      bytes: await file.bytes(),
    });
  }

  async function ensureAdapterParents(
    adapter: ReturnType<typeof createExpoWorkspaceAdapter>,
    path: string,
  ): Promise<boolean> {
    const segments = path.split("/").slice(0, -1);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const parsed = parseWorkspacePath(current);
      if (!parsed.ok) return false;
      const existing = await adapter.stat(parsed.value);
      if (existing.ok) continue;
      if (existing.error.code !== "NOT_FOUND") return false;
      const created = await adapter.createDirectory(parsed.value);
      if (!created.ok) return false;
    }
    return true;
  }

  function adapterAttachmentImporter(
    adapter: ReturnType<typeof createExpoWorkspaceAdapter>,
  ): AttachmentImporter {
    return createAttachmentImporter({
      pick: pickAttachment,
      async exists(path) {
        return (await adapter.stat(path)).ok;
      },
      async write(path, bytes) {
        if (!adapter.createFileBytes || !(await ensureAdapterParents(adapter, path))) return false;
        return (await adapter.createFileBytes(path, bytes)).ok;
      },
    });
  }

  function managedDocumentFile(path: string): File | null {
    const parsed = parseWorkspacePath(path);
    if (!parsed.ok) return null;
    return new File(Paths.document, "vmark-mobile", "documents", ...parsed.value.split("/"));
  }

  const managedAttachmentImporter = createAttachmentImporter({
    pick: pickAttachment,
    async exists(path) {
      return managedDocumentFile(path)?.exists ?? false;
    },
    async write(path, bytes) {
      try {
        const file = managedDocumentFile(path);
        if (!file) return false;
        file.parentDirectory.create({ intermediates: true, idempotent: true });
        file.create({ intermediates: true, overwrite: false });
        file.write(bytes);
        return file.exists && file.size === bytes.byteLength;
      } catch {
        return false;
      }
    },
  });

  const managedAttachmentWorkspace: BackupBinaryWorkspace = Object.freeze({
    async list() {
      const root = new Directory(Paths.document, "vmark-mobile", "documents");
      if (!root.exists) return Object.freeze([]);
      const files: Awaited<ReturnType<BackupBinaryWorkspace["list"]>>[number][] = [];
      async function visit(directory: Directory, prefix: string): Promise<void> {
        for (const entry of directory.list()) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry instanceof Directory) {
            await visit(entry, path);
          } else if (!isEditableTextFormat({ name: entry.name, contentType: entry.type || null })) {
            const contents = await entry.bytes();
            files.push(Object.freeze({ path, contents, revision: await hashBytes(contents) }));
          }
        }
      }
      await visit(root, "");
      return Object.freeze(files);
    },
    async read(path) {
      const file = managedDocumentFile(path);
      if (!file?.exists) throw new Error(path);
      const contents = await file.bytes();
      return Object.freeze({ path, contents, revision: await hashBytes(contents) });
    },
    async create(path, contents) {
      const file = managedDocumentFile(path);
      if (!file || file.exists) throw new Error(path);
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      file.create({ intermediates: true, overwrite: false });
      file.write(contents);
      if (!file.exists || file.size !== contents.byteLength) throw new Error(path);
    },
    async replace(path, contents, expectedRevision) {
      const file = managedDocumentFile(path);
      if (!file?.exists || (await hashBytes(await file.bytes())) !== expectedRevision) {
        throw new Error(path);
      }
      const intendedRevision = await hashBytes(contents);
      file.write(contents);
      if ((await hashBytes(await file.bytes())) !== intendedRevision) {
        throw new Error(path);
      }
    },
    async remove(path) {
      const file = managedDocumentFile(path);
      if (!file?.exists) throw new Error(path);
      file.delete();
    },
  });

  async function readManagedResource(path: string): Promise<string | null> {
    try {
      const file = managedDocumentFile(path);
      if (!file?.exists) return null;
      return bytesToDataUri(await file.bytes(), file.type || null);
    } catch {
      return null;
    }
  }

  function createShare(source: WorkspaceShareSource) {
    return createWorkspaceFileShare({
      source,
      cacheDirectoryUri: Paths.cache.uri,
      createId: Crypto.randomUUID,
      isAvailable: Sharing.isAvailableAsync,
      share: Sharing.shareAsync,
      remove: async (uri) => FileSystem.deleteAsync(uri, { idempotent: true }),
      cleanupExpired: async () => {
        cleanupExpiredShareCache(
          Paths.cache.list().map((entry) =>
            Object.freeze({
              kind: entry instanceof File ? ("file" as const) : ("directory" as const),
              name: entry.name,
              lastModified: entry instanceof File ? entry.lastModified : null,
              delete: () => entry.delete(),
            }),
          ),
          Date.now(),
        );
      },
    });
  }

  const managedShare = createShare(
    createRepositoryShareSource(managedRepository, (uri, contents) =>
      FileSystem.writeAsStringAsync(uri, contents),
    ),
  );
  const now = new Date().toISOString();
  const managedWorkspace: WorkspaceRecord = Object.freeze({
    grant: Object.freeze({
      workspaceId: createWorkspaceId(),
      provider: "managed",
      displayName: MANAGED_WORKSPACE_DEFAULT_NAME,
      locationSummary: MANAGED_WORKSPACE_DEFAULT_LOCATION,
      serializedGrant: "managed://private-vault",
      status: "authorized",
      createdAt: now,
      lastOpenedAt: now,
    }),
    capabilities: Object.freeze({
      read: true,
      write: true,
      atomicReplace: false,
      create: true,
      rename: true,
      move: true,
      copy: true,
      remove: true,
      trash: false,
      watch: false,
      share: true,
    }),
    pinned: false,
  });
  let workspaceGrantService: WorkspaceGrantService | null = null;
  let workspaceManager: WorkspaceManager | null = null;

  function getGrantService(): WorkspaceGrantService {
    workspaceGrantService ??= createExpoWorkspaceGrantService(createWorkspaceId);
    return workspaceGrantService;
  }

  function getWorkspaceManager(): WorkspaceManager {
    workspaceManager ??= createWorkspaceManager({
      catalog: workspaceCatalog,
      grantService: Object.freeze({
        authorize: (initialUri) => getGrantService().authorize(initialUri),
        restore: (grant) => getGrantService().restore(grant),
      }),
      capabilitiesFor: () => LINKED_CAPABILITIES,
    });
    return workspaceManager;
  }

  function linkedWorkspaceServices(record: WorkspaceRecord): Readonly<{
    repository: WorkspaceRepository;
    browser: WorkspaceBrowser;
    binaryWorkspace: BackupBinaryWorkspace;
    readWorkspaceResource: (path: string) => Promise<string | null>;
    attachmentImporter: AttachmentImporter;
  }> {
    if (record.grant.status !== "authorized") {
      throw new Error("Workspace access must be restored before activation");
    }
    const runtimeUri = workspaceGrantRuntimeUri(record.grant);
    if (runtimeUri === null) throw new Error("The linked workspace grant is invalid");
    const adapter = createExpoWorkspaceAdapter(
      new Directory(runtimeUri),
      record.grant,
      record.capabilities,
      hashMarkdown,
    );
    const share = createShare(createAdapterShareSource(adapter.exportFile));
    return Object.freeze({
      repository: createWorkspaceAdapterRepository({
        adapter,
        deriveDocumentId: (workspaceId, path) =>
          deriveWorkspaceDocumentId(workspaceId, path, hashMarkdown),
        includeFile: isEditableTextFormat,
      }),
      browser: createAdapterWorkspaceBrowser({ adapter, share: share.share }),
      binaryWorkspace: createAdapterBackupWorkspace(adapter),
      attachmentImporter: adapterAttachmentImporter(adapter),
      async readWorkspaceResource(path) {
        const parsed = parseWorkspacePath(path);
        if (!parsed.ok || !adapter.readBytes) return null;
        const result = await adapter.readBytes(parsed.value);
        if (!result.ok) return null;
        try {
          return bytesToDataUri(result.value.content, result.value.contentType);
        } catch {
          return null;
        }
      },
    });
  }

  function buildManagedServices(record: WorkspaceRecord): AppServices {
    return buildWorkspaceServices(
      managedRepository,
      createManagedWorkspaceBrowser({
        repository: managedRepository,
        directoryStore: createWorkspaceDirectoryStore(storage, record.grant.workspaceId),
        share: managedShare.share,
      }),
      record,
      recoveryStore,
      historyStore,
      createFileActivityStore(storage, record.grant.workspaceId),
      createCompositeBackupWorkspace(managedRepository, managedAttachmentWorkspace, (path) =>
        isEditableTextFormat({ name: path.split("/").at(-1) ?? path, contentType: null }),
      ),
      readManagedResource,
      managedAttachmentImporter,
    );
  }

  function buildWorkspaceServices(
    repository: WorkspaceRepository,
    browser: WorkspaceBrowser,
    activeWorkspace: WorkspaceRecord,
    selectedRecoveryStore: RecoveryDraftStore,
    selectedHistoryStore: HistoryStore,
    selectedFileActivityStore: FileActivityStore,
    binaryWorkspace?: BackupBinaryWorkspace,
    readWorkspaceResource: (path: string) => Promise<string | null> = async () => null,
    attachmentImporter: AttachmentImporter = managedAttachmentImporter,
  ): AppServices {
    const workspaceId = activeWorkspace.grant.workspaceId;
    const indexedRepository: IndexedWorkspaceRepository = createIndexedWorkspaceRepository(
      repository,
      searchIndex,
      workspaceId,
    );
    const indexedHistoryStore = createIndexedHistoryStore(
      selectedHistoryStore,
      searchIndex,
      workspaceId,
    );
    const backupService = createBackupService({
      repository: indexedRepository,
      ...(binaryWorkspace ? { binaryWorkspace } : {}),
      createId: Crypto.randomUUID,
      now: () => new Date(),
      sha256: hashBytes,
    });
    const workspaceSearch = createWorkspaceSearch(
      searchIndex,
      selectedFileActivityStore,
      indexedRepository,
      workspaceId,
      phase6Store,
    );
    const backupFiles = createExpoBackupFiles(backupService, {
      now: () => new Date(),
      createId: Crypto.randomUUID,
      store: phase6Store,
      sha256: hashBytes,
    });
    const automaticBackup = createAutomaticBackupManager({
      workspaceId,
      service: backupService,
      store: phase6Store,
      configStore: createAutomaticBackupConfigStore(storage, workspaceId),
      sha256: hashBytes,
    });
    const settingsStore = createSettingsStore(storage);
    async function shareDrawingExport(
      name: string,
      format: "png" | "svg",
      contents: string,
    ): Promise<boolean> {
      if (!(await Sharing.isAvailableAsync())) return false;
      const safeName =
        name
          .replace(/\.excalidraw(?:\.md)?$/i, "")
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "") || "drawing";
      const uri = `${Paths.cache.uri}mira-drawing-${Crypto.randomUUID()}-${safeName}.${format}`;
      try {
        await FileSystem.writeAsStringAsync(uri, contents, {
          encoding:
            format === "png" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(uri, {
          dialogTitle: `Share ${safeName}.${format}`,
          mimeType: format === "png" ? "image/png" : "image/svg+xml",
          ...(format === "png" ? { UTI: "public.png" } : { UTI: "public.svg-image" }),
        });
        return true;
      } catch {
        return false;
      } finally {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    }
    const aiAutomations = createAiAutomationRunner({
      store: aiStore,
      secrets: aiSecretStore,
      providers: aiProviders,
      repository: indexedRepository,
      search: workspaceSearch,
      settings: settingsStore,
      workspaceId,
      createId: Crypto.randomUUID,
      now: () => new Date(),
    });
    const services: AppServices = {
      repository: indexedRepository,
      browser,
      activeWorkspace,
      managedWorkspace,
      workspaceCatalog,
      get workspaceGrantService() {
        return getGrantService();
      },
      get workspaceManager() {
        return getWorkspaceManager();
      },
      recoveryStore: selectedRecoveryStore,
      historyStore: indexedHistoryStore,
      fileActivityStore: selectedFileActivityStore,
      searchIndex,
      workspaceSearch,
      phase6Store,
      aiStore,
      aiSecretStore,
      aiProviderProfiles,
      aiProviders,
      aiConnectionTester,
      aiConversations,
      aiGenies,
      aiAutomations,
      backupService,
      backupFiles,
      automaticBackup,
      settingsStore,
      attachmentImporter,
      readWorkspaceResource,
      shareDrawingExport,
      async synchronizeSearchIndex() {
        await searchIndex.initialize();
        await phase6Store.initialize();
        await aiStore.initialize();
        await phase6Store.upsertWorkspace(activeWorkspace);
        await indexedRepository.synchronizeSearchIndex();
        const listed = await indexedRepository.list();
        if (!listed.ok) throw new Error("Workspace history could not be indexed");
        await synchronizeHistoryIndex(
          selectedHistoryStore,
          searchIndex,
          workspaceId,
          listed.value.map((document) => document.documentId),
        );
      },
      createDocumentId,
      createSessionId,
      activateWorkspace(record) {
        if (record.grant.provider === "managed") return buildManagedServices(record);
        const linked = linkedWorkspaceServices(record);
        const scopedStorage = createScopedVaultStorage(
          storage,
          `workspace-state/${record.grant.workspaceId}`,
        );
        return buildWorkspaceServices(
          linked.repository,
          linked.browser,
          record,
          createPrivateVaultRecoveryStore(scopedStorage),
          createPrivateVaultHistoryStore({
            storage: scopedStorage,
            createId: Crypto.randomUUID,
            now: () => new Date(),
          }),
          createFileActivityStore(storage, record.grant.workspaceId),
          linked.binaryWorkspace,
          linked.readWorkspaceResource,
          linked.attachmentImporter,
        );
      },
    };
    return Object.freeze(services);
  }

  return buildManagedServices(managedWorkspace);
}

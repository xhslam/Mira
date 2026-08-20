declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | readonly string[];
  }
}

// Excalidraw otherwise falls back to its public CDN. Native release/export scripts place the
// complete font tree beside the DOM entry, so every bundled font remains available offline.
if (typeof window !== "undefined") {
  window.EXCALIDRAW_ASSET_PATH = new URL("./", window.location.href).toString();
}

export {};

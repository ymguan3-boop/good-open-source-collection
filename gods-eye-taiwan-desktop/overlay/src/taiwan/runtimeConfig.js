
export async function readRuntimeConfig() {
  try {
    if (!globalThis.__TAURI_INTERNALS__) return {};
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('browser_provider_keys');
  } catch (error) {
    console.warn('[TW] Unable to read desktop provider config', error);
    return {};
  }
}

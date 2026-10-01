
export async function readRuntimeConfig() {
  try {
    if (!globalThis.__TAURI_INTERNALS__) {
      const response = await fetch('/api/taiwan/ai/runtime',{cache:'no-store'});
      if (!response.ok) return {};
      return await response.json();
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('browser_provider_keys');
  } catch (error) {
    console.warn('[TW] Unable to read desktop provider config', error);
    return {};
  }
}

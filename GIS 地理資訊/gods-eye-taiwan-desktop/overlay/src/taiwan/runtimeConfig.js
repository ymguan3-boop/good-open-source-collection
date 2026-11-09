export async function readRuntimeConfig() {
  try {
    const response = await fetch('/api/taiwan/ai/runtime', { cache:'no-store' });
    if (!response.ok) return {};
    return await response.json();
  } catch (error) {
    console.warn('[TW] Unable to read local browser provider config', error);
    return {};
  }
}

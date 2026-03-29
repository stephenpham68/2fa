export interface ExtensionStorage {
  secrets: string[];
  viewMode: 'list' | 'grid';
  theme: 'light' | 'dark';
}

const DEFAULTS: ExtensionStorage = {
  secrets: [],
  viewMode: 'list',
  theme: 'dark',
};

export async function loadStorage(): Promise<ExtensionStorage> {
  const keys = Object.keys(DEFAULTS) as (keyof ExtensionStorage)[];
  const result = await chrome.storage.local.get(keys);
  return { ...DEFAULTS, ...result } as ExtensionStorage;
}

export async function saveStorage(update: Partial<ExtensionStorage>): Promise<void> {
  await chrome.storage.local.set(update);
}

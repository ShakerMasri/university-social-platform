// Permission-free test worker; no content scripts, network or persistent storage.
globalThis.chrome.runtime.onInstalled.addListener(() => {});

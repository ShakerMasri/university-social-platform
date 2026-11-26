// This same-origin notification contains no account or session information.
const channelName = "usp-session-change";
const message = "changed";

function sessionChannel() {
  try { return new BroadcastChannel(channelName); }
  catch { return null; }
}

export function announceSessionChange() {
  const channel = sessionChannel();
  if (!channel) return;
  try { channel.postMessage(message); }
  catch { /* Feed requests still check the current session on the server. */ }
  finally { channel.close(); }
}

export function onSessionChange(listener: () => void) {
  const channel = sessionChannel();
  channel?.addEventListener("message", event => {
    if (event.data === message) listener();
  });
  return () => channel?.close();
}

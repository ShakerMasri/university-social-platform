// Same-page signals from a page to the app shell header. The shared (app)
// layout is not re-rendered on client navigation, so a page that changes what
// the header shows tells it directly instead of refreshing the whole route.
// Only this tab hears them; a full load or router.refresh() brings the
// server's values again.
const notificationReadEvent = "usp:notification-read";
const displayNameEvent = "usp:display-name";

/** An unread notification was just marked read by opening it. */
export function announceNotificationRead() {
  window.dispatchEvent(new Event(notificationReadEvent));
}

export function onNotificationRead(listener: () => void) {
  window.addEventListener(notificationReadEvent, listener);
  return () => window.removeEventListener(notificationReadEvent, listener);
}

/** The signed-in user saved a new display name. */
export function announceDisplayName(name: string) {
  window.dispatchEvent(new CustomEvent<string>(displayNameEvent, { detail: name }));
}

export function onDisplayName(listener: (name: string) => void) {
  const handler = (event: Event) => {
    const name = (event as CustomEvent<unknown>).detail;
    if (typeof name === "string") listener(name);
  };
  window.addEventListener(displayNameEvent, handler);
  return () => window.removeEventListener(displayNameEvent, handler);
}

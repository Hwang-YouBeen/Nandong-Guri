chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "focus-nandong-tab" || !sender.tab?.id) return;

  const tabId = sender.tab.id;
  const windowId = sender.tab.windowId;
  const userAgent = navigator.userAgent;
  const browser =
    userAgent.includes("Edg/")
      ? "edge"
      : userAgent.includes("OPR/")
        ? "opera"
        : userAgent.includes("Chrome/")
          ? "chrome"
          : "unknown";
  Promise.all([
    chrome.windows.update(windowId, { focused: true }),
    chrome.tabs.update(tabId, { active: true }),
  ])
    .then(async () => {
      try {
        await fetch("http://127.0.0.1:43119/focus-ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: message.requestId, browser }),
        });
      } catch {
        // The desktop app may have already dismissed the request.
      }
      sendResponse({ ok: true });
    })
    .catch(() => sendResponse({ ok: false }));

  return true;
});

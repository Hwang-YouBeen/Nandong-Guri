const BRIDGE = "http://127.0.0.1:43119";
const service = location.hostname.includes("gemini") ? "Gemini" : "ChatGPT";
let wasGenerating = false;
let lastCompletionAt = 0;
let pendingCompletion = false;
let answerSnapshot = "";
let answerChangedAt = 0;
let answerChangePending = false;
let answerTrackingReady = false;
const completedAnswerNodes = new WeakSet();

const chatGptGenerating = () =>
  Boolean(
    document.querySelector(
      'button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="중지"]',
    ),
  );

const geminiGenerating = () =>
  Boolean(
    document.querySelector(
      [
        'button[data-test-id*="stop"]',
        'button[aria-label*="Stop"]',
        'button[aria-label*="stop"]',
        'button[aria-label*="중지"]',
        '[role="button"][aria-label*="Stop"]',
        '[role="button"][aria-label*="중지"]',
        ".stop-button",
        "[data-is-streaming='true']",
        "model-response.streaming",
      ].join(","),
    ),
  );

const isGenerating = () =>
  service === "Gemini" ? geminiGenerating() : chatGptGenerating();

const latestAnswerNode = () => {
  const selectors =
    service === "Gemini"
      ? [
          "model-response .markdown",
          "model-response message-content",
          "model-response",
          "[data-message-author-role='model']",
          ".model-response-text",
          ".response-container",
        ]
      : ['[data-message-author-role="assistant"]', "article"];
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    if (nodes.length) {
      return nodes[nodes.length - 1];
    }
  }
  return null;
};

const visibleAnswerText = () => latestAnswerNode()?.textContent?.trim() ?? "";

async function post(path, payload = {}) {
  try {
    await fetch(`${BRIDGE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // The desktop app may not be running yet.
  }
}

function announceExtension() {
  post("/extension-ping", {
    service,
    url: location.href,
  });
}

announceExtension();
window.setInterval(announceExtension, 5000);

const normalizeAnswerUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.origin}${url.pathname}${url.search}`.replace(/\/$/, "");
  } catch {
    return value;
  }
};

let lastFocusRequest = 0;
async function checkFocusRequest() {
  try {
    const response = await fetch(`${BRIDGE}/focus-request`);
    const request = await response.json();
    if (!request.requested || request.requestId === lastFocusRequest) return;
    if (normalizeAnswerUrl(request.url) !== normalizeAnswerUrl(location.href)) return;
    lastFocusRequest = request.requestId;
    chrome.runtime.sendMessage({
      type: "focus-nandong-tab",
      requestId: request.requestId,
    });
  } catch {
    // The desktop app may not be running yet.
  }
}

checkFocusRequest();
window.setInterval(checkFocusRequest, 700);

async function announceCompletion() {
  const now = Date.now();
  const answerNode = latestAnswerNode();
  if (
    now - lastCompletionAt < 2500 ||
    !answerNode?.textContent?.trim() ||
    completedAnswerNodes.has(answerNode)
  ) {
    return;
  }
  lastCompletionAt = now;
  answerChangePending = false;
  completedAnswerNodes.add(answerNode);
  pendingCompletion = true;
  await post("/complete", {
    service,
    url: location.href,
    title: document.title,
    alreadyViewing:
      document.visibilityState === "visible" && document.hasFocus(),
  });
}

const observer = new MutationObserver(() => {
  const generating = isGenerating();
  if (generating) wasGenerating = true;

  const currentAnswer = visibleAnswerText();
  if (
    answerTrackingReady &&
    currentAnswer &&
    currentAnswer !== answerSnapshot
  ) {
    answerSnapshot = currentAnswer;
    answerChangedAt = Date.now();
    answerChangePending = true;
  }

  if (wasGenerating && !generating) {
    wasGenerating = false;
    window.setTimeout(announceCompletion, 900);
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["aria-label", "disabled"],
});

window.setTimeout(() => {
  answerSnapshot = visibleAnswerText();
  answerTrackingReady = true;
}, 1000);

window.setInterval(() => {
  if (
    service !== "Gemini" ||
    !answerTrackingReady ||
    !answerChangePending ||
    isGenerating() ||
    Date.now() - answerChangedAt < 1800
  ) {
    return;
  }
  announceCompletion();
}, 500);

const reportViewed = () => {
  if (!pendingCompletion || document.visibilityState !== "visible" || !document.hasFocus()) {
    return;
  }
  pendingCompletion = false;
  post("/viewed", { service, url: location.href });
};

document.addEventListener("visibilitychange", reportViewed);
window.addEventListener("focus", reportViewed);

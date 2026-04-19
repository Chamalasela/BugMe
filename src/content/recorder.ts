import { browser } from '../shared/browser';
import type { Message, UserAction, ActionType, BrowserInfo, RecordingState } from '../shared/types';

let isRecording = false;
let isListening = false;
let highlightOverlay: HTMLElement | null = null;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getCssSelector(el: Element): string {
  if (el.id) return '#' + CSS.escape(el.id);
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = '#' + CSS.escape(current.id);
      parts.unshift(selector);
      break;
    }
    const siblings = Array.from(current.parentElement?.children ?? []).filter(
      (c) => c.tagName === current!.tagName
    );
    if (siblings.length > 1) {
      selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function getLabel(el: Element): string {
  const input = el as HTMLInputElement;
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return label.textContent?.trim() ?? '';
  }
  return (
    input.getAttribute('aria-label') ??
    input.getAttribute('placeholder') ??
    input.getAttribute('name') ??
    input.tagName.toLowerCase()
  );
}

function getElementDescription(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel.slice(0, 60);

  const title = el.getAttribute('title')?.trim();
  if (title) return title.slice(0, 60);

  // Prefer direct (non-nested) text so we don't grab all descendant text
  const directText = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (directText) return directText.slice(0, 60);

  const text = el.textContent?.trim();
  if (text) return text.slice(0, 60);

  const role = el.getAttribute('role');
  if (role) return `${role} element`;
  return el.tagName.toLowerCase();
}

function buildNaturalLanguage(type: ActionType, label: string, urlPath: string, pageTitle: string): string {
  const page = pageTitle || urlPath;
  switch (type) {
    case 'click':
      return `Clicked '${label}'`;
    case 'input':
      return `Typed in '${label}' field`;
    case 'navigate':
      return `Navigated to ${page}`;
    case 'scroll':
      return `Scrolled on ${page}`;
  }
}

function sendAction(partial: { type: ActionType; label: string; selector?: string; value?: string }): void {
  const urlPath = window.location.pathname;
  const pageTitle = document.title;
  const action: UserAction = {
    id: generateId(),
    type: partial.type,
    timestamp: Date.now(),
    url: window.location.href,
    urlPath,
    pageTitle,
    label: partial.label,
    naturalLanguage: buildNaturalLanguage(partial.type, partial.label, urlPath, pageTitle),
    selector: partial.selector,
    value: partial.value,
  };
  const message: Message = { type: 'ADD_ACTION', payload: action };
  browser.runtime.sendMessage(message).catch(() => {});
}

function onClickCapture(e: MouseEvent): void {
  if (!isRecording) return;
  const target = e.target as Element;
  if (!target) return;
  sendAction({ type: 'click', label: getElementDescription(target), selector: getCssSelector(target) });
  flashHighlight(target);
}

function onInputCapture(e: Event): void {
  if (!isRecording) return;
  const target = e.target as HTMLInputElement;
  if (!target) return;
  const isPassword = target.type === 'password';
  const value = isPassword ? '••••••••' : target.value;
  const label = getLabel(target);
  sendAction({ type: 'input', label, selector: getCssSelector(target), value });
}

function onNavigate(): void {
  if (!isRecording) return;
  sendAction({ type: 'navigate', label: document.title || window.location.pathname });
}

let scrollTimer: ReturnType<typeof setTimeout> | null = null;
function onScrollCapture(): void {
  if (!isRecording) return;
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    scrollTimer = null;
    sendAction({ type: 'scroll', label: document.title || window.location.pathname });
  }, 500);
}

function flashHighlight(el: Element): void {
  if (highlightOverlay) highlightOverlay.remove();
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border: 2px solid #0A5E58;
    border-radius: 3px;
    background: rgba(10,94,88,0.1);
    pointer-events: none;
    z-index: 2147483647;
    transition: opacity 0.4s;
  `;
  document.body.appendChild(overlay);
  highlightOverlay = overlay;
  setTimeout(() => { overlay.style.opacity = '0'; }, 300);
  setTimeout(() => { overlay.remove(); if (highlightOverlay === overlay) highlightOverlay = null; }, 700);
}

// Patch history methods once so SPA pushState/replaceState navigation is captured
const _pushState = history.pushState.bind(history);
const _replaceState = history.replaceState.bind(history);
history.pushState = (...args) => { _pushState(...args); onNavigate(); };
history.replaceState = (...args) => { _replaceState(...args); onNavigate(); };

function attachListeners(): void {
  if (isListening) return;
  isListening = true;
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('change', onInputCapture, true);
  document.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
  window.addEventListener('popstate', onNavigate);
  window.addEventListener('hashchange', onNavigate);
}

function detachListeners(): void {
  if (!isListening) return;
  isListening = false;
  document.removeEventListener('click', onClickCapture, true);
  document.removeEventListener('change', onInputCapture, true);
  document.removeEventListener('scroll', onScrollCapture, true);
  window.removeEventListener('popstate', onNavigate);
  window.removeEventListener('hashchange', onNavigate);
}

function applyState(state: { isRecording: boolean; isPaused: boolean } | undefined): void {
  const shouldRecord = !!state?.isRecording && !state?.isPaused;
  if (shouldRecord && !isRecording) {
    isRecording = true;
    attachListeners();
    onNavigate();
  } else if (!shouldRecord && isRecording) {
    isRecording = false;
    detachListeners();
  }
}

// Primary sync: watch session storage directly — fires reliably even when message delivery fails
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes.recordingState) return;
  applyState(changes.recordingState.newValue as RecordingState | undefined);
});

// Initial sync: fetch current state on script load, with retries in case the service worker is waking up
function syncStateWithRetry(attemptsLeft: number): void {
  browser.runtime.sendMessage({ type: 'GET_STATE' }).then((raw) => {
    applyState(raw as RecordingState | undefined);
  }).catch(() => {
    if (attemptsLeft > 0) {
      setTimeout(() => syncStateWithRetry(attemptsLeft - 1), 250);
    }
  });
}
syncStateWithRetry(4);

// Listen for messages from service worker
browser.runtime.onMessage.addListener(((raw: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
  const msg = raw as Message;

  if (msg.type === 'STATE_UPDATE') {
    applyState(msg.payload as RecordingState | undefined);
    return true;
  }

  if (msg.type === 'COLLECT_BROWSER_INFO') {
    const info: BrowserInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      screenWidth: screen.width,
      screenHeight: screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      language: navigator.language,
      url: window.location.href,
    };
    sendResponse(info);
    return true;
  }

  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return true;
  }

  return true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any);

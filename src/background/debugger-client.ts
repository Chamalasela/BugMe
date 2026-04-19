import type { ConsoleEntry, NetworkEntry } from '../shared/types';

const CONSOLE_CAP = 500;
const NETWORK_CAP = 200;

interface CdpConsoleApiCalled {
  type: string;
  args: { type: string; value?: unknown; description?: string }[];
  timestamp: number;
  stackTrace?: { callFrames: { url: string; lineNumber: number }[] };
}

interface CdpNetworkRequestWillBeSent {
  requestId: string;
  request: { method: string; url: string };
  timestamp: number;
}

interface CdpNetworkResponseReceived {
  requestId: string;
  response: { status: number; mimeType: string; url: string };
  timestamp: number;
}

interface CdpNetworkLoadingFailed {
  requestId: string;
  errorText: string;
  timestamp: number;
}

let attachedTabId: number | null = null;
const consoleEntries: ConsoleEntry[] = [];
const networkRequests = new Map<string, {
  method: string;
  url: string;
  requestTimestamp: number;
}>();
const networkEntries: NetworkEntry[] = [];
let consoleErrorCount = 0;
let networkFailCount = 0;
let countsChangedCallback: ((errCount: number, failCount: number) => void) | null = null;

export function setCountsChangedCallback(cb: (errCount: number, failCount: number) => void): void {
  countsChangedCallback = cb;
}

export async function attachDebugger(tabId: number): Promise<void> {
  if (attachedTabId !== null) {
    await detachDebugger();
  }

  consoleEntries.length = 0;
  networkRequests.clear();
  networkEntries.length = 0;
  consoleErrorCount = 0;
  networkFailCount = 0;
  attachedTabId = tabId;

  await chrome.debugger.attach({ tabId }, '1.3');
  await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable', {});
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {});
}

export async function detachDebugger(): Promise<{ consoleEntries: ConsoleEntry[]; networkEntries: NetworkEntry[] }> {
  if (attachedTabId === null) return { consoleEntries: [], networkEntries: [] };

  const tabId = attachedTabId;
  attachedTabId = null;

  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Tab may have been closed; ignore
  }

  // Finalize any pending requests that never got a response
  for (const [reqId, partial] of networkRequests.entries()) {
    networkEntries.push({
      requestId: reqId,
      method: partial.method,
      url: partial.url,
      status: null,
      mimeType: '',
      duration: 0,
      failed: true,
      requestTimestamp: partial.requestTimestamp,
    });
  }
  networkRequests.clear();

  return {
    consoleEntries: [...consoleEntries],
    networkEntries: [...networkEntries],
  };
}

export function handleDebuggerEvent(
  source: ChromeDebuggerDebuggee,
  method: string,
  params: unknown
): void {
  if (source.tabId !== attachedTabId) return;

  if (method === 'Runtime.consoleAPICalled') {
    if (consoleEntries.length >= CONSOLE_CAP) return;
    const p = params as CdpConsoleApiCalled;
    const text = p.args
      .map((a) => (a.value !== undefined ? String(a.value) : (a.description ?? '')))
      .join(' ');

    // CDP uses 'warning' but our type uses 'warn'
    const rawLevel = p.type === 'warning' ? 'warn' : p.type;
    const level = (['log', 'info', 'warn', 'error', 'debug'].includes(rawLevel)
      ? rawLevel
      : 'log') as ConsoleEntry['level'];

    const entry: ConsoleEntry = {
      level,
      text,
      timestamp: Math.round(p.timestamp * 1000),
      url: p.stackTrace?.callFrames[0]?.url,
      lineNumber: p.stackTrace?.callFrames[0]?.lineNumber,
    };
    consoleEntries.push(entry);

    if (level === 'error' || level === 'warn') {
      consoleErrorCount++;
      countsChangedCallback?.(consoleErrorCount, networkFailCount);
    }
    return;
  }

  if (method === 'Network.requestWillBeSent') {
    if (networkEntries.length + networkRequests.size >= NETWORK_CAP) return;
    const p = params as CdpNetworkRequestWillBeSent;
    networkRequests.set(p.requestId, {
      method: p.request.method,
      url: p.request.url,
      requestTimestamp: Math.round(p.timestamp * 1000),
    });
    return;
  }

  if (method === 'Network.responseReceived') {
    const p = params as CdpNetworkResponseReceived;
    const partial = networkRequests.get(p.requestId);
    if (!partial) return;
    networkRequests.delete(p.requestId);

    const failed = p.response.status >= 400;
    const entry: NetworkEntry = {
      requestId: p.requestId,
      method: partial.method,
      url: p.response.url,
      status: p.response.status,
      mimeType: p.response.mimeType,
      duration: Math.max(0, Math.round(p.timestamp * 1000) - partial.requestTimestamp),
      failed,
      requestTimestamp: partial.requestTimestamp,
    };
    networkEntries.push(entry);

    if (failed) {
      networkFailCount++;
      countsChangedCallback?.(consoleErrorCount, networkFailCount);
    }
    return;
  }

  if (method === 'Network.loadingFailed') {
    const p = params as CdpNetworkLoadingFailed;
    const partial = networkRequests.get(p.requestId);
    if (!partial) return;
    networkRequests.delete(p.requestId);

    networkEntries.push({
      requestId: p.requestId,
      method: partial.method,
      url: partial.url,
      status: null,
      mimeType: '',
      duration: 0,
      failed: true,
      errorText: p.errorText,
      requestTimestamp: partial.requestTimestamp,
    });
    networkFailCount++;
    countsChangedCallback?.(consoleErrorCount, networkFailCount);
  }
}

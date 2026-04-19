import {
  getRecordingState,
  setRecordingState,
  getAllBugReports,
  saveBugReport,
  deleteBugReport,
  getADOConfig,
} from '../shared/storage';
import {
  getProjects,
  getAreaPaths,
  getIterationPaths,
  exportAsBug,
} from '../shared/ado-client';
import { saveScreenshot, getScreenshots, deleteScreenshots } from '../shared/screenshot-db';
import {
  attachDebugger,
  detachDebugger,
  handleDebuggerEvent,
  setCountsChangedCallback,
} from './debugger-client';
import { browser } from '../shared/browser';
import type { Message, BugReport, UserAction, RecordingState, BugSubmitOptions, BrowserInfo } from '../shared/types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function broadcastStateToTabs(state: RecordingState): Promise<void> {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      browser.tabs.sendMessage(tab.id, { type: 'STATE_UPDATE', payload: state }).catch(() => {});
    }
  }
}

async function ensureContentScriptInActiveTab(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'PING' });
    } catch {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-recorder.js'],
      });
    }
  } catch {
    // Tab doesn't support scripting
  }
}

// --- Debugger event wiring (registered once at startup) ---

chrome.debugger.onEvent.addListener(handleDebuggerEvent);

chrome.debugger.onDetach.addListener((_source, reason) => {
  if (reason === 'target_closed') {
    detachDebugger().catch(() => {});
  }
});

setCountsChangedCallback(async (errCount, failCount) => {
  const state = await getRecordingState();
  if (!state.isRecording) return;
  const updated: RecordingState = { ...state, consoleErrorCount: errCount, networkFailCount: failCount };
  await setRecordingState(updated);
  await broadcastStateToTabs(updated);
});

// -----------

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg as Message).then(sendResponse).catch((err) => sendResponse({ error: String(err) }));
  return true;
});

async function handleMessage(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case 'GET_STATE':
      return getRecordingState();

    case 'START_BUG_REPORT': {
      const { title } = (msg.payload ?? {}) as { title?: string };
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab found');

      const report: BugReport = {
        id: generateId(),
        title: title?.trim() || `Bug Report ${new Date().toLocaleString()}`,
        actions: [],
        screenshotIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveBugReport(report);

      try {
        await attachDebugger(activeTab.id);
      } catch (e) {
        console.warn('BugMe: failed to attach debugger:', e);
      }

      const state: RecordingState = {
        isRecording: true,
        isPaused: false,
        activeBugId: report.id,
        actionCount: 0,
        screenshotCount: 0,
        consoleErrorCount: 0,
        networkFailCount: 0,
      };
      await setRecordingState(state);
      await ensureContentScriptInActiveTab();
      await broadcastStateToTabs(state);
      browser.action.setBadgeText({ text: 'REC' });
      browser.action.setBadgeBackgroundColor({ color: '#EF4444' });
      return state;
    }

    case 'STOP_BUG_REPORT': {
      // Collect debugger data
      const { consoleEntries, networkEntries } = await detachDebugger();

      // Collect browser info from content script
      let browserInfo: BrowserInfo | undefined;
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const raw = await browser.tabs.sendMessage(tab.id, { type: 'COLLECT_BROWSER_INFO' });
          browserInfo = raw as BrowserInfo;
        }
      } catch {
        // Content script may not be available
      }

      const state = await getRecordingState();
      const bugId = state.activeBugId;

      if (bugId) {
        const all = await getAllBugReports();
        const report = all.find((r) => r.id === bugId);
        if (report) {
          await saveBugReport({
            ...report,
            consoleEntries,
            networkEntries,
            browserInfo,
            updatedAt: Date.now(),
          });
        }
      }

      const newState: RecordingState = {
        isRecording: false,
        isPaused: false,
        activeBugId: null,
        actionCount: 0,
        screenshotCount: 0,
        consoleErrorCount: 0,
        networkFailCount: 0,
      };
      await setRecordingState(newState);
      await broadcastStateToTabs(newState);
      browser.action.setBadgeText({ text: '' });
      return { bugId };
    }

    case 'PAUSE_RECORDING': {
      const current = await getRecordingState();
      const updated: RecordingState = { ...current, isPaused: !current.isPaused };
      await setRecordingState(updated);
      await broadcastStateToTabs(updated);
      browser.action.setBadgeText({ text: updated.isPaused ? 'PAU' : 'REC' });
      browser.action.setBadgeBackgroundColor({ color: updated.isPaused ? '#D97706' : '#EF4444' });
      return updated;
    }

    case 'ADD_ACTION': {
      const action = msg.payload as UserAction;
      const state = await getRecordingState();
      if (!state.isRecording || state.isPaused || !state.activeBugId) return null;

      const all = await getAllBugReports();
      const report = all.find((r) => r.id === state.activeBugId);
      if (!report) return null;

      report.actions.push(action);
      report.updatedAt = Date.now();
      await saveBugReport(report);

      const newState: RecordingState = { ...state, actionCount: report.actions.length };
      await setRecordingState(newState);
      await broadcastStateToTabs(newState);
      return newState;
    }

    case 'TAKE_SCREENSHOT': {
      const state = await getRecordingState();
      if (!state.isRecording || !state.activeBugId) throw new Error('Not recording');

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.windowId) throw new Error('No active tab');

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

      const screenshotId = generateId();
      await saveScreenshot({
        id: screenshotId,
        bugId: state.activeBugId,
        dataUrl,
        url: tab.url ?? '',
        timestamp: Date.now(),
      });

      const all = await getAllBugReports();
      const report = all.find((r) => r.id === state.activeBugId);
      if (report) {
        await saveBugReport({
          ...report,
          screenshotIds: [...report.screenshotIds, screenshotId],
          updatedAt: Date.now(),
        });
      }

      const updatedState: RecordingState = { ...state, screenshotCount: state.screenshotCount + 1 };
      await setRecordingState(updatedState);
      await broadcastStateToTabs(updatedState);
      return { ok: true, screenshotId };
    }

    case 'DELETE_BUG': {
      const { bugId } = msg.payload as { bugId: string };
      await deleteBugReport(bugId);
      await deleteScreenshots(bugId);
      return { ok: true };
    }

    case 'SUBMIT_BUG': {
      const config = await getADOConfig();
      if (!config) throw new Error('ADO not configured');
      const { bugId, opts } = msg.payload as { bugId: string; opts: BugSubmitOptions };

      const all = await getAllBugReports();
      const report = all.find((r) => r.id === bugId);
      if (!report) throw new Error('Bug report not found');

      const screenshotRecords = await getScreenshots(bugId);
      const screenshots: Blob[] = await Promise.all(
        screenshotRecords.map(async (s) => {
          const res = await fetch(s.dataUrl);
          return res.blob();
        })
      );

      const url = await exportAsBug(config, {
        title: opts.title?.trim() || report.title,
        project: opts.project,
        areaPath: opts.areaPath,
        iterationPath: opts.iterationPath,
        actions: report.actions,
        screenshots,
        consoleEntries: report.consoleEntries ?? [],
        networkEntries: report.networkEntries ?? [],
        browserInfo: report.browserInfo,
      });

      await saveBugReport({ ...report, submittedUrl: url, submittedAt: Date.now() });
      return url;
    }

    case 'FETCH_ADO_PROJECTS': {
      const config = await getADOConfig();
      if (!config) throw new Error('ADO not configured');
      return getProjects(config);
    }

    case 'FETCH_ADO_AREA_PATHS': {
      const config = await getADOConfig();
      if (!config) throw new Error('ADO not configured');
      const { project } = msg.payload as { project: string };
      return getAreaPaths(config, project);
    }

    case 'FETCH_ADO_ITERATION_PATHS': {
      const config = await getADOConfig();
      if (!config) throw new Error('ADO not configured');
      const { project } = msg.payload as { project: string };
      return getIterationPaths(config, project);
    }

    default:
      return null;
  }
}

// Keyboard shortcut: Alt+Shift+R toggles recording
browser.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-recording') {
    const state = await getRecordingState();
    if (!state.isRecording) {
      await handleMessage({ type: 'START_BUG_REPORT', payload: { title: '' } });
    } else {
      await handleMessage({ type: 'STOP_BUG_REPORT' });
    }
  }
});

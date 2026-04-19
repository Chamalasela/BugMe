import type { ADOConfig, BugReport, RecordingState } from './types';
import { browser } from './browser';

export async function getADOConfig(): Promise<ADOConfig | null> {
  const result = await browser.storage.local.get('adoConfig');
  return (result.adoConfig as ADOConfig) ?? null;
}

export async function setADOConfig(config: ADOConfig): Promise<void> {
  await browser.storage.local.set({ adoConfig: config });
}

export async function getAllBugReports(): Promise<BugReport[]> {
  const result = await browser.storage.local.get('bugReports');
  return (result.bugReports as BugReport[]) ?? [];
}

export async function saveBugReport(report: BugReport): Promise<void> {
  const all = await getAllBugReports();
  const idx = all.findIndex((r) => r.id === report.id);
  if (idx >= 0) {
    all[idx] = report;
  } else {
    all.push(report);
  }
  await browser.storage.local.set({ bugReports: all });
}

export async function deleteBugReport(id: string): Promise<void> {
  const all = await getAllBugReports();
  await browser.storage.local.set({ bugReports: all.filter((r) => r.id !== id) });
}

export async function deleteSubmittedBugReports(): Promise<void> {
  const all = await getAllBugReports();
  await browser.storage.local.set({ bugReports: all.filter((r) => !r.submittedUrl) });
}

const DEFAULT_STATE: RecordingState = {
  isRecording: false,
  isPaused: false,
  activeBugId: null,
  actionCount: 0,
  screenshotCount: 0,
  consoleErrorCount: 0,
  networkFailCount: 0,
};

export async function getRecordingState(): Promise<RecordingState> {
  const result = await browser.storage.session.get('recordingState');
  return (result.recordingState as RecordingState) ?? DEFAULT_STATE;
}

export async function setRecordingState(state: RecordingState): Promise<void> {
  await browser.storage.session.set({ recordingState: state });
}

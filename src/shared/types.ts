export type ActionType = 'click' | 'input' | 'navigate' | 'scroll';

export interface UserAction {
  id: string;
  type: ActionType;
  timestamp: number;
  url: string;
  urlPath: string;
  pageTitle: string;
  label: string;
  naturalLanguage: string;
  selector?: string;
  value?: string;
}

export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: number;
  url?: string;
  lineNumber?: number;
}

export interface NetworkEntry {
  requestId: string;
  method: string;
  url: string;
  status: number | null;
  mimeType: string;
  duration: number;
  failed: boolean;
  errorText?: string;
  requestTimestamp: number;
}

export interface BrowserInfo {
  userAgent: string;
  platform: string;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  devicePixelRatio: number;
  language: string;
  url: string;
}

export interface BugReport {
  id: string;
  title: string;
  actions: UserAction[];
  screenshotIds: string[];
  browserInfo?: BrowserInfo;
  consoleEntries?: ConsoleEntry[];
  networkEntries?: NetworkEntry[];
  createdAt: number;
  updatedAt: number;
  submittedUrl?: string;
  submittedAt?: number;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  activeBugId: string | null;
  actionCount: number;
  screenshotCount: number;
  consoleErrorCount: number;
  networkFailCount: number;
}

export interface ADOConfig {
  organizationUrl: string;
  pat: string;
}

export interface ADOProject {
  id: string;
  name: string;
}

export interface ADOAreaNode {
  id: number;
  name: string;
  path: string;
  children?: ADOAreaNode[];
}

export interface ADOIterationNode {
  id: number;
  name: string;
  path: string;
  children?: ADOIterationNode[];
}

export interface BugSubmitOptions {
  title?: string;
  project: ADOProject;
  areaPath: string;
  iterationPath: string;
}

export type MessageType =
  | 'START_BUG_REPORT'
  | 'STOP_BUG_REPORT'
  | 'PAUSE_RECORDING'
  | 'GET_STATE'
  | 'ADD_ACTION'
  | 'STATE_UPDATE'
  | 'TAKE_SCREENSHOT'
  | 'COLLECT_BROWSER_INFO'
  | 'DELETE_BUG'
  | 'SUBMIT_BUG'
  | 'FETCH_ADO_PROJECTS'
  | 'FETCH_ADO_AREA_PATHS'
  | 'FETCH_ADO_ITERATION_PATHS'
  | 'PING';

export interface Message {
  type: MessageType;
  payload?: unknown;
}

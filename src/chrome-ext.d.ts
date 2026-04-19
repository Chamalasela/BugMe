// Minimal ambient declarations for Chrome extension APIs not covered by webextension-polyfill types.

interface ChromeDebuggerDebuggee {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
}

interface ChromeDebugger {
  attach(target: ChromeDebuggerDebuggee, requiredVersion: string): Promise<void>;
  detach(target: ChromeDebuggerDebuggee): Promise<void>;
  sendCommand(target: ChromeDebuggerDebuggee, method: string, params?: object): Promise<unknown>;
  onEvent: {
    addListener(
      cb: (source: ChromeDebuggerDebuggee, method: string, params: unknown) => void
    ): void;
  };
  onDetach: {
    addListener(
      cb: (source: ChromeDebuggerDebuggee, reason: string) => void
    ): void;
  };
}

declare const chrome: {
  debugger: ChromeDebugger;
  tabs: {
    captureVisibleTab(
      windowId: number,
      options: { format: 'png' | 'jpeg'; quality?: number }
    ): Promise<string>;
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        cb: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void
        ) => boolean | void
      ): void;
    };
  };
};

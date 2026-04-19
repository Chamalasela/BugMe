import { useEffect, useRef, useState, useCallback } from 'react';
import { getAllBugReports, deleteSubmittedBugReports } from '../shared/storage';
import type { BugReport, RecordingState } from '../shared/types';
import { browser } from '../shared/browser';
import ActionFeed from './components/ActionFeed';
import SubmitView from './components/SubmitView';
import Settings from './components/Settings';

type View = 'home' | 'recording' | 'submit' | 'history' | 'settings' | 'about';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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

export default function App() {
  const [view, setView] = useState<View>('home');
  const [recording, setRecording] = useState<RecordingState>(DEFAULT_STATE);
  const [activeBug, setActiveBug] = useState<BugReport | null>(null);
  const [allBugs, setAllBugs] = useState<BugReport[]>([]);
  const [bugTitle, setBugTitle] = useState('');
  const [submitTarget, setSubmitTarget] = useState<BugReport | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const activeBugIdRef = useRef<string | null>(null);

  // Load initial state
  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_STATE' }).then((raw) => {
      const state = raw as RecordingState;
      setRecording(state);
      activeBugIdRef.current = state.activeBugId;
      if (state.isRecording) {
        setView('recording');
        startElapsedTimer();
      }
      loadBugsWithId(state.activeBugId);
    }).catch(() => {});
  }, []);

  // Poll while recording
  useEffect(() => {
    if (recording.isRecording) {
      pollRef.current = setInterval(pollActiveBug, 1000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [recording.isRecording]);

  function startElapsedTimer() {
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }

  function stopElapsedTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsedSeconds(0);
  }

  async function loadBugsWithId(activeId: string | null) {
    const bugs = await getAllBugReports();
    setAllBugs(bugs);
    if (activeId) {
      setActiveBug(bugs.find((b) => b.id === activeId) ?? null);
    }
  }

  const pollActiveBug = useCallback(async () => {
    const id = activeBugIdRef.current;
    if (!id) return;
    const bugs = await getAllBugReports();
    const bug = bugs.find((b) => b.id === id);
    if (bug) { setActiveBug({ ...bug }); setAllBugs(bugs); }

    // Also refresh recording state for live counters
    const raw = await browser.runtime.sendMessage({ type: 'GET_STATE' });
    setRecording(raw as RecordingState);
  }, []);

  async function startBugReport() {
    const resp = await browser.runtime.sendMessage({
      type: 'START_BUG_REPORT',
      payload: { title: bugTitle.trim() },
    }) as RecordingState;
    setRecording(resp);
    activeBugIdRef.current = resp.activeBugId;
    setBugTitle('');
    await loadBugsWithId(resp.activeBugId);
    startElapsedTimer();
    setView('recording');
  }

  async function takeScreenshot() {
    await browser.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
  }

  async function pauseRecording() {
    const resp = await browser.runtime.sendMessage({ type: 'PAUSE_RECORDING' }) as RecordingState;
    setRecording(resp);
  }

  async function stopAndReview() {
    const raw = await browser.runtime.sendMessage({ type: 'STOP_BUG_REPORT' }) as { bugId: string };
    stopElapsedTimer();

    const bugs = await getAllBugReports();
    setAllBugs(bugs);
    const stopped = bugs.find((b) => b.id === raw.bugId) ?? null;
    setActiveBug(stopped);
    setSubmitTarget(stopped);
    activeBugIdRef.current = null;
    setRecording(DEFAULT_STATE);
    setView('submit');
  }

  async function deleteBug(bugId: string) {
    await browser.runtime.sendMessage({ type: 'DELETE_BUG', payload: { bugId } });
    setAllBugs((prev) => prev.filter((b) => b.id !== bugId));
  }

  async function clearSubmittedBugs() {
    await deleteSubmittedBugReports();
    setAllBugs((prev) => prev.filter((b) => !b.submittedUrl));
  }

  function onSubmitted(bugId: string, url: string) {
    setAllBugs((prev) => prev.map((b) => b.id === bugId ? { ...b, submittedUrl: url, submittedAt: Date.now() } : b));
  }

  const recentBugs = [...allBugs].reverse().slice(0, 3);

  return (
    <div className="w-96 flex flex-col text-xs font-sans" style={{ backgroundColor: '#fafafa', minHeight: '16rem', maxHeight: '580px', overflowY: 'auto' }}>
      {/* Header */}
      <div className="text-white px-3 py-2 flex items-center justify-between" style={{ backgroundColor: '#cc2200' }}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">BugMe</span>
          {recording.isRecording && (
            <div className="flex items-center gap-1">
              <span
                className="flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: recording.isPaused ? '#D97706' : '#EF4444' }}
              >
                <span className={`w-1.5 h-1.5 rounded-full bg-white ${!recording.isPaused ? 'animate-pulse' : ''}`} />
                {recording.isPaused ? 'PAUSED' : 'CAPTURING'}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setView(recording.isRecording ? 'recording' : 'home')}
            className={`px-2 py-0.5 rounded ${(view === 'home' || view === 'recording') ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >Home</button>
          <button
            onClick={() => { setView('history'); loadBugsWithId(null); }}
            className={`px-2 py-0.5 rounded ${view === 'history' ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >History ({allBugs.length})</button>
          <button
            onClick={() => setView('settings')}
            className={`px-2 py-0.5 rounded ${view === 'settings' ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >⚙</button>
          <button
            onClick={() => setView('about')}
            className={`px-2 py-0.5 rounded ${view === 'about' ? 'bg-white/20' : 'hover:bg-white/10'}`}
            title="About BugMe"
          >ⓘ</button>
        </div>
      </div>

      {/* Home View */}
      {(view === 'home') && (
        <div className="flex flex-col gap-2 p-3">
          <input
            className="border rounded px-2 py-1 text-xs"
            style={{ borderColor: '#ddd', color: '#1a1a1a' }}
            placeholder="Bug title (optional)"
            value={bugTitle}
            onChange={(e) => setBugTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startBugReport()}
          />
          <button
            onClick={startBugReport}
            className="py-2 rounded text-white font-medium text-xs"
            style={{ backgroundColor: '#cc2200' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#a81800')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#cc2200')}
          >
            ● Start Capturing Bug
          </button>
          <p className="text-center text-xs" style={{ color: '#606060' }}>Shortcut: Alt+Shift+R</p>

          {recentBugs.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <div className="text-xs font-medium" style={{ color: '#606060' }}>Recent bugs</div>
              {recentBugs.map((bug) => (
                <div key={bug.id} className="flex items-center gap-2 bg-white border rounded p-2" style={{ borderColor: '#ddd' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="truncate font-medium" style={{ color: '#1a1a1a' }}>{bug.title}</span>
                      {bug.submittedUrl && <span className="shrink-0 font-bold" style={{ color: '#cc2200' }}>✓</span>}
                    </div>
                    <div style={{ color: '#606060' }}>{bug.actions.length} actions · {new Date(bug.createdAt).toLocaleDateString()}</div>
                  </div>
                  {!bug.submittedUrl && (
                    <button
                      onClick={() => { setSubmitTarget(bug); setView('submit'); }}
                      className="shrink-0 text-xs px-1"
                      style={{ color: '#cc2200' }}
                      title="Submit to ADO"
                    >↗</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recording View */}
      {view === 'recording' && (
        <div className="flex flex-col gap-2 p-3">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-white border rounded p-2" style={{ borderColor: '#ddd' }}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`shrink-0 w-2 h-2 rounded-full ${recording.isPaused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`} />
              <span className="font-medium truncate text-xs" style={{ color: '#1a1a1a' }}>{activeBug?.title || 'Recording…'}</span>
            </div>
            <span className="shrink-0 text-xs font-mono" style={{ color: '#606060' }}>{formatElapsed(elapsedSeconds)}</span>
          </div>

          {/* Live counters */}
          <div className="flex gap-1 flex-wrap text-xs">
            <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: recording.consoleErrorCount > 0 ? '#FEE2E2' : '#fef2f0', color: recording.consoleErrorCount > 0 ? '#EF4444' : '#606060' }}>
              🖥 {recording.consoleErrorCount} errors
            </span>
            <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: recording.networkFailCount > 0 ? '#FEE2E2' : '#fef2f0', color: recording.networkFailCount > 0 ? '#EF4444' : '#606060' }}>
              🌐 {recording.networkFailCount} failures
            </span>
            <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fef2f0', color: '#cc2200' }}>
              📸 {recording.screenshotCount}
            </span>
            <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fef2f0', color: '#606060' }}>
              📋 {recording.actionCount} actions
            </span>
          </div>

          {/* Action feed */}
          <ActionFeed actions={activeBug?.actions.slice(-5) ?? []} />

          {/* Screenshot */}
          <button
            onClick={takeScreenshot}
            className="w-full py-1.5 rounded border text-xs"
            style={{ borderColor: '#ddd', color: '#cc2200' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f0')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            📸 Take Screenshot
          </button>

          {/* Pause / Stop */}
          <div className="flex gap-2">
            <button
              onClick={pauseRecording}
              className="flex-1 py-1.5 rounded bg-yellow-400 hover:bg-yellow-500 text-xs font-medium"
            >
              {recording.isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={stopAndReview}
              className="flex-1 py-1.5 rounded text-white text-xs font-medium"
              style={{ backgroundColor: '#1a1a1a' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#cc2200')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1a1a1a')}
            >
              ⏹ Stop & Review
            </button>
          </div>
        </div>
      )}

      {/* Submit View */}
      {view === 'submit' && submitTarget && (
        <SubmitView
          report={submitTarget}
          onClose={() => { setSubmitTarget(null); setView('home'); }}
          onSubmitted={(id, url) => { onSubmitted(id, url); }}
        />
      )}

      {/* History View */}
      {view === 'history' && (
        <div className="flex flex-col gap-1 p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-sm" style={{ color: '#1a1a1a' }}>Bug History</span>
            {allBugs.some((b) => b.submittedUrl) && (
              <button
                onClick={clearSubmittedBugs}
                className="text-xs"
                style={{ color: '#606060' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#606060')}
              >Clear submitted</button>
            )}
          </div>
          {allBugs.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: '#606060' }}>No bug reports yet.</p>
          ) : (
            [...allBugs].reverse().map((bug) => (
              <div key={bug.id} className="flex items-center gap-2 bg-white border rounded p-2" style={{ borderColor: '#ddd' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-medium text-xs" style={{ color: '#1a1a1a' }}>{bug.title}</span>
                    {bug.submittedUrl
                      ? <span className="shrink-0 text-xs font-bold" style={{ color: '#cc2200' }}>✓ ADO</span>
                      : <span className="shrink-0 text-xs" style={{ color: '#D97706' }}>Draft</span>
                    }
                  </div>
                  <div className="text-xs" style={{ color: '#606060' }}>
                    {bug.actions.length} actions · {bug.screenshotIds.length} screenshots · {new Date(bug.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {!bug.submittedUrl && (
                  <button
                    onClick={() => { setSubmitTarget(bug); setView('submit'); }}
                    className="shrink-0 text-xs px-1"
                    style={{ color: '#cc2200' }}
                    title="Submit to ADO"
                  >↗</button>
                )}
                <button
                  onClick={() => deleteBug(bug.id)}
                  className="shrink-0 text-xs px-1 hover:text-red-500"
                  style={{ color: '#606060' }}
                  title="Delete"
                >🗑️</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Settings View */}
      {view === 'settings' && (
        <Settings onBack={() => setView('home')} />
      )}

      {/* About View */}
      {view === 'about' && (
        <div className="flex flex-col gap-3 p-4">
          <button
            onClick={() => setView('home')}
            className="self-start text-xs flex items-center gap-1"
            style={{ color: '#cc2200' }}
          >← Back</button>

          <div className="flex items-center gap-3">
            <img src="icons/icon48.png" alt="BugMe" className="w-10 h-10" />
            <div>
              <div className="font-semibold text-sm" style={{ color: '#1a1a1a' }}>BugMe</div>
              <div style={{ color: '#606060' }}>Version 1.0.0</div>
            </div>
          </div>

          <p style={{ color: '#606060' }}>
            Record bugs with screenshots, video, console &amp; network logs and create Azure DevOps work items automatically.
          </p>

          <div className="bg-white border rounded p-3 flex flex-col gap-1" style={{ borderColor: '#ddd' }}>
            <div className="font-medium" style={{ color: '#1a1a1a' }}>Keyboard shortcut</div>
            <div style={{ color: '#606060' }}>
              <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: '#fef2f0', border: '1px solid #ddd' }}>Alt</kbd>
              {' + '}
              <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: '#fef2f0', border: '1px solid #ddd' }}>Shift</kbd>
              {' + '}
              <kbd className="px-1 py-0.5 rounded text-xs" style={{ background: '#fef2f0', border: '1px solid #ddd' }}>R</kbd>
              {' — Toggle recording'}
            </div>
          </div>

          <div className="bg-white border rounded p-3 flex flex-col gap-1" style={{ borderColor: '#ddd' }}>
            <div className="font-medium" style={{ color: '#1a1a1a' }}>Support &amp; contact</div>
            <a
              href="https://github.com/Chamalasela/BugMe"
              className="text-xs"
              style={{ color: '#cc2200' }}
            >BugMe - GitHub</a>
          </div>
        </div>
      )}
    </div>
  );
}

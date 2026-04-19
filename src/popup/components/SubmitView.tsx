import { useEffect, useState } from 'react';
import { browser } from '../../shared/browser';
import type {
  BugReport,
  ADOProject,
  ADOAreaNode,
  ADOIterationNode,
  BugSubmitOptions,
} from '../../shared/types';

interface Props {
  report: BugReport;
  onClose: () => void;
  onSubmitted: (bugId: string, url: string) => void;
}

type Status = 'idle' | 'loading' | 'submitting' | 'done' | 'error';

function Spinner() {
  return <span className="animate-spin inline-block ml-1" style={{ color: '#606060' }}>⟳</span>;
}

const inputStyle = { borderColor: '#ddd', color: '#1a1a1a' };

export default function SubmitView({ report, onClose, onSubmitted }: Props) {
  const [bugTitle, setBugTitle] = useState(report.title);
  const [projects, setProjects] = useState<ADOProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ADOProject | null>(null);
  const [projectsStatus, setProjectsStatus] = useState<Status>('loading');

  const [areaPaths, setAreaPaths] = useState<ADOAreaNode[]>([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [areaStatus, setAreaStatus] = useState<Status>('idle');

  const [iterPaths, setIterPaths] = useState<ADOIterationNode[]>([]);
  const [selectedIter, setSelectedIter] = useState('');
  const [iterStatus, setIterStatus] = useState<Status>('idle');

  const [submitStatus, setSubmitStatus] = useState<Status>('idle');
  const [submittedUrl, setSubmittedUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setProjectsStatus('loading');
    browser.runtime.sendMessage({ type: 'FETCH_ADO_PROJECTS' }).then((raw) => {
      const r = raw as { error?: string };
      if (r?.error) { setProjectsStatus('error'); setErrorMsg(r.error); return; }
      setProjects(raw as ADOProject[]);
      setProjectsStatus('idle');
    }).catch((e) => { setProjectsStatus('error'); setErrorMsg(String(e)); });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setAreaStatus('loading'); setIterStatus('loading');
    setAreaPaths([]); setSelectedArea('');
    setIterPaths([]); setSelectedIter('');

    browser.runtime.sendMessage({ type: 'FETCH_ADO_AREA_PATHS', payload: { project: selectedProject.name } }).then((raw) => {
      const r = raw as { error?: string };
      if (r?.error) { setAreaStatus('error'); setErrorMsg(r.error); return; }
      setAreaPaths(raw as ADOAreaNode[]);
      setAreaStatus('idle');
    }).catch((e) => { setAreaStatus('error'); setErrorMsg(String(e)); });

    browser.runtime.sendMessage({ type: 'FETCH_ADO_ITERATION_PATHS', payload: { project: selectedProject.name } }).then((raw) => {
      const r = raw as { error?: string };
      if (r?.error) { setIterStatus('error'); return; }
      setIterPaths(raw as ADOIterationNode[]);
      setIterStatus('idle');
    }).catch(() => setIterStatus('error'));
  }, [selectedProject]);

  const canSubmit = selectedProject && selectedArea && submitStatus !== 'submitting';

  async function doSubmit() {
    if (!selectedProject) return;
    setSubmitStatus('submitting');
    setErrorMsg('');

    const opts: BugSubmitOptions = {
      title: bugTitle,
      project: selectedProject,
      areaPath: selectedArea,
      iterationPath: selectedIter,
    };

    const raw = await browser.runtime.sendMessage({ type: 'SUBMIT_BUG', payload: { bugId: report.id, opts } });
    const errResp = raw as { error?: string };
    if (errResp?.error) {
      setErrorMsg(errResp.error);
      setSubmitStatus('error');
      return;
    }
    const url = raw as string;
    setSubmittedUrl(url);
    setSubmitStatus('done');
    onSubmitted(report.id, url);
  }

  const consoleErrors = (report.consoleEntries ?? []).filter((e) => e.level === 'error' || e.level === 'warn').length;
  const networkFails = (report.networkEntries ?? []).filter((e) => e.failed).length;

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="text-sm"
          style={{ color: '#606060' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1a1a1a')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#606060')}
        >←</button>
        <h2 className="font-semibold text-sm" style={{ color: '#1a1a1a' }}>Submit Bug to Azure DevOps</h2>
      </div>

      {submitStatus === 'done' ? (
        <div className="flex flex-col gap-3">
          <p className="font-semibold text-sm" style={{ color: '#cc2200' }}>✓ Bug created successfully!</p>
          <div className="flex items-start gap-2">
            <a href={submittedUrl} target="_blank" rel="noreferrer" className="underline text-xs break-all flex-1" style={{ color: '#cc2200' }}>{submittedUrl}</a>
            <button
              onClick={() => navigator.clipboard.writeText(submittedUrl)}
              className="shrink-0 text-xs px-2 py-0.5 rounded border"
              style={{ borderColor: '#ddd', color: '#cc2200', backgroundColor: '#fef2f0' }}
              title="Copy URL to clipboard"
            >📋</button>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 rounded text-xs"
            style={{ backgroundColor: '#fef2f0', color: '#1a1a1a' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ddd')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fef2f0')}
          >Done</button>
        </div>
      ) : (
        <>
          {/* Bug title — editable */}
          <label className="flex flex-col gap-1 text-xs" style={{ color: '#606060' }}>
            Bug title
            <input
              className="border rounded px-2 py-1 text-xs font-medium"
              style={inputStyle}
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              placeholder="Bug title"
            />
          </label>

          {/* Data summary */}
          <div className="rounded p-2 text-xs flex flex-col gap-1" style={{ backgroundColor: '#fef2f0', border: '1px solid #ddd' }}>
            <div className="font-medium text-xs mb-0.5" style={{ color: '#1a1a1a' }}>What will be attached:</div>
            <div className="flex items-center gap-1" style={{ color: '#606060' }}>
              <span>📋</span>
              <span>{report.actions.length} recorded actions</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: '#606060' }}>
              <span>📸</span>
              <span>{report.screenshotIds.length} screenshot{report.screenshotIds.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: consoleErrors > 0 ? '#EF4444' : '#606060' }}>
              <span>🖥</span>
              <span>{(report.consoleEntries ?? []).length} console entries ({consoleErrors} errors/warnings)</span>
            </div>
            <div className="flex items-center gap-1" style={{ color: networkFails > 0 ? '#EF4444' : '#606060' }}>
              <span>🌐</span>
              <span>{(report.networkEntries ?? []).length} network requests ({networkFails} failures)</span>
            </div>
            {report.browserInfo && (
              <div className="flex items-center gap-1" style={{ color: '#606060' }}>
                <span>ℹ</span>
                <span>Browser info collected</span>
              </div>
            )}
          </div>

          {/* Project */}
          <label className="flex flex-col gap-1 text-xs" style={{ color: '#606060' }}>
            <span>Project {projectsStatus === 'loading' && <Spinner />}</span>
            <select
              className="border rounded px-2 py-1 text-xs"
              style={inputStyle}
              value={selectedProject?.id ?? ''}
              onChange={(e) => setSelectedProject(projects.find((x) => x.id === e.target.value) ?? null)}
              disabled={projectsStatus === 'loading'}
            >
              <option value="">— Select project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {/* Area path */}
          <label className="flex flex-col gap-1 text-xs" style={{ color: '#606060' }}>
            <span>Area path {areaStatus === 'loading' && <Spinner />}</span>
            <select
              className="border rounded px-2 py-1 text-xs"
              style={inputStyle}
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              disabled={!selectedProject || areaStatus === 'loading'}
            >
              <option value="">— Select area path —</option>
              {areaPaths.map((a) => <option key={a.path} value={a.path}>{a.path}</option>)}
            </select>
          </label>

          {/* Iteration path */}
          <label className="flex flex-col gap-1 text-xs" style={{ color: '#606060' }}>
            <span>Iteration path <span style={{ fontStyle: 'italic' }}>(optional)</span> {iterStatus === 'loading' && <Spinner />}</span>
            <select
              className="border rounded px-2 py-1 text-xs"
              style={inputStyle}
              value={selectedIter}
              onChange={(e) => setSelectedIter(e.target.value)}
              disabled={!selectedProject || iterStatus === 'loading'}
            >
              <option value="">— Select iteration —</option>
              {iterPaths.map((i) => <option key={i.path} value={i.path}>{i.path}</option>)}
            </select>
          </label>

          {errorMsg && <p className="text-red-500 text-xs">{errorMsg}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-1.5 rounded text-xs"
              style={{ backgroundColor: '#fef2f0', color: '#1a1a1a' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ddd')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fef2f0')}
            >Cancel</button>
            <button
              onClick={doSubmit}
              disabled={!canSubmit}
              className="flex-1 py-1.5 rounded text-white text-xs disabled:opacity-50"
              style={{ backgroundColor: '#cc2200' }}
              onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.backgroundColor = '#a81800'; }}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#cc2200')}
            >
              {submitStatus === 'submitting' ? 'Creating Bug…' : 'Create Bug in ADO'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

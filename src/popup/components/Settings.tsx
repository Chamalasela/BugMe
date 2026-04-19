import { useEffect, useState } from 'react';
import { getADOConfig, setADOConfig } from '../../shared/storage';
import type { ADOConfig } from '../../shared/types';
import { browser } from '../../shared/browser';

interface Props {
  onBack: () => void;
}

export default function Settings({ onBack }: Props) {
  const [orgUrl, setOrgUrl] = useState('');
  const [pat, setPat] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'testing' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    getADOConfig().then((cfg) => {
      if (cfg) { setOrgUrl(cfg.organizationUrl); setPat(cfg.pat); }
    });
  }, []);

  async function save() {
    setStatus('saving');
    const config: ADOConfig = { organizationUrl: orgUrl.replace(/\/$/, ''), pat };
    await setADOConfig(config);
    setStatus('idle');
  }

  async function testConnection() {
    setStatus('testing');
    setErrorMsg('');
    const config: ADOConfig = { organizationUrl: orgUrl.replace(/\/$/, ''), pat };
    await setADOConfig(config);
    try {
      const raw = await browser.runtime.sendMessage({ type: 'FETCH_ADO_PROJECTS' });
      const resp = raw as { error?: string };
      if (resp?.error) throw new Error(resp.error);
      setStatus('ok');
    } catch (e) {
      setStatus('error');
      setErrorMsg(String(e));
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-sm"
          style={{ color: '#606060' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1a1a1a')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#606060')}
        >←</button>
        <h2 className="font-semibold text-sm" style={{ color: '#1a1a1a' }}>Azure DevOps Settings</h2>
      </div>

      <label className="flex flex-col gap-1 text-xs" style={{ color: '#606060' }}>
        Organization URL
        <input
          className="border rounded px-2 py-1 text-xs"
          style={{ borderColor: '#ddd', color: '#1a1a1a' }}
          placeholder="https://dev.azure.com/yourorg"
          value={orgUrl}
          onChange={(e) => setOrgUrl(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs" style={{ color: '#606060' }}>
        Personal Access Token (PAT)
        <input
          type="password"
          className="border rounded px-2 py-1 text-xs"
          style={{ borderColor: '#ddd', color: '#1a1a1a' }}
          placeholder="PAT with Work Items (Read &amp; Write) scope"
          value={pat}
          onChange={(e) => setPat(e.target.value)}
        />
        <span className="text-yellow-600 text-xs">⚠ PAT is stored locally in your browser only.</span>
      </label>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={status === 'saving'}
          className="flex-1 py-1.5 rounded text-xs disabled:opacity-50"
          style={{ backgroundColor: '#fef2f0', color: '#1a1a1a' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ddd')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fef2f0')}
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={testConnection}
          disabled={status === 'testing' || !orgUrl || !pat}
          className="flex-1 py-1.5 rounded text-xs text-white disabled:opacity-50"
          style={{ backgroundColor: '#cc2200' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#a81800')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#cc2200')}
        >
          {status === 'testing' ? 'Testing…' : 'Verify Connection'}
        </button>
      </div>

      {status === 'ok' && <p className="text-xs" style={{ color: '#cc2200' }}>✓ Connected successfully</p>}
      {status === 'error' && <p className="text-red-500 text-xs">{errorMsg}</p>}
    </div>
  );
}

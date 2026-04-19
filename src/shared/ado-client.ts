import type {
  ADOConfig,
  ADOProject,
  ADOAreaNode,
  ADOIterationNode,
  UserAction,
  ConsoleEntry,
  NetworkEntry,
  BrowserInfo,
  BugSubmitOptions,
} from './types';

function authHeader(pat: string): string {
  return 'Basic ' + btoa(':' + pat);
}

async function adoFetch(url: string, config: ADOConfig, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(config.pat),
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Authentication failed (${res.status}). Ensure your PAT has "Work Items (Read & Write)" scope.`
      );
    }
    const text = await res.text();
    throw new Error(`ADO API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getProjects(config: ADOConfig): Promise<ADOProject[]> {
  const data = (await adoFetch(
    `${config.organizationUrl}/_apis/projects?api-version=7.1`,
    config
  )) as { value: { id: string; name: string }[] };
  return data.value.map((p) => ({ id: p.id, name: p.name }));
}

export async function getAreaPaths(config: ADOConfig, project: string): Promise<ADOAreaNode[]> {
  const data = (await adoFetch(
    `${config.organizationUrl}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/areas?$depth=10&api-version=7.1`,
    config
  )) as ADOAreaNode;
  return flattenNodes(data, '\\' + project);
}

export async function getIterationPaths(config: ADOConfig, project: string): Promise<ADOIterationNode[]> {
  const data = (await adoFetch(
    `${config.organizationUrl}/${encodeURIComponent(project)}/_apis/wit/classificationnodes/iterations?$depth=5&api-version=7.1`,
    config
  )) as ADOIterationNode;
  return flattenNodes(data, '\\' + project);
}

function flattenNodes(node: ADOAreaNode, prefix: string): ADOAreaNode[] {
  const self: ADOAreaNode = { ...node, path: prefix };
  const children = (node.children ?? []).flatMap((c) => flattenNodes(c, prefix + '\\' + c.name));
  return [self, ...children];
}

async function uploadAttachment(config: ADOConfig, project: string, fileName: string, blob: Blob): Promise<string> {
  const res = await fetch(
    `${config.organizationUrl}/${encodeURIComponent(project)}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}&api-version=7.1`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(config.pat),
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload attachment: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getChromeVersion(userAgent: string): string {
  const match = userAgent.match(/Chrome\/([\d.]+)/);
  return match ? `Chrome ${match[1]}` : userAgent.slice(0, 60);
}

function buildReproStepsHtml(actions: UserAction[], browserInfo?: BrowserInfo): string {
  const steps = actions
    .map((a) => `<li>${escapeXml(a.naturalLanguage)}</li>`)
    .join('');

  let envSection = '';
  if (browserInfo) {
    envSection = `
<h3>Environment</h3>
<ul>
  <li><b>Browser:</b> ${escapeXml(getChromeVersion(browserInfo.userAgent))}</li>
</ul>`;
  }

  return `<h3>Reproduction Steps</h3><ol>${steps}</ol>${envSection}`;
}


function buildDiagnosticCommentHtml(
  consoleEntries: ConsoleEntry[],
  networkEntries: NetworkEntry[],
  attachmentDescriptions: string[]
): string {
  const now = new Date().toISOString();

  const consoleLevelColor: Record<string, string> = {
    error: '#c0392b',
    warn: '#e67e22',
    info: '#2980b9',
    debug: '#7f8c8d',
    log: 'inherit',
  };

  const consoleRows = consoleEntries
    .map((e) => {
      const color = consoleLevelColor[e.level] ?? 'inherit';
      const src = e.url ? `${escapeXml(e.url)}${e.lineNumber !== undefined ? `:${e.lineNumber}` : ''}` : '';
      const time = new Date(e.timestamp).toLocaleTimeString();
      return `<tr style="color:${color}"><td>${e.level.toUpperCase()}</td><td>${escapeXml(e.text)}</td><td>${escapeXml(src)}</td><td>${time}</td></tr>`;
    })
    .join('');

  const networkRows = networkEntries
    .map((e) => {
      const color = e.failed ? '#c0392b' : 'inherit';
      const statusText = e.status !== null ? String(e.status) : `FAILED${e.errorText ? ` (${escapeXml(e.errorText)})` : ''}`;
      const duration = e.duration > 0 ? `${e.duration}ms` : '-';
      return `<tr style="color:${color}"><td>${escapeXml(e.method)}</td><td>${escapeXml(e.url)}</td><td>${statusText}</td><td>${duration}</td></tr>`;
    })
    .join('');

  const consoleErrors = consoleEntries.filter((e) => e.level === 'error' || e.level === 'warn').length;
  const networkFails = networkEntries.filter((e) => e.failed).length;

  const attachList = attachmentDescriptions.map((d) => `<li>${escapeXml(d)}</li>`).join('');

  return `<h2>BugMe Diagnostic Report</h2>
<p>Submitted at ${now} via BugMe Chrome Extension</p>

<h3>Console Log (${consoleEntries.length} entries, ${consoleErrors} errors/warnings)</h3>
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Level</th><th>Message</th><th>Source</th><th>Time</th></tr>
  ${consoleRows || '<tr><td colspan="4">No console entries captured</td></tr>'}
</table>

<h3>Network Log (${networkEntries.length} requests, ${networkFails} failures)</h3>
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th></tr>
  ${networkRows || '<tr><td colspan="4">No network entries captured</td></tr>'}
</table>

<h3>Attachments</h3>
<ul>${attachList || '<li>None</li>'}</ul>`;
}

export async function exportAsBug(
  config: ADOConfig,
  opts: {
    title: string;
    project: ADOProject;
    areaPath: string;
    iterationPath: string;
    actions: UserAction[];
    screenshots: Blob[];
    consoleEntries: ConsoleEntry[];
    networkEntries: NetworkEntry[];
    browserInfo?: BrowserInfo;
  } & Pick<BugSubmitOptions, 'project' | 'areaPath' | 'iterationPath'>
): Promise<string> {
  const reproStepsHtml = buildReproStepsHtml(opts.actions, opts.browserInfo);

  const patchDoc: unknown[] = [
    { op: 'add', path: '/fields/System.Title', value: opts.title },
    { op: 'add', path: '/fields/System.AreaPath', value: opts.areaPath },
    { op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: reproStepsHtml },
  ];

  if (opts.iterationPath) {
    patchDoc.push({ op: 'add', path: '/fields/System.IterationPath', value: opts.iterationPath });
  }

  const created = (await adoFetch(
    `${config.organizationUrl}/${encodeURIComponent(opts.project.name)}/_apis/wit/workitems/$Bug?api-version=7.1`,
    config,
    { method: 'POST', headers: { 'Content-Type': 'application/json-patch+json' }, body: JSON.stringify(patchDoc) }
  )) as { id: number; _links: { html: { href: string } } };

  const workItemId = created.id;
  const attachmentDescriptions: string[] = [];
  const relationOps: unknown[] = [];

  // Upload screenshots
  for (let i = 0; i < opts.screenshots.length; i++) {
    const isoTs = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `screenshot-${i + 1}-${isoTs}.png`;
    const attachUrl = await uploadAttachment(config, opts.project.name, fileName, opts.screenshots[i]);
    relationOps.push({
      op: 'add',
      path: '/relations/-',
      value: { rel: 'AttachedFile', url: attachUrl, attributes: { comment: `Screenshot ${i + 1}` } },
    });
    attachmentDescriptions.push(`Screenshot ${i + 1}: ${fileName}`);
  }

  // Batch PATCH all attachment relations in one call
  if (relationOps.length > 0) {
    await adoFetch(
      `${config.organizationUrl}/${encodeURIComponent(opts.project.name)}/_apis/wit/workItems/${workItemId}?api-version=7.1`,
      config,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(relationOps),
      }
    );
  }

  // Post diagnostic comment
  const diagnosticHtml = buildDiagnosticCommentHtml(
    opts.consoleEntries,
    opts.networkEntries,
    attachmentDescriptions
  );
  await adoFetch(
    `${config.organizationUrl}/${encodeURIComponent(opts.project.name)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.3`,
    config,
    { method: 'POST', body: JSON.stringify({ text: diagnosticHtml }) }
  );

  return created._links.html.href;
}

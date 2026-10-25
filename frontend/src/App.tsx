import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DataTools from './DataTools'
import ReviewPanel from './ReviewPanel'
import './App.css'

type Finding = { rule: string; severity: string; reason: string }
type Account = {
  id: number; username: string; department: string; privileged: boolean
  mfa_enabled: boolean; days_inactive: number; employment_status: string
  findings: Finding[]; requires_review: boolean
}
type Report = {
  total_accounts: number; accounts_requiring_review: number
  total_findings: number; accounts: Account[]
}
type Scope = 'all' | 'flagged' | 'unflagged'

function Glyph({ name = 'lens' }: { name?: string }) {
  const paths: Record<string, string> = {
    search: 'm20 20-5-5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    arrow: 'M5 12h14 m-6-6 6 6-6 6',
    shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z m-4 9 3 3 5-6',
    refresh: 'M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 3 M4 16l2 3a8 8 0 0 0 13-3',
    close: 'm6 6 12 12 M18 6 6 18',
    lens: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.lens} /></svg>
}

function AccountDrawer({ account, onClose }: { account: Account; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  return (
    <dialog ref={dialog} className="account-drawer" aria-labelledby="drawer-title" onClose={onClose}>
      <div className="drawer-top"><span className="eyebrow">ACCESS DOSSIER / {String(account.id).padStart(3, '0')}</span><button className="icon-button" onClick={() => dialog.current?.close()} aria-label="Close account details"><Glyph name="close" /></button></div>
      <div className="drawer-identity"><span className="avatar large">{account.username.replace('demo.', '').slice(0, 2).toUpperCase()}</span><div><h2 id="drawer-title">{account.username}</h2><p>{account.department} · {account.privileged ? 'Privileged account' : 'Standard account'}</p></div></div>
      <span className={`status ${account.requires_review ? 'attention' : 'neutral'}`}><i />{account.requires_review ? 'Attention required' : 'No rule flags'}</span>
      <dl className="drawer-facts"><div><dt>Authentication</dt><dd>{account.mfa_enabled ? 'MFA enabled' : 'MFA disabled'}</dd></div><div><dt>Inactivity</dt><dd>{account.days_inactive} days</dd></div><div><dt>Employment</dt><dd>{account.employment_status}</dd></div><div><dt>Rule findings</dt><dd>{account.findings.length}</dd></div></dl>
      <h3 className="drawer-section">What needs attention</h3>
      {account.findings.length ? account.findings.map(finding => <div className="finding-detail" key={finding.rule}><div><span className="severity-tag">{finding.severity}</span><code>{finding.rule}</code></div><p>{finding.reason}</p></div>) : <p className="drawer-explainer">Neither of the two current rules flagged this account. A reviewer should still confirm that access is appropriate.</p>}
      <ReviewPanel accountId={account.id} />
      <p className="drawer-footnote">Decisions document a review. They do not modify permissions or automatically resolve findings.</p>
    </dialog>
  )
}

export default function App() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('all')
  const [scope, setScope] = useState<Scope>('all')
  const [selected, setSelected] = useState<Account | null>(null)

  function requestRefresh() { setError(''); setReport(null); setRefresh(n => n + 1) }
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/accounts', { signal: controller.signal })
        if (!response.ok) throw new Error('The account inventory could not be loaded.')
        const data: Report = await response.json()
        if (!controller.signal.aborted) setReport(data)
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Connection failed.')
      }
    }
    void load()
    return () => controller.abort()
  }, [refresh])

  const accounts = report?.accounts ?? []
  const total = accounts.length
  const flagged = accounts.filter(a => a.requires_review).length
  const mfa = accounts.filter(a => a.mfa_enabled).length
  const coverage = total ? Math.round(mfa / total * 100) : 0
  const departments = [...new Set(accounts.map(a => a.department))].sort()
  const visible = accounts.filter(a =>
    `${a.username} ${a.department}`.toLowerCase().includes(query.toLowerCase()) &&
    (department === 'all' || a.department === department) &&
    (scope === 'all' || (scope === 'flagged' ? a.requires_review : !a.requires_review))
  )
  const noMfa = accounts.filter(a => a.privileged && !a.mfa_enabled).length
  const dormant = accounts.filter(a => a.privileged && a.days_inactive >= 90).length
  const ratio = total ? flagged / total : 0

  function inspectScope(next: Scope) { setScope(next); document.getElementById('inventory')?.scrollIntoView({ behavior: 'smooth' }) }

  return (
    <div className="lens-app">
      <nav className="topbar" aria-label="Main navigation">
        <a className="wordmark" href="#overview"><span className="logo-optic"><Glyph /></span>Access<span>Lens</span><sup>01</sup></a>
        <div className="nav-links"><a href="#overview">Overview</a><a href="#inventory">Account inventory</a><a href="#data-workspace">Data workspace</a></div>
        <span className="demo-label"><i />DEMO WORKSPACE</span>
      </nav>

      <main className="workspace" id="overview">
        <header className="page-intro"><div><p className="eyebrow"><span />IDENTITY GOVERNANCE, IN FOCUS</p><h1>A clearer view.<br /><span>A smarter review.</span></h1><p className="intro-copy">Bring account access into focus.<br />Find the exceptions. Document the decisions.</p></div><div className="intro-meta"><span className="edition">ACCESS INTELLIGENCE / 001</span><p>Built for a thoughtful<br />human review.</p><button className="quiet-button" onClick={requestRefresh} disabled={!report && !error}><Glyph name="refresh" />{!report && !error ? 'Loading inventory' : 'Refresh inventory'}</button></div></header>

        {error ? <section className="error-state" role="alert"><h2>Let’s reconnect.</h2><p>{error} Check that the Python backend is running.</p><button onClick={requestRefresh}>Try again</button></section> : !report ? <section className="loading-state" role="status"><span className="loading-orbit" /><p>Bringing your inventory into focus…</p></section> : <>
          <section className="overview-grid" aria-label="Inventory overview">
            <article className="optic-panel glass"><div className="panel-top"><span className="eyebrow">01 / ACCESS EXPOSURE</span><span className="micro-badge">RULE-BASED ANALYSIS</span></div><div className="optic-content"><div className="optic-copy"><p className="section-kicker">Know where to look.</p><h2>{flagged}<span> / {total}</span></h2><p>accounts flagged<br />for closer review</p><button className="text-link" onClick={() => inspectScope('flagged')}>Explore flagged accounts <Glyph name="arrow" /></button></div><div className="optic-art" style={{ '--exposure': `${ratio * 360}deg` } as CSSProperties} aria-hidden="true"><div className="orbit-ticks" /><div className="orbit-track" /><div className="optic-ring" /><div className="optic-core"><Glyph name="shield" /><span>ACCESS</span><strong>IN FOCUS</strong></div><span className="orbit-caption">{total} ACCOUNTS · {flagged} FLAGGED</span></div></div><div className="lens-legend"><button onClick={() => inspectScope('flagged')}><i className="dot-violet" />Flagged <b>{flagged}</b></button><button onClick={() => inspectScope('unflagged')}><i className="dot-silver" />No rule flags <b>{total - flagged}</b></button><button onClick={() => inspectScope('all')}>View all <Glyph name="arrow" /></button></div></article>

            <article className="signal-panel glass"><div className="panel-top"><span className="eyebrow">02 / SIGNAL SUMMARY</span><Glyph name="lens" /></div><div className="signal-total"><strong>{report.total_findings}</strong><span>findings across<br />your inventory</span></div><div className="signal-line"><div><i className="dot-cyan" /><span>Privileged, no MFA</span></div><b>{noMfa}</b></div><div className="signal-line"><div><i className="dot-violet" /><span>Dormant privileged access</span></div><b>{dormant}</b></div><div className="coverage"><div><span>MFA coverage</span><strong>{coverage}%</strong></div><div className="coverage-track"><span style={{ width: `${coverage}%` }} /></div><small>{mfa} of {total} accounts have MFA enabled</small></div><p className="signal-note">One account may trigger multiple findings.</p></article>
          </section>

          <section className="inventory-section" id="inventory"><div className="inventory-title"><div><p className="eyebrow">03 / ACCOUNT INVENTORY</p><h2>The details make the difference.</h2></div><span className="inventory-count">{String(visible.length).padStart(2, '0')}<small> / {String(total).padStart(2, '0')} ACCOUNTS</small></span></div><div className="inventory-toolbar"><div className="scope-control" aria-label="Account filters">{([['all', 'All accounts'], ['flagged', 'Flagged'], ['unflagged', 'No rule flags']] as const).map(([value, label]) => <button key={value} aria-pressed={scope === value} className={scope === value ? 'selected' : ''} onClick={() => setScope(value)}>{label}</button>)}</div><div className="search-controls"><label className="search-field"><Glyph name="search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an account" aria-label="Search accounts or departments" /></label><select aria-label="Filter by department" value={department} onChange={e => setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div></div>
            <div className="table-shell"><table className="account-table"><thead><tr><th scope="col">ACCOUNT / DEPARTMENT</th><th scope="col">ACCESS</th><th scope="col">MFA</th><th scope="col">INACTIVITY</th><th scope="col">REVIEW SIGNAL</th><th scope="col"><span className="sr-only">Details</span></th></tr></thead><tbody>{visible.map(account => <tr key={account.id}><td><div className="table-identity"><span className={`avatar ${account.privileged ? 'privileged' : ''}`}>{account.username.replace('demo.', '').slice(0, 2).toUpperCase()}</span><div><button className="account-name" onClick={() => setSelected(account)}>{account.username}</button><small>{account.department}</small></div></div></td><td><span className={`access-label ${account.privileged ? 'is-privileged' : ''}`}>{account.privileged ? 'Privileged' : 'Standard'}</span></td><td><span className={`mfa-label ${account.mfa_enabled ? 'enabled' : 'disabled'}`}><i />{account.mfa_enabled ? 'Enabled' : 'Disabled'}</span></td><td><span className={account.days_inactive >= 90 ? 'stale' : ''}>{account.days_inactive}<small className="day-unit"> days</small></span></td><td><span className={`status ${account.requires_review ? 'attention' : 'neutral'}`}><i />{account.requires_review ? `${account.findings.length} finding${account.findings.length === 1 ? '' : 's'}` : 'No rule flags'}</span></td><td><button className="row-open" aria-label={`Review ${account.username}`} onClick={() => setSelected(account)}><Glyph name="arrow" /></button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-state"><Glyph name="search" /><h3>No accounts in this view.</h3><p>Try another search or reset your filters.</p><button onClick={() => { setQuery(''); setDepartment('all'); setScope('all') }}>Reset filters</button></div>}</div><div className="table-caption"><span>Click an account to inspect findings and record a decision.</span><span aria-live="polite">Showing {visible.length} of {total}</span></div>
          </section>
        </>}

        <section id="data-workspace" className="data-workspace"><p className="eyebrow">04 / DATA WORKSPACE</p><DataTools onImported={requestRefresh} /></section>
        <footer className="workspace-footer"><a className="footer-brand" href="#overview">AccessLens <span>/</span> Clarity before action.</a><p>Fictional data · Two detection rules · Human decisions<br />No rule flags does not establish that access is appropriate.</p></footer>
      </main>
      {selected && <AccountDrawer account={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

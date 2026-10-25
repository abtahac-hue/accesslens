import { useRef, useState } from 'react'
import './DataTools.css'

type ExportAccount = {
  username: string
  department: string
  privileged: boolean
  mfa_enabled: boolean
  days_inactive: number
  employment_status: string
  requires_review: boolean
  findings: { rule: string; reason: string }[]
}

type ApiError = {
  detail?: string | {
    message?: string
    errors?: { row: number; message: string }[]
  }
}

function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) {
    text = "'" + text
  }
  return '"' + text.replace(/"/g, '""') + '"'
}

export default function DataTools({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function upload() {
    setMessage('')
    setError('')
    if (!file) {
      setError('Choose a CSV file first.')
      return
    }
    if (file.size > 1048576) {
      setError('Choose a CSV file no larger than 1 MB.')
      return
    }

    setBusy('import')
    const form = new FormData()
    form.append('file', file)

    try {
      const response = await fetch('/api/import/accounts', {
        method: 'POST',
        body: form,
      })
      if (!response.ok) {
        const body: ApiError = await response.json()
        const detail = body.detail
        if (typeof detail === 'string') throw new Error(detail)
        if (detail && typeof detail === 'object') {
          const rows = detail.errors?.map(
            item => `Row ${item.row}: ${item.message}`
          ).join('\n') ?? ''
          throw new Error([detail.message, rows].filter(Boolean).join('\n'))
        }
        throw new Error('Import rejected. Check the CSV format.')
      }
      const result: { imported: number } = await response.json()
      setMessage(`Successfully imported ${result.imported} accounts.`)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onImported()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy('')
    }
  }

  async function exportAccounts() {
    setMessage('')
    setError('')
    setBusy('export')

    try {
      const response = await fetch('/api/accounts')
      if (!response.ok) throw new Error('Could not retrieve accounts for export.')
      const report: { accounts: ExportAccount[] } = await response.json()

      const rows: unknown[][] = [[
        'username', 'department', 'privileged', 'mfa_enabled',
        'days_inactive', 'employment_status', 'requires_review',
        'finding_count', 'rule_ids', 'finding_reasons',
      ]]

      for (const account of report.accounts) {
        rows.push([
          account.username,
          account.department,
          account.privileged,
          account.mfa_enabled,
          account.days_inactive,
          account.employment_status,
          account.requires_review,
          account.findings.length,
          account.findings.map(f => f.rule).join('; '),
          account.findings.map(f => f.reason).join('; '),
        ])
      }

      const csv = '\uFEFF' + rows.map(
        row => row.map(csvCell).join(',')
      ).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `accesslens-findings-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Findings export prepared for download.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="data-tools" aria-label="Import and export accounts">
      <div>
        <h2>Bring your inventory into focus.</h2>
        <p>
          Import up to 1,000 fictional accounts as CSV. Export all accounts
          and their current rule findings.
        </p>
      </div>
      <div className="data-actions">
        <label className="csv-picker">
          Account inventory CSV
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            disabled={Boolean(busy)}
            onChange={event => {
              setFile(event.target.files?.[0] ?? null)
              setError('')
              setMessage('')
            }}
          />
        </label>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void upload()}
        >
          {busy === 'import' ? 'Importing…' : 'Import accounts'}
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void exportAccounts()}
        >
          {busy === 'export' ? 'Preparing…' : 'Export findings'}
        </button>
      </div>
      <p className="data-hint">
        Imports add new usernames and never overwrite existing accounts.
        Findings exports include extra report columns and are not import templates.
      </p>
      {message && <p className="data-success" role="status">{message}</p>}
      {error && <p className="data-error" role="alert">{error}</p>}
    </section>
  )
}

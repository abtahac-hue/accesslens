import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './ReviewPanel.css'

type Review = {
  id: number
  reviewer: string
  decision: string
  note: string
  created_at: string
}

const labels: Record<string, string> = {
  approved: 'Access approved',
  revoke_requested: 'Revocation requested',
  investigation_required: 'Investigation required',
}

export default function ReviewPanel({ accountId }: { accountId: number }) {
  const [open, setOpen] = useState(false)
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewer, setReviewer] = useState('')
  const [decision, setDecision] = useState('investigation_required')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)

  function toggleReview() {
    if (!open) {
      setLoading(true)
      setHistoryError('')
    }
    setOpen(value => !value)
  }

  function retryHistory() {
    setLoading(true)
    setHistoryError('')
    setReload(value => value + 1)
  }

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    async function loadHistory() {
      try {
        const response = await fetch(`/api/accounts/${accountId}/reviews`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Could not load review history.')
        const data: Review[] = await response.json()
        if (!controller.signal.aborted) setReviews(data)
      } catch {
        if (!controller.signal.aborted) {
          setHistoryError('Could not load review history. Please retry.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadHistory()
    return () => controller.abort()
  }, [open, accountId, reload])

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    setMessage('')

    if (!reviewer.trim() || !note.trim()) {
      setError('Enter a reviewer name and a meaningful note.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/accounts/${accountId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: reviewer.trim(),
          decision,
          note: note.trim(),
        }),
      })
      if (!response.ok) throw new Error('The server could not save this review.')
      const saved: Review = await response.json()
      setReviews(previous => [saved, ...previous])
      setNote('')
      setMessage('Review saved successfully.')
    } catch {
      setError(
        'Save could not be confirmed. Reopen the history before retrying to avoid a duplicate.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="review-panel">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`review-${accountId}`}
        onClick={toggleReview}
      >
        {open ? 'Close review' : 'Review access & history'}
      </button>

      {open && (
        <div id={`review-${accountId}`} className="review-content">
          <h4>Record a review decision</h4>
          <p className="review-help">
            Demo reviewer names are self-reported. Recording a decision does
            not change permissions or resolve the underlying finding.
          </p>

          <form onSubmit={saveReview}>
            <fieldset disabled={saving || loading || Boolean(historyError)}>
              <div className="review-fields">
                <label>
                  Reviewer name
                  <input
                    required
                    maxLength={100}
                    value={reviewer}
                    onChange={event => setReviewer(event.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label>
                  Decision
                  <select
                    value={decision}
                    onChange={event => setDecision(event.target.value)}
                  >
                    <option value="investigation_required">Investigation required</option>
                    <option value="revoke_requested">Revocation requested</option>
                    <option value="approved">Access approved</option>
                  </select>
                </label>
              </div>
              <label className="review-note">
                Reason and next steps
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="Explain the decision and any follow-up needed."
                />
              </label>
              <button className="save-review" type="submit">
                {saving ? 'Saving…' : 'Save decision'}
              </button>
            </fieldset>
          </form>

          {error && <p role="alert" className="review-error">{error}</p>}
          {message && <p role="status" className="review-success">{message}</p>}

          <h4>Review history</h4>
          {loading ? (
            <p role="status" className="review-help">Loading history…</p>
          ) : historyError ? (
            <div role="alert">
              <p className="review-error">{historyError}</p>
              <button type="button" onClick={retryHistory}>
                Retry history
              </button>
            </div>
          ) : reviews.length === 0 ? (
            <p className="review-help">No decisions recorded yet.</p>
          ) : (
            <ol className="review-history">
              {reviews.map(review => (
                <li key={review.id}>
                  <div className="history-heading">
                    <strong>{labels[review.decision] ?? review.decision}</strong>
                    <time dateTime={review.created_at}>
                      {new Date(review.created_at).toLocaleString()}
                    </time>
                  </div>
                  <p>{review.note}</p>
                  <small>Recorded by {review.reviewer}</small>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}

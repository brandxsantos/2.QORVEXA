import { useState } from 'react'
import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase.js'

const categories = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['bullying', 'Bullying'],
  ['hate_speech', 'Hate speech'],
  ['impersonation', 'Impersonation'],
  ['scam', 'Scam or fraud'],
  ['inappropriate', 'Inappropriate content'],
  ['threats', 'Threats'],
  ['misinformation', 'Misinformation'],
  ['other', 'Other'],
]

function ReportDialog({ target, onClose }) {
  const [category, setCategory] = useState('other')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submitReport(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const { error: rpcError } = await getSupabaseClient().rpc('submit_user_report', {
        reported_user_id: target.reportedUserId,
        target_type: target.type,
        target_id: target.id,
        category,
        description: description.trim(),
      })
      if (rpcError) throw rpcError
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError.message || 'The report could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <form className="admin-modal report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" onSubmit={submitReport} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close dialog"><X size={17} /></button>
        {submitted ? (
          <>
            <h2 id="report-dialog-title">Report received</h2>
            <p>Thank you. Authorized staff can review the report. Your identity is not shown to the reported user.</p>
            <div className="admin-modal-actions"><button className="admin-button admin-button--primary" type="button" onClick={onClose}>Done</button></div>
          </>
        ) : (
          <>
            <h2 id="report-dialog-title">Report this {target.type}</h2>
            <p>Reports are reviewed by authorized QORVEXA staff. Please provide enough detail to help assess the concern.</p>
            <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Description<textarea required minLength={5} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="What happened, and where should the moderation team look?" /></label>
            {error && <p className="admin-modal-error" role="alert"><AlertCircle size={14} />{error}</p>}
            <div className="admin-modal-actions"><button className="admin-button admin-button--secondary" type="button" onClick={onClose} disabled={submitting}>Cancel</button><button className="admin-button admin-button--primary" type="submit" disabled={submitting || description.trim().length < 5}>{submitting ? <LoaderCircle className="spinner" size={14} /> : null}{submitting ? 'Submitting…' : 'Submit report'}</button></div>
          </>
        )}
      </form>
    </div>
  )
}

export default ReportDialog

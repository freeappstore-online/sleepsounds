import { type ReactNode, useEffect, useId, useRef } from 'react'

/**
 * A modal dialog on the native <dialog> element: the browser keeps focus
 * inside, makes the page behind inert, closes on Escape and returns focus
 * to the button that opened it. It renders in the top layer, so no parent's
 * styles (like the player bar's blur) can trap it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="ss-dialog"
      aria-labelledby={`${id}-title`}
      // Escape and dialog.close() both end up here.
      onClose={() => {
        if (open) onClose()
      }}
      // A click on the backdrop lands on the <dialog> itself.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="ss-dialog-panel">
        <div className="ss-dialog-head">
          <h2 id={`${id}-title`} className="ss-dialog-title">
            {title}
          </h2>
          <button type="button" className="ss-icon-button" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="ss-dialog-body">{open && children}</div>
      </div>
    </dialog>
  )
}

/** A yes/no question, e.g. before deleting a saved mix. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className="ss-dialog-message">{message}</p>
      <div className="ss-dialog-actions">
        <button type="button" className="ss-chip-button" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="ss-button ss-button-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}

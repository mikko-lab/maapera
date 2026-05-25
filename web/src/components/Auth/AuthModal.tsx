import { useEffect, useRef } from 'react'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../../lib/supabase'

interface AuthModalProps {
  onClose: () => void
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus the close button when modal opens
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on overlay click (not on dialog click)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="auth-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
      onClick={handleOverlayClick}
    >
      <div ref={dialogRef} className="auth-dialog">
        <div className="auth-dialog-header">
          <h2 id="auth-dialog-title">Kirjaudu sisään</h2>
          <button
            ref={closeRef}
            className="panel-close"
            onClick={onClose}
            aria-label="Sulje kirjautumisikkuna"
          >
            ✕
          </button>
        </div>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#0f2558',
                  brandAccent: '#1e3a8a',
                  inputBackground: '#1e293b',
                  inputText: '#f1f5f9',
                  inputBorder: '#334155',
                  inputBorderFocus: '#3b82f6',
                },
              },
            },
          }}
          providers={[]}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Sähköposti',
                password_label: 'Salasana',
                button_label: 'Kirjaudu sisään',
                link_text: 'Onko sinulla jo tili? Kirjaudu sisään',
              },
              sign_up: {
                email_label: 'Sähköposti',
                password_label: 'Salasana (min. 6 merkkiä)',
                button_label: 'Rekisteröidy',
                link_text: 'Ei tiliä? Rekisteröidy',
              },
              forgotten_password: {
                link_text: 'Unohtuiko salasana?',
                button_label: 'Lähetä palautuslinkki',
              },
            },
          }}
        />
      </div>
    </div>
  )
}

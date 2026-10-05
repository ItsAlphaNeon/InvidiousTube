import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Logo } from '../icons';
import { useAuth } from '../stores/auth';
import { useLibrary } from '../stores/library';
import { useSettings } from '../stores/settings';
import { toast } from '../stores/ui';
import './login.css';

export function Login() {
  useDocumentTitle('Sign in');
  const login = useAuth((s) => s.login);
  const brand = useSettings((s) => s.brand);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'user' | 'password'>('user');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step === 'user') {
      if (!username.trim()) {
        setError('Enter your Invidious username');
        return;
      }
      setError(null);
      setStep('password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      qc.invalidateQueries();
      const localSubs = useLibrary.getState().subscriptions.length;
      toast(localSubs ? 'Signed in. You can import your local subscriptions in Settings.' : 'Signed in');
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <Logo brand={brand} />
        </div>
        <h1 className="login-title">{step === 'user' ? 'Sign in' : `Hi ${username}`}</h1>
        <p className="login-sub">{step === 'user' ? `with your Invidious account to continue to ${brand}` : 'Enter your password to continue'}</p>
        {step === 'user' ? (
          <label className="login-field">
            <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder=" " autoComplete="username" />
            <span>Username</span>
          </label>
        ) : (
          <label className="login-field">
            <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder=" " autoComplete="current-password" />
            <span>Enter your password</span>
          </label>
        )}
        {error && <div className="login-error">{error}</div>}
        <p className="login-note">
          Not signed in? Subscriptions, history and playlists are kept in this browser. Signing in syncs them through your Invidious instance.
        </p>
        <div className="login-actions">
          {step === 'password' ? (
            <button type="button" className="login-link" onClick={() => setStep('user')}>
              Back
            </button>
          ) : (
            <Link to="/" className="login-link">
              Continue without signing in
            </Link>
          )}
          <button type="submit" className="login-next" disabled={busy}>
            {busy ? 'Signing in…' : 'Next'}
          </button>
        </div>
      </form>
    </div>
  );
}

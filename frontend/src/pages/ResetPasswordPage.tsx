import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { BrandMark } from '../components/BrandMark';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = Boolean(token) && password.length >= 8 && passwordsMatch;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark big">
              <BrandMark variant="orange" size={34} glow />
            </span>
            <h1>Link inválido</h1>
            <p>Este link de recuperação está incompleto ou já foi usado.</p>
          </div>
          <Link to="/forgot-password" className="btn btn-primary btn-block">
            Pedir novo link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-mark big">
            <BrandMark variant="orange" size={34} glow />
          </span>
          <h1>Redefinir senha</h1>
          <p>Escolha uma nova senha para sua conta.</p>
        </div>

        <label className="field">
          <span>Nova senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span>Confirmar nova senha</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={confirmPassword.length > 0 && !passwordsMatch ? 'input-bad' : ''}
            required
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <span className="field-hint bad">As senhas não coincidem.</span>
          )}
        </label>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit || submitting}>
          {submitting ? 'Salvando…' : 'Redefinir senha'}
        </button>

        <div className="login-hint">
          <Link to="/login" className="trial-link">
            Voltar para o login
          </Link>
        </div>
      </form>
    </div>
  );
}

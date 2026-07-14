import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandMark';

const HERO_FEATURES = [
  'Atendimento e funil de vendas num só lugar',
  'Estoque, crédito e financeiro integrados',
  'Co-Piloto de IA que responde seus leads',
];

export function LoginPage() {
  const { user, initializing, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!initializing && user) return <Navigate to="/tickets" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/tickets');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. A API está no ar?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-split">
      {/* Painel-herói (cor 1 — laranja ignição da marca) */}
      <aside className="auth-hero">
        <div className="auth-hero-glow" aria-hidden />
        <div className="auth-hero-inner">
          <span className="auth-hero-mark">
            <BrandMark variant="white" size={30} glow />
          </span>
          <h2 className="auth-hero-title">
            CRM<span>Auto</span>
          </h2>
          <p className="auth-hero-tag">A plataforma dos bons negócios sobre rodas.</p>
          <ul className="auth-hero-features">
            {HERO_FEATURES.map((f) => (
              <li key={f}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <span className="auth-hero-foot">© {new Date().getFullYear()} CRM Auto</span>
      </aside>

      {/* Painel de acesso (cor 2 — fundo neutro da paleta), login puxado à direita */}
      <main className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <div className="auth-card-head">
            <h1>Acesse sua conta</h1>
            <p>Bem-vindo de volta 👋</p>
          </div>

          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@loja.com.br"
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <div className="login-divider">
            <span>ainda não é cliente?</span>
          </div>
          <Link to="/trial" className="btn btn-ghost btn-block trial-cta">
            🚀 Teste grátis de 15 dias
          </Link>

          <div className="login-hint">
            <strong>Acesso de demonstração</strong>
            <span>admin@crm.local · Admin@123</span>
            <span>carlos@crm.local · Vendedor@123</span>
          </div>
        </form>
      </main>
    </div>
  );
}

// Auth page with generic styling (auth-* classes, no brand-specific naming)
// This prevents accidental re-introduction of brand-specific elements during refactoring

import { useState, useRef, useEffect } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import api from '../api/client';

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

function StarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      starsRef.current = Array.from({ length: 180 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 0.3 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of starsRef.current) {
        const opacity = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.8 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 190, 255, ${opacity})`;
        ctx.fill();
      }
      t += 0.016;
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-stars-canvas" />;
}

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const { login, register } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ registrationEnabled: boolean }>('/auth/registration-status')
      .then(r => {
        setRegistrationEnabled(r.data.registrationEnabled);
        if (!r.data.registrationEnabled) setActiveTab('login');
      })
      .catch(() => { /* default: enabled */ });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) return;
    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      message.error(error.response?.data?.error || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* ─── Левая панель ─── */}
      <div className="auth-left">
        {/* Логотип */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="8" y1="8" x2="3" y2="3" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
              <line x1="8" y1="8" x2="13" y2="4" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
              <line x1="8" y1="8" x2="13" y2="12" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
              <line x1="8" y1="8" x2="4" y2="13" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
              <line x1="8" y1="8" x2="8" y2="2" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
              <circle cx="8" cy="8" r="2.2" fill="white" />
              <circle cx="3" cy="3" r="1.2" fill="rgba(255,255,255,0.7)" />
              <circle cx="13" cy="4" r="1.2" fill="rgba(255,255,255,0.7)" />
              <circle cx="13" cy="12" r="1.2" fill="rgba(255,255,255,0.7)" />
              <circle cx="4" cy="13" r="1.2" fill="rgba(255,255,255,0.7)" />
              <circle cx="8" cy="2" r="1.2" fill="rgba(255,255,255,0.7)" />
            </svg>
          </div>
          <span className="auth-logo-text">Flow Universe</span>
        </div>

        {/* Форма */}
        <div className="auth-form-wrap">
          <h1 className="auth-heading">Добро пожаловать</h1>
          <p className="auth-subheading">Войдите в систему управления проектами</p>

          {/* Табы */}
          <div className="auth-tabs">
            <button
              className={`auth-tab${activeTab === 'login' ? ' auth-tab--active' : ''}`}
              onClick={() => setActiveTab('login')}
              type="button"
            >
              Войти
            </button>
            {registrationEnabled && (
              <button
                className={`auth-tab${activeTab === 'register' ? ' auth-tab--active' : ''}`}
                onClick={() => setActiveTab('register')}
                type="button"
              >
                Регистрация
              </button>
            )}
          </div>

          {!registrationEnabled && activeTab === 'register' && (
            <p className="auth-subheading" style={{ color: 'var(--s-medium)', marginTop: 'var(--space-5)' }}>
              Регистрация временно недоступна. Обратитесь к администратору.
            </p>
          )}

          {activeTab === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="auth-field">
                <label className="auth-label">Email</label>
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Пароль</label>
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button className="auth-btn" type="submit" disabled={loading}>
                {loading ? 'Вход...' : 'Войти'}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegister}>
              <div className="auth-field">
                <label className="auth-label">Имя</label>
                <input
                  className="auth-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Иван Петров"
                  required
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Email</label>
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Пароль</label>
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>
              <button className="auth-btn" type="submit" disabled={loading}>
                {loading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </form>
          )}
        </div>

        {/* Футер */}
        <div className="auth-footer">Flow Universe · © 2026</div>
      </div>

      {/* ─── Правая панель (космос) ─── */}
      <div className="auth-right">
        <StarCanvas />

        {/* Туманности */}
        <div className="auth-nebula auth-nebula--1" />
        <div className="auth-nebula auth-nebula--2" />
        <div className="auth-nebula auth-nebula--3" />

        {/* Орбитальные кольца */}
        <div className="auth-orbits">
          <div className="auth-orbit auth-orbit--1" />
          <div className="auth-orbit auth-orbit--2" />
          <div className="auth-orbit auth-orbit--3" />
          <div className="auth-orbit auth-orbit--4" />
          {/* Центральный орб */}
          <div className="auth-orb" />
        </div>

        {/* Hero-текст */}
        <div className="auth-hero">
          <div className="auth-hero-title">
            Flow<br />Universe
          </div>
          <div className="auth-hero-desc">
            Система управления проектами нового поколения
          </div>
        </div>
      </div>
    </div>
  );
}

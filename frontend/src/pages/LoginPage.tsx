import { useState, useRef, useEffect } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

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

  return <canvas ref={canvasRef} className="moex-stars-canvas" />;
}

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { login, register } = useAuthStore();
  const navigate = useNavigate();

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
    <div className="moex-shell">
      {/* ─── Левая панель ─── */}
      <div className="moex-left">
        {/* Логотип */}
        <div className="moex-logo">
          <div className="moex-logo-icon">
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
          <span className="moex-logo-text">MOEX Flow Universe</span>
        </div>

        {/* Форма */}
        <div className="moex-form-wrap">
          <h1 className="moex-heading">Войти в систему</h1>
          <p className="moex-subheading">Добро пожаловать в MOEX Flow Universe</p>

          {/* Табы */}
          <div className="moex-tabs">
            <button
              className={`moex-tab${activeTab === 'login' ? ' moex-tab--active' : ''}`}
              onClick={() => setActiveTab('login')}
              type="button"
            >
              Войти
            </button>
            <button
              className={`moex-tab${activeTab === 'register' ? ' moex-tab--active' : ''}`}
              onClick={() => setActiveTab('register')}
              type="button"
            >
              Регистрация
            </button>
          </div>

          {activeTab === 'login' ? (
            <form className="moex-form" onSubmit={handleLogin}>
              <div className="moex-field">
                <label className="moex-label">Email</label>
                <input
                  className="moex-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="moex-field">
                <label className="moex-label">Пароль</label>
                <input
                  className="moex-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <button className="moex-btn" type="submit" disabled={loading}>
                {loading ? 'Вход...' : 'Войти'}
              </button>
            </form>
          ) : (
            <form className="moex-form" onSubmit={handleRegister}>
              <div className="moex-field">
                <label className="moex-label">Имя</label>
                <input
                  className="moex-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Иван Петров"
                  required
                />
              </div>
              <div className="moex-field">
                <label className="moex-label">Email</label>
                <input
                  className="moex-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="moex-field">
                <label className="moex-label">Пароль</label>
                <input
                  className="moex-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>
              <button className="moex-btn" type="submit" disabled={loading}>
                {loading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </form>
          )}
        </div>

        {/* Футер */}
        <div className="moex-footer">© 2025 MOEX Flow Universe</div>
      </div>

      {/* ─── Правая панель (космос) ─── */}
      <div className="moex-right">
        <StarCanvas />

        {/* Туманности */}
        <div className="moex-nebula moex-nebula--1" />
        <div className="moex-nebula moex-nebula--2" />
        <div className="moex-nebula moex-nebula--3" />

        {/* Орбитальные кольца */}
        <div className="moex-orbits">
          <div className="moex-orbit moex-orbit--1" />
          <div className="moex-orbit moex-orbit--2" />
          <div className="moex-orbit moex-orbit--3" />
          <div className="moex-orbit moex-orbit--4" />
          {/* Центральный орб */}
          <div className="moex-orb" />
        </div>

        {/* Hero-текст */}
        <div className="moex-hero">
          <div className="moex-hero-label">MOEX</div>
          <div className="moex-hero-title">
            Flow<br />Universe
          </div>
          <div className="moex-hero-desc">
            Система управления проектами нового поколения
          </div>
        </div>
      </div>
    </div>
  );
}

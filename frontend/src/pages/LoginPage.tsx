/**
 * LoginPage — rebuilt from Paper artboards 4O8-0 (dark) + 4Q9-0 (light).
 * Zero CSS classes, zero Ant Design layout. All values from Paper JSX export.
 */
import { useState, useEffect } from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useThemeStore } from '../store/theme.store';
import api from '../api/client';

// ─── Tokens Dark (Paper 4O8-0) ───────────────────────────────────────────────
const DARK = {
  pageBg:          '#080B14',
  leftBg:          '#0F1320',
  leftBorderRight: 'none',
  title:           '#E2E8F8',
  sub:             '#8B949E',
  label:           '#C9D1D9',
  inputBg:         '#161B22',
  inputBorder:     '#30363D',
  inputIcon:       '#484F58',
  inputPlaceholder:'#3D4D6B',
  inputText:       '#E2E8F8',
  forgot:          '#4F6EF7',
  footer:          '#484F58',
  heroTitle:       '#FFFFFF',
  heroSub:         '#7C6FA8',
};

// ─── Tokens Light (Paper 4Q9-0) ──────────────────────────────────────────────
const LIGHT = {
  pageBg:          '#F6F8FA',
  leftBg:          '#FFFFFF',
  leftBorderRight: '1px solid #D0D7DE',
  title:           '#1F2328',
  sub:             '#656D76',
  label:           '#1F2328',
  inputBg:         '#F6F8FA',
  inputBorder:     '#D0D7DE',
  inputIcon:       '#8C959F',
  inputPlaceholder:'#8C959F',
  inputText:       '#1F2328',
  forgot:          '#4F6EF7',
  footer:          '#8C959F',
  heroTitle:       '#2E1065',
  heroSub:         '#6D28D9',
};

const LOGO_GRAD = 'linear-gradient(in oklab 135deg, oklab(59.3% -0.002 -0.207) 0%, oklab(54.1% 0.096 -0.227) 100%)';
const ACC_FOCUS_SHADOW = '#4F6EF71A 0px 0px 0px 3px';

// ─── SVG Right Panel — Dark ──────────────────────────────────────────────────
function DarkPanel({ heroTitle, heroSub }: { heroTitle: string; heroSub: string }) {
  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', minHeight: '100vh' }}>
      <svg viewBox="0 0 840 900" xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="lg_d0" cx="55%" cy="43%" r="75%">
            <stop offset="0%" stopColor="#14082E"/>
            <stop offset="40%" stopColor="#0A0518"/>
            <stop offset="100%" stopColor="#03020C"/>
          </radialGradient>
          <radialGradient id="lg_d1" cx="55%" cy="43%" r="55%">
            <stop offset="0%" stopColor="#5B21B6" stopOpacity="0.45"/>
            <stop offset="30%" stopColor="#4C1D95" stopOpacity="0.25"/>
            <stop offset="60%" stopColor="#2D1B69" stopOpacity="0.10"/>
            <stop offset="100%" stopColor="#03020C" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="lg_d2" cx="85%" cy="70%" r="45%">
            <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.20"/>
            <stop offset="60%" stopColor="#1E3A8A" stopOpacity="0.05"/>
            <stop offset="100%" stopColor="#03020C" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="lg_d3" cx="38%" cy="32%" r="65%">
            <stop offset="0%" stopColor="#A78BFA"/>
            <stop offset="25%" stopColor="#7C3AED"/>
            <stop offset="55%" stopColor="#4C1D95"/>
            <stop offset="80%" stopColor="#1E0759"/>
            <stop offset="100%" stopColor="#0D0330"/>
          </radialGradient>
          <radialGradient id="lg_d4" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="#7C3AED" stopOpacity="0"/>
            <stop offset="85%" stopColor="#8B5CF6" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="840" height="900" fill="url(#lg_d0)"/>
        <rect width="840" height="900" fill="url(#lg_d1)"/>
        <rect width="840" height="900" fill="url(#lg_d2)"/>
        {/* Stars */}
        <circle cx="55" cy="45" r="1.5" fill="#FFF" opacity="0.85"/>
        <circle cx="180" cy="28" r="1.2" fill="#FFF" opacity="0.8"/>
        <circle cx="340" cy="52" r="1.4" fill="#FFF" opacity="0.7"/>
        <circle cx="620" cy="35" r="1.5" fill="#FFF" opacity="0.75"/>
        <circle cx="720" cy="70" r="1.2" fill="#FFF" opacity="0.9"/>
        <circle cx="790" cy="25" r="1" fill="#FFF" opacity="0.8"/>
        <circle cx="820" cy="110" r="1.3" fill="#FFF" opacity="0.7"/>
        <circle cx="30" cy="160" r="1.1" fill="#FFF" opacity="0.65"/>
        <circle cx="118" cy="215" r="1.4" fill="#C4B5FD" opacity="0.8"/>
        <circle cx="775" cy="195" r="1.2" fill="#FFF" opacity="0.7"/>
        <circle cx="835" cy="280" r="1" fill="#FFF" opacity="0.75"/>
        <circle cx="62" cy="740" r="1.3" fill="#FFF" opacity="0.6"/>
        <circle cx="195" cy="780" r="1.1" fill="#A5B4FC" opacity="0.7"/>
        <circle cx="310" cy="820" r="1.4" fill="#FFF" opacity="0.55"/>
        <circle cx="760" cy="750" r="1.2" fill="#FFF" opacity="0.65"/>
        <circle cx="820" cy="810" r="1" fill="#FFF" opacity="0.7"/>
        <circle cx="85" cy="90" r="0.9" fill="#FFF" opacity="0.55"/>
        <circle cx="250" cy="75" r="0.8" fill="#FFF" opacity="0.5"/>
        <circle cx="480" cy="48" r="0.9" fill="#FFF" opacity="0.45"/>
        <circle cx="40" cy="330" r="1" fill="#FFF" opacity="0.5"/>
        <circle cx="805" cy="380" r="0.9" fill="#FFF" opacity="0.55"/>
        <circle cx="830" cy="450" r="1" fill="#C4B5FD" opacity="0.45"/>
        <circle cx="820" cy="560" r="0.9" fill="#FFF" opacity="0.5"/>
        <circle cx="55" cy="600" r="1" fill="#FFF" opacity="0.45"/>
        <circle cx="40" cy="490" r="0.8" fill="#FFF" opacity="0.5"/>
        <line x1="55" y1="41" x2="55" y2="49" stroke="#FFF" strokeWidth="0.7" opacity="0.5"/>
        <line x1="51" y1="45" x2="59" y2="45" stroke="#FFF" strokeWidth="0.7" opacity="0.5"/>
        <line x1="720" y1="66" x2="720" y2="74" stroke="#FFF" strokeWidth="0.6" opacity="0.45"/>
        <line x1="716" y1="70" x2="724" y2="70" stroke="#FFF" strokeWidth="0.6" opacity="0.45"/>
        {/* Planet */}
        <circle cx="470" cy="385" r="115" fill="url(#lg_d4)"/>
        <circle cx="470" cy="385" r="88" fill="url(#lg_d3)"/>
        <ellipse cx="470" cy="372" rx="88" ry="12" fill="#FFFFFF08"/>
        <ellipse cx="470" cy="398" rx="88" ry="8" fill="#FFFFFF05"/>
        <circle cx="470" cy="385" r="88" fill="none" stroke="#A78BFA4D" strokeWidth="2"/>
        {/* Orbits */}
        <circle cx="470" cy="385" r="140" fill="none" stroke="#7C3AED59"/>
        <circle cx="470" cy="385" r="210" fill="none" stroke="#6D28D940"/>
        <circle cx="470" cy="385" r="295" fill="none" stroke="#5B21B62E"/>
        <circle cx="470" cy="385" r="390" fill="none" stroke="#4C1D951F"/>
        {/* Satellites */}
        <circle cx="569" cy="286" r="4" fill="#A78BFA" opacity="0.9"/>
        <circle cx="569" cy="286" r="7" fill="#7C3AED" opacity="0.2"/>
        <circle cx="422" cy="516" r="3.5" fill="#C4B5FD" opacity="0.85"/>
        <circle cx="371" cy="286" r="4" fill="#DDD6FE" opacity="0.8"/>
        <circle cx="542" cy="188" r="4.5" fill="#8B5CF6" opacity="0.9"/>
        <circle cx="667" cy="457" r="3.5" fill="#A78BFA" opacity="0.8"/>
        <circle cx="288" cy="490" r="4" fill="#C4B5FD" opacity="0.85"/>
        <circle cx="737" cy="261" r="4" fill="#7C3AED" opacity="0.85"/>
        <circle cx="175" cy="385" r="4.5" fill="#A78BFA" opacity="0.8"/>
        <line x1="155" y1="118" x2="205" y2="138" stroke="#FFF" opacity="0.3"/>
        <circle cx="155" cy="118" r="1.5" fill="#FFF" opacity="0.55"/>
      </svg>
      {/* Hero text — bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
        paddingBottom: 52, paddingLeft: 56, paddingRight: 56, paddingTop: 48,
      }}>
        <div style={{
          color: heroTitle, fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontSize: 64, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: '95%',
          whiteSpace: 'pre-wrap',
        }}>Flow{'\n'}Universe</div>
        <div style={{
          color: heroSub, fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: 14, lineHeight: '150%', maxWidth: 340,
        }}>Система управления проектами нового поколения</div>
      </div>
    </div>
  );
}

// ─── SVG Right Panel — Light ─────────────────────────────────────────────────
function LightPanel({ heroTitle, heroSub }: { heroTitle: string; heroSub: string }) {
  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', minHeight: '100vh' }}>
      <svg viewBox="0 0 840 900" xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="lg_l0" cx="55%" cy="43%" r="80%">
            <stop offset="0%" stopColor="#EDE9FE"/>
            <stop offset="45%" stopColor="#F5F3FF"/>
            <stop offset="100%" stopColor="#FDFCFF"/>
          </radialGradient>
          <radialGradient id="lg_l1" cx="55%" cy="43%" r="52%">
            <stop offset="0%" stopColor="#DDD6FE" stopOpacity="0.7"/>
            <stop offset="35%" stopColor="#C4B5FD" stopOpacity="0.35"/>
            <stop offset="65%" stopColor="#EDE9FE" stopOpacity="0.12"/>
            <stop offset="100%" stopColor="#FDFCFF" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="lg_l2" cx="85%" cy="78%" r="40%">
            <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.35"/>
            <stop offset="60%" stopColor="#E0F2FE" stopOpacity="0.12"/>
            <stop offset="100%" stopColor="#FDFCFF" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="lg_l3" cx="10%" cy="12%" r="38%">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.25"/>
            <stop offset="60%" stopColor="#FEF3C7" stopOpacity="0.08"/>
            <stop offset="100%" stopColor="#FDFCFF" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="lg_l4" cx="32%" cy="28%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF"/>
            <stop offset="15%" stopColor="#EDE9FE"/>
            <stop offset="40%" stopColor="#C4B5FD"/>
            <stop offset="70%" stopColor="#8B5CF6"/>
            <stop offset="100%" stopColor="#5B21B6"/>
          </radialGradient>
          <radialGradient id="lg_l5" cx="50%" cy="50%" r="50%">
            <stop offset="65%" stopColor="#A78BFA" stopOpacity="0"/>
            <stop offset="82%" stopColor="#C4B5FD" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="#DDD6FE" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <rect width="840" height="900" fill="url(#lg_l0)"/>
        <rect width="840" height="900" fill="url(#lg_l1)"/>
        <rect width="840" height="900" fill="url(#lg_l2)"/>
        <rect width="840" height="900" fill="url(#lg_l3)"/>
        {/* Stars (muted for light) */}
        <circle cx="55" cy="45" r="1.5" fill="#7C3AED" opacity="0.2"/>
        <circle cx="180" cy="28" r="1.2" fill="#6D28D9" opacity="0.18"/>
        <circle cx="340" cy="52" r="1.4" fill="#8B5CF6" opacity="0.16"/>
        <circle cx="620" cy="35" r="1.3" fill="#7C3AED" opacity="0.2"/>
        <circle cx="720" cy="70" r="1.2" fill="#6D28D9" opacity="0.15"/>
        <circle cx="790" cy="25" r="1" fill="#8B5CF6" opacity="0.18"/>
        <circle cx="820" cy="110" r="1.3" fill="#7C3AED" opacity="0.16"/>
        <circle cx="118" cy="215" r="1.2" fill="#8B5CF6" opacity="0.2"/>
        <circle cx="805" cy="380" r="0.8" fill="#8B5CF6" opacity="0.14"/>
        <line x1="55" y1="41" x2="55" y2="49" stroke="#8B5CF6" strokeWidth="0.7" opacity="0.2"/>
        <line x1="51" y1="45" x2="59" y2="45" stroke="#8B5CF6" strokeWidth="0.7" opacity="0.2"/>
        {/* Planet */}
        <circle cx="470" cy="385" r="115" fill="url(#lg_l5)"/>
        <circle cx="470" cy="385" r="88" fill="url(#lg_l4)"/>
        <ellipse cx="470" cy="372" rx="88" ry="11" fill="#FFFFFF1F"/>
        <ellipse cx="470" cy="396" rx="88" ry="7" fill="#FFFFFF12"/>
        <circle cx="470" cy="385" r="88" fill="none" stroke="#FFFFFF59" strokeWidth="1.5"/>
        <circle cx="470" cy="385" r="88" fill="none" stroke="#C4B5FD66" strokeWidth="0.5"/>
        {/* Orbits */}
        <circle cx="470" cy="385" r="140" fill="none" stroke="#8B5CF638" strokeWidth="1.2"/>
        <circle cx="470" cy="385" r="210" fill="none" stroke="#7C3AED26"/>
        <circle cx="470" cy="385" r="295" fill="none" stroke="#6D28D91A"/>
        <circle cx="470" cy="385" r="390" fill="none" stroke="#5B21B612"/>
        {/* Satellites */}
        <circle cx="569" cy="286" r="4" fill="#A78BFA" opacity="0.75"/>
        <circle cx="569" cy="286" r="8" fill="#C4B5FD" opacity="0.15"/>
        <circle cx="422" cy="516" r="3.5" fill="#8B5CF6" opacity="0.7"/>
        <circle cx="371" cy="286" r="4" fill="#DDD6FE" opacity="0.85"/>
        <circle cx="542" cy="188" r="4.5" fill="#7C3AED" opacity="0.5"/>
        <circle cx="667" cy="457" r="3.5" fill="#38BDF8" opacity="0.55"/>
        <circle cx="288" cy="490" r="4" fill="#34D399" opacity="0.5"/>
        <circle cx="365" cy="203" r="3" fill="#F9A8D4" opacity="0.6"/>
        <circle cx="737" cy="261" r="4" fill="#8B5CF6" opacity="0.45"/>
        <circle cx="175" cy="385" r="4.5" fill="#7C3AED" opacity="0.4"/>
        <line x1="155" y1="118" x2="205" y2="138" stroke="#8B5CF6" strokeWidth="0.8" opacity="0.18"/>
        <circle cx="155" cy="118" r="1.5" fill="#8B5CF6" opacity="0.3"/>
      </svg>
      {/* Hero text */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
        paddingBottom: 52, paddingLeft: 56, paddingRight: 56, paddingTop: 48,
      }}>
        <div style={{
          color: heroTitle, fontFamily: '"Space Grotesk", system-ui, sans-serif',
          fontSize: 64, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: '95%',
          whiteSpace: 'pre-wrap',
        }}>Flow{'\n'}Universe</div>
        <div style={{
          color: heroSub, fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: 14, lineHeight: '150%', maxWidth: 340, opacity: 0.65,
        }}>Система управления проектами нового поколения</div>
      </div>
    </div>
  );
}

// ─── Logo SVG ────────────────────────────────────────────────────────────────
function LogoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#FFFFFF"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#FFFFFF"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#FFFFFF"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#FFFFFF"/>
    </svg>
  );
}

// ─── Input field ─────────────────────────────────────────────────────────────
function Field({
  label, rightLabel, rightColor, type, value, onChange, placeholder, autoComplete, minLength, C,
}: {
  label: string;
  rightLabel?: string;
  rightColor?: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  minLength?: number;
  C: typeof DARK;
}) {
  const [focused, setFocused] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPwd ? 'text' : type;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ color: C.label, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, fontWeight: 500, lineHeight: '16px' }}>
          {label}
        </div>
        {rightLabel && (
          <div style={{ color: rightColor, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 12, lineHeight: '16px', cursor: 'pointer' }}>
            {rightLabel}
          </div>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        backgroundColor: C.inputBg,
        border: `${focused ? '1.5px' : '1px'} solid ${focused ? '#4F6EF7' : C.inputBorder}`,
        boxShadow: focused ? ACC_FOCUS_SHADOW : 'none',
        borderRadius: 8, padding: '11px 14px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>
        {/* Icon */}
        {type === 'email' ? (
          <svg width="14" height="14" fill="none" stroke={C.inputIcon} strokeWidth="1.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M2 7l10 7 10-7"/>
          </svg>
        ) : isPassword ? (
          <svg width="14" height="14" fill="none" stroke={C.inputIcon} strokeWidth="1.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        ) : (
          <svg width="14" height="14" fill="none" stroke={C.inputIcon} strokeWidth="1.5" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        )}
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: value ? C.inputText : C.inputPlaceholder,
            fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px',
          }}
        />
        {isPassword && (
          <svg
            width="14" height="14" fill="none" stroke={C.inputIcon} strokeWidth="1.5"
            viewBox="0 0 24 24" style={{ flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setShowPwd(v => !v)}
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const { mode } = useThemeStore();
  const C = mode === 'light' ? LIGHT : DARK;
  const isLight = mode === 'light';

  const [loading, setLoading] = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const { login, register } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ registrationEnabled: boolean }>('/auth/registration-status')
      .then(r => setRegistrationEnabled(r.data.registrationEnabled))
      .catch(() => {});
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

  const CWithFocus = { ...C, inputFocusBorder: '#4F6EF7' };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: C.pageBg, overflow: 'hidden' }}>

      {/* ── Left panel ── */}
      <div style={{
        width: 600, minWidth: 480, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.leftBg,
        borderRight: C.leftBorderRight,
        padding: '60px 60px',
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            backgroundImage: LOGO_GRAD,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LogoIcon/>
          </div>
          <div style={{
            color: C.title, fontFamily: '"Space Grotesk", system-ui, sans-serif',
            fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: '28px', flexShrink: 0,
          }}>
            Flow Universe
          </div>
        </div>

        {/* Form */}
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{
            color: C.title, fontFamily: '"Space Grotesk", system-ui, sans-serif',
            fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: '32px',
            marginBottom: 6, textAlign: 'center',
          }}>
            {showRegister ? 'Регистрация' : 'Добро пожаловать'}
          </div>
          <div style={{
            color: C.sub, fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 14, lineHeight: '18px', marginBottom: 32, textAlign: 'center',
          }}>
            {showRegister ? 'Создайте аккаунт Flow Universe' : 'Войдите в систему управления проектами'}
          </div>

          <form onSubmit={showRegister ? handleRegister : handleLogin}>
            {showRegister && (
              <Field
                label="Имя" type="text" value={name} onChange={setName}
                placeholder="Иван Петров" autoComplete="name" C={CWithFocus}
              />
            )}
            <Field
              label="Email" type="email" value={email} onChange={setEmail}
              placeholder="p.novak@tasktime.ru" autoComplete="email" C={CWithFocus}
            />
            <div style={{ marginBottom: 24 }}>
              <Field
                label="Пароль"
                rightLabel={showRegister ? undefined : 'Забыли пароль?'}
                rightColor={C.forgot}
                type="password" value={password} onChange={setPassword}
                placeholder="••••••••" autoComplete={showRegister ? 'new-password' : 'current-password'}
                minLength={showRegister ? 8 : undefined}
                C={CWithFocus}
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                backgroundImage: LOGO_GRAD, padding: '13px',
                marginBottom: 20, opacity: loading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{
                color: '#FFFFFF', fontFamily: '"Space Grotesk", system-ui, sans-serif',
                fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: '18px',
              }}>
                {loading ? (showRegister ? 'Регистрация...' : 'Вход...') : (showRegister ? 'Зарегистрироваться' : 'Войти')}
              </span>
            </button>
          </form>

          {/* Switch login/register */}
          {registrationEnabled && (
            <div style={{ textAlign: 'center' }}>
              <span style={{ color: C.sub, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, lineHeight: '16px' }}>
                {showRegister ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
              </span>
              <span
                onClick={() => setShowRegister(v => !v)}
                style={{ color: C.forgot, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, fontWeight: 500, lineHeight: '16px', cursor: 'pointer' }}
              >
                {showRegister ? 'Войти' : 'Зарегистрироваться'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute', bottom: 32, textAlign: 'center',
          color: C.footer, fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, lineHeight: '14px',
        }}>
          Flow Universe · © 2026
        </div>
      </div>

      {/* ── Right panel ── */}
      {isLight
        ? <LightPanel heroTitle={C.heroTitle} heroSub={C.heroSub}/>
        : <DarkPanel  heroTitle={C.heroTitle} heroSub={C.heroSub}/>
      }
    </div>
  );
}

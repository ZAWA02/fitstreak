import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAuth() {
    setLoading(true)
    setError('')
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({ id: data.user.id, username })
          if (profileError) throw profileError
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
      router.push('/')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg3)', border: '0.5px solid var(--muted2)',
    borderRadius: 8, padding: '11px 14px', color: 'var(--text)', fontSize: 14,
    fontFamily: "'DM Sans'", outline: 'none', display: 'block', marginBottom: 12,
  }

  return (
    <div style={{ width: '100%', maxWidth: 375, padding: '60px 24px' }}>
      <div style={{ fontFamily: "'Bebas Neue'", fontSize: 40, letterSpacing: 3, color: 'var(--accent)', marginBottom: 4 }}>FITSTREAK</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 36 }}>
        {isSignUp ? 'アカウントを作成する' : 'ログインする'}
      </div>

      {isSignUp && (
        <input value={username} onChange={e => setUsername(e.target.value)}
          placeholder="ユーザー名（例: taro_gym）" style={inp} />
      )}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="メールアドレス" style={inp} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="パスワード（6文字以上）" style={{ ...inp, marginBottom: 20 }} />

      {error && (
        <div style={{ fontSize: 12, color: '#ff4444', marginBottom: 12, padding: '8px 12px', background: '#2a0a0a', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <button onClick={handleAuth} disabled={loading}
        style={{ width: '100%', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: 14, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans'", marginBottom: 16 }}>
        {loading ? '処理中...' : isSignUp ? 'アカウント作成' : 'ログイン'}
      </button>

      <button onClick={() => { setIsSignUp(!isSignUp); setError('') }}
        style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', width: '100%' }}>
        {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : 'アカウントを新規作成する'}
      </button>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

// ============ 定数 ============
const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土']
const DAYS_FULL = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜']
const MUSCLES = ['胸', '背中', '脚', '肩', '腕', '腹筋', '有酸素', '休み']
const MUSCLE_COLORS: Record<string, string> = {
  胸: '#f472b6', 背中: '#60a5fa', 脚: '#fbbf24', 肩: '#a78bfa',
  腕: '#f97316', 腹筋: '#34d399', 有酸素: '#22d3ee', 休み: '#334',
}
const PRESETS: Record<string, string[]> = {
  胸: ['ベンチプレス', 'インクラインDB', 'ケーブルクロス'],
  背中: ['デッドリフト', 'ラットプルダウン', 'ワンハンドロウ'],
  脚: ['スクワット', 'レッグプレス', 'レッグカール'],
  肩: ['ショルダープレス', 'サイドレイズ', 'フロントレイズ'],
  腕: ['バーベルカール', 'トライセップスPD', 'ハンマーカール'],
  腹筋: ['クランチ', 'レッグレイズ', 'プランク'],
  有酸素: ['ランニング', 'バイク', 'ローイング'],
}
const LEVELS = [
  { lv: 1, name: 'BEGINNER', icon: 'ti-seedling', color: '#888', bg: '#1a1a1a', needXP: 0 },
  { lv: 2, name: 'TRAINEE', icon: 'ti-barbell', color: '#c8ff00', bg: '#1a1f00', needXP: 5 },
  { lv: 3, name: 'ATHLETE', icon: 'ti-run', color: '#00bfff', bg: '#001a2a', needXP: 15 },
  { lv: 4, name: 'CHAMPION', icon: 'ti-medal', color: '#bf5fff', bg: '#1a0a2a', needXP: 30 },
  { lv: 5, name: 'LEGEND', icon: 'ti-crown', color: '#ff4444', bg: '#2a0a0a', needXP: 60 },
]
const BADGES = [
  { id: 'first', name: '初陣', icon: 'ti-sword', cond: '初記録', ac: '#c8ff00' },
  { id: 's3', name: '3日', icon: 'ti-flame', cond: '3日連続', ac: '#ffa500' },
  { id: 's7', name: '1週間', icon: 'ti-calendar-week', cond: '7日連続', ac: '#ffa500' },
  { id: 's30', name: '1ヶ月', icon: 'ti-calendar-month', cond: '30日連続', ac: '#ff6600' },
  { id: 's100', name: '100日', icon: 'ti-crown', cond: '100日連続', ac: '#ff4444' },
  { id: 'w10', name: '10回', icon: 'ti-check', cond: '総10回', ac: '#00bfff' },
  { id: 'w50', name: '50回', icon: 'ti-star', cond: '総50回', ac: '#bf5fff' },
  { id: 'vol', name: '1tクラブ', icon: 'ti-weight', cond: '累計1000kg', ac: '#c8ff00' },
  { id: 'all', name: '全部位', icon: 'ti-body-scan', cond: '全部位記録', ac: '#bf5fff' },
  { id: 'pr1', name: '初PR', icon: 'ti-rocket', cond: 'PR更新', ac: '#00bfff' },
  { id: 'pr5', name: 'PR5種', icon: 'ti-bolt', cond: '5種目PR', ac: '#ffa500' },
  { id: 'lv3', name: 'ATHLETE', icon: 'ti-run', cond: 'Lv.3到達', ac: '#00bfff' },
]

// ============ 型 ============
interface SetRow { w: string; r: string; done: boolean }
interface Exercise { id: string; name: string; sets: SetRow[] }
interface WorkoutRecord { id: string; date: string; muscle: string; total_sets: number; total_volume: number }
interface PR { exercise_name: string; max_weight: number }

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function calcLv(xp: number) { let c = LEVELS[0]; for (const l of LEVELS) if (xp >= l.needXP) c = l; return c }
function nextLv(xp: number) { for (const l of LEVELS) if (xp < l.needXP) return l; return null }

// ============ スタイル定数 ============
const S: Record<string, React.CSSProperties> = {
  phone: { width: '100%', maxWidth: 375, minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', position: 'relative' },
  topbar: { padding: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  appTitle: { fontFamily: "'Bebas Neue'", fontSize: 26, letterSpacing: 2, color: 'var(--accent)' },
  scrollArea: { flex: 1, overflowY: 'auto', paddingBottom: 80 },
  screen: { padding: '14px 20px' },
  navBar: { display: 'flex', borderTop: '0.5px solid var(--muted2)', padding: '10px 4px 20px', background: 'var(--bg)', position: 'sticky', bottom: 0 },
  card: { background: 'var(--bg2)', border: '0.5px solid var(--muted2)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 },
  btnMain: { width: '100%', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: 13, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans'", marginTop: 10 },
  secLbl: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 },
  inp: { width: 50, textAlign: 'center', fontSize: 12, padding: 5, border: '0.5px solid var(--muted2)', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text)', fontFamily: "'DM Sans'" },
}

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('today')

  // データ
  const [streak, setStreak] = useState(0)
  const [history, setHistory] = useState<WorkoutRecord[]>([])
  const [calPlan, setCalPlan] = useState<Record<string, string>>({})
  const [prs, setPrs] = useState<PR[]>([])
  const [earnedBadges, setEarnedBadges] = useState<string[]>([])
  const [todayDone, setTodayDone] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [selectedCell, setSelectedCell] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<{ txt: string; cls: string; col: string; ic: string }[]>([])
  const [newExName, setNewExName] = useState('')

  // タイマー
  const [timerSec, setTimerSec] = useState(0)
  const [timerMax, setTimerMax] = useState(90)
  const [timerOn, setTimerOn] = useState(false)

  const now = new Date()
  const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate()
  const todayStr = dateKey(todayY, todayM, todayD)
  const todayMuscle = calPlan[todayStr] || null

  // ============ 認証 ============
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      loadData(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [])

  // タイマー
  useEffect(() => {
    if (!timerOn) return
    const t = setInterval(() => {
      setTimerSec(s => { if (s <= 1) { setTimerOn(false); return 0 } return s - 1 })
    }, 1000)
    return () => clearInterval(t)
  }, [timerOn])

  // ============ データ読み込み ============
  async function loadData(uid: string) {
    setLoading(true)
    const [
      { data: profile },
      { data: plans },
      { data: workouts },
      { data: prData },
      { data: badges },
    ] = await Promise.all([
      supabase.from('profiles').select('streak').eq('id', uid).single(),
      supabase.from('calendar_plans').select('date,muscle').eq('user_id', uid),
      supabase.from('workouts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(30),
      supabase.from('personal_records').select('exercise_name,max_weight').eq('user_id', uid),
      supabase.from('earned_badges').select('badge_id').eq('user_id', uid),
    ])
    if (profile) setStreak(profile.streak || 0)
    if (plans) {
      const obj: Record<string, string> = {}
      plans.forEach((p: any) => { obj[p.date] = p.muscle })
      setCalPlan(obj)
    }
    if (workouts) {
      setHistory(workouts)
      setTodayDone(workouts.some((w: any) => w.date === todayStr))
    }
    if (prData) setPrs(prData)
    if (badges) setEarnedBadges(badges.map((b: any) => b.badge_id))
    setLoading(false)
  }

  // ============ カレンダープラン設定 ============
  async function setCalPlanDay(key: string, muscle: string) {
    if (!user) return
    const newPlan = { ...calPlan, [key]: muscle }
    setCalPlan(newPlan)
    await supabase.from('calendar_plans').upsert({ user_id: user.id, date: key, muscle }, { onConflict: 'user_id,date' })
  }

  async function clearCalPlanDay(key: string) {
    if (!user) return
    const newPlan = { ...calPlan }
    delete newPlan[key]
    setCalPlan(newPlan)
    setSelectedCell(null)
    await supabase.from('calendar_plans').delete().eq('user_id', user.id).eq('date', key)
  }

  // ============ ワークアウト完了 ============
  async function completeWorkout() {
    if (!user) return
    const vol = exercises.reduce((s, ex) => s + ex.sets.reduce((s2, st) => s2 + (parseFloat(st.w) || 0) * (parseInt(st.r) || 0), 0), 0)
    const totalSets = exercises.reduce((s, ex) => s + ex.sets.filter(st => st.done || st.r).length, 0)

    // ワークアウト保存
    const { data: wo } = await supabase.from('workouts').insert({
      user_id: user.id, date: todayStr, muscle: todayMuscle || '胸',
      total_sets: totalSets, total_volume: Math.round(vol),
    }).select().single()

    // セット保存
    if (wo) {
      const setRows: any[] = []
      exercises.forEach(ex => {
        ex.sets.forEach((s, i) => {
          if (s.w || s.r) setRows.push({ workout_id: wo.id, exercise_name: ex.name, set_number: i + 1, weight: parseFloat(s.w) || 0, reps: parseInt(s.r) || 0 })
        })
      })
      if (setRows.length) await supabase.from('workout_sets').insert(setRows)
    }

    // PR更新
    const newPRmsgs: { txt: string; cls: string; col: string; ic: string }[] = []
    for (const ex of exercises) {
      const maxW = Math.max(...ex.sets.map(s => parseFloat(s.w) || 0))
      if (maxW > 0) {
        const existing = prs.find(p => p.exercise_name === ex.name)
        if (!existing || maxW > existing.max_weight) {
          await supabase.from('personal_records').upsert({ user_id: user.id, exercise_name: ex.name, max_weight: maxW, updated_at: new Date().toISOString() }, { onConflict: 'user_id,exercise_name' })
          newPRmsgs.push({ txt: `PR — ${ex.name} ${existing ? existing.max_weight + '→' : ''}${maxW}kg`, cls: 'notif-pr', col: '#c8ff00', ic: 'ti-trophy' })
        }
      }
    }

    // ストリーク更新
    const newStreak = streak + 1
    await supabase.from('profiles').update({ streak: newStreak }).eq('id', user.id)
    setStreak(newStreak)
    setTodayDone(true)
    setExercises([])
    setTimerOn(false); setTimerSec(0)

    // 通知
    const msgs = [...newPRmsgs]
    if (msgs.length) { setNotifs(msgs); setTimeout(() => setNotifs([]), 5000) }

    await loadData(user.id)
    setTab('today')
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function startWorkout(muscle: string) {
    setExercises((PRESETS[muscle] || []).map(name => ({ id: Math.random().toString(), name, sets: [{ w: '', r: '', done: false }] })))
    setTab('log')
  }

  function startTimer(s: number) { setTimerMax(s); setTimerSec(s); setTimerOn(true) }
  const timerCol = timerSec <= 10 && timerSec > 0 ? '#ff4444' : timerSec === 0 ? '#00ff87' : '#c8ff00'
  const timerPct = timerMax > 0 ? timerSec / timerMax : 0
  const timerR = 54, timerCirc = 2 * Math.PI * timerR
  const timerDash = Math.round(timerPct * timerCirc)
  const timerM = Math.floor(timerSec / 60), timerS = timerSec % 60

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--accent)', fontFamily: "'Bebas Neue'", fontSize: 28, letterSpacing: 3 }}>
      FITSTREAK
    </div>
  )

  // ============ レンダリング ============
  const xp = history.length
  const lv = calcLv(xp)
  const nl = nextLv(xp)
  const lvPct = nl ? Math.round((xp - lv.needXP) / (nl.needXP - lv.needXP) * 100) : 100

  // 今週の表示
  const weekCells = DAYS_JP.map((d, i) => {
    const offset = i - now.getDay()
    const dd = new Date(todayY, todayM, todayD + offset)
    const key = dateKey(dd.getFullYear(), dd.getMonth(), dd.getDate())
    const m = calPlan[key]
    const isToday = i === now.getDay()
    const isDone = history.some((h: any) => h.date === key)
    const col = m ? MUSCLE_COLORS[m] : null
    return (
      <div key={i} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: i === 0 ? '#ff6b6b' : i === 6 ? '#60a5fa' : 'var(--muted)', marginBottom: 4 }}>{d}</div>
        <div style={{
          width: 34, height: 34, borderRadius: 9, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500,
          background: isDone ? 'var(--accent)' : col ? `${col}22` : 'var(--bg3)',
          border: isToday ? '1.5px solid var(--accent)' : col ? `0.5px solid ${col}55` : '0.5px solid transparent',
          color: isDone ? '#000' : isToday ? 'var(--accent)' : 'var(--muted)',
        }}>
          {isDone ? <i className="ti ti-check" style={{ fontSize: 11 }} /> : m && m !== '休み' ? <span style={{ fontSize: 7, lineHeight: 1.1 }}>{m.slice(0, 2)}</span> : m === '休み' ? <i className="ti ti-minus" style={{ fontSize: 9 }} /> : d}
        </div>
      </div>
    )
  })

  // カレンダー
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const daysInPrev = new Date(calYear, calMonth, 0).getDate()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7
  const calCells = Array.from({ length: totalCells }, (_, i) => {
    let d, m, y, isOther = false
    if (i < firstDay) { d = daysInPrev - firstDay + i + 1; m = calMonth - 1; y = calYear; if (m < 0) { m = 11; y-- }; isOther = true }
    else if (i >= firstDay + daysInMonth) { d = i - firstDay - daysInMonth + 1; m = calMonth + 1; y = calYear; if (m > 11) { m = 0; y++ }; isOther = true }
    else { d = i - firstDay + 1; m = calMonth; y = calYear }
    const key = dateKey(y, m, d)
    const muscle = calPlan[key]
    const isToday = y === todayY && m === todayM && d === todayD
    const isDone = history.some((h: any) => h.date === key)
    const isSel = selectedCell === key
    const col = muscle ? MUSCLE_COLORS[muscle] : null
    const dow = i % 7
    return (
      <div key={i} onClick={() => setSelectedCell(isSel ? null : key)}
        style={{
          aspectRatio: '1', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', opacity: isOther ? 0.2 : 1,
          background: isDone ? '#0d1f0d' : isSel ? 'var(--bg4)' : col ? `${col}15` : 'transparent',
          border: isToday ? '1.5px solid var(--accent)' : isSel ? '1px solid var(--accent)' : col ? `0.5px solid ${col}40` : isDone ? '0.5px solid #1a4a1a' : '0.5px solid transparent',
        }}>
        <div style={{ fontSize: 11, color: dow === 0 && !isOther ? '#ff6b6b' : dow === 6 && !isOther ? '#60a5fa' : isToday ? 'var(--accent)' : 'var(--muted)', fontWeight: isToday ? 500 : 400 }}>{d}</div>
        {isDone ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', marginTop: 2 }} /> :
          col ? <div style={{ fontSize: 7, color: col, marginTop: 1, lineHeight: 1 }}>{muscle === '休み' ? '休' : muscle!.slice(0, 2)}</div> : null}
      </div>
    )
  })

  const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

  return (
    <div style={S.phone}>
      {/* トップバー */}
      <div style={S.topbar}>
        <div style={S.appTitle}>FITSTREAK</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg3)', border: '0.5px solid var(--muted2)', borderRadius: 20, padding: '5px 11px', fontSize: 11, cursor: 'pointer' }} onClick={() => setTab('profile')}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: lv.color }} />
            <span style={{ color: lv.color, fontWeight: 500 }}>LV.{lv.lv} {lv.name}</span>
          </div>
          <button onClick={logout} style={{ background: 'none', border: '0.5px solid var(--muted2)', borderRadius: 20, padding: '5px 10px', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', fontFamily: "'DM Sans'" }}>OUT</button>
        </div>
      </div>

      {/* 通知 */}
      {notifs.length > 0 && (
        <div style={{ padding: '8px 20px 0' }}>
          {notifs.map((n, i) => (
            <div key={i} style={{ borderRadius: 8, padding: '9px 13px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, background: n.cls === 'notif-pr' ? '#071a07' : n.cls === 'notif-badge' ? '#1a1200' : '#0a071a', border: `0.5px solid ${n.col}44` }}>
              <i className={`ti ${n.ic}`} style={{ fontSize: 15, color: n.col, flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#ccc' }}>{n.txt}</span>
              <button onClick={() => setNotifs([])} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* スクロールエリア */}
      <div style={S.scrollArea}>

        {/* ===== 今日タブ ===== */}
        {tab === 'today' && (
          <div style={S.screen}>
            <div style={{ textAlign: 'center', padding: '16px 0 12px' }}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 80, lineHeight: 1, color: 'var(--accent)', letterSpacing: -2 }}>{streak}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: -4 }}>DAY STREAK</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 200, margin: '10px auto 0' }}>
                <div style={{ fontSize: 10, color: lv.color, whiteSpace: 'nowrap' }}>LV.{lv.lv}</div>
                <div style={{ flex: 1, height: 3, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: 3, background: lv.color, width: `${lvPct}%`, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>{nl ? nl.needXP : 'MAX'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>{weekCells}</div>

            {todayDone ? (
              <div style={{ ...S.card, textAlign: 'center', border: '0.5px solid #1a3a1a' }}>
                <i className="ti ti-circle-check" style={{ fontSize: 26, color: '#00ff87', display: 'block', marginBottom: 5 }} />
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, color: '#00ff87', letterSpacing: 1 }}>TODAY COMPLETE</div>
              </div>
            ) : !todayMuscle ? (
              <div style={{ ...S.card, textAlign: 'center' }}>
                <i className="ti ti-calendar-plus" style={{ fontSize: 24, color: 'var(--muted)', display: 'block', marginBottom: 6 }} />
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>今日の予定が未設定です</div>
                <button onClick={() => setTab('calendar')} style={{ ...S.btnMain, marginTop: 12, width: 'auto', padding: '9px 18px' }}>カレンダーで設定する</button>
              </div>
            ) : todayMuscle === '休み' ? (
              <div style={{ ...S.card, textAlign: 'center' }}>
                <i className="ti ti-zzz" style={{ fontSize: 22, color: '#334', display: 'block', marginBottom: 5 }} />
                <div style={{ fontSize: 13, fontWeight: 500, color: '#445' }}>REST DAY</div>
              </div>
            ) : (
              <div style={{ ...S.card, border: `0.5px solid ${MUSCLE_COLORS[todayMuscle]}44` }}>
                <div style={{ display: 'inline-block', background: MUSCLE_COLORS[todayMuscle], color: '#000', fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 20, marginBottom: 8 }}>TODAY</div>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, letterSpacing: 1, marginBottom: 10 }}>{todayMuscle}</div>
                {(PRESETS[todayMuscle] || []).map(e => (
                  <div key={e} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--muted2)' }}>
                    <span style={{ flex: 1, fontSize: 12 }}>{e}</span>
                    <span style={{ fontSize: 10, color: 'var(--accent)' }}>{prs.find(p => p.exercise_name === e) ? prs.find(p => p.exercise_name === e)!.max_weight + 'kg PR' : ''}</span>
                  </div>
                ))}
                <button style={S.btnMain} onClick={() => startWorkout(todayMuscle)}>
                  <i className="ti ti-player-play" style={{ fontSize: 13, verticalAlign: -1, marginRight: 5 }} /> START WORKOUT
                </button>
              </div>
            )}
            <button onClick={() => setTab('calendar')} style={{ width: '100%', background: 'none', border: '0.5px solid var(--muted2)', borderRadius: 8, padding: 9, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans'", marginTop: 4 }}>
              <i className="ti ti-calendar" style={{ fontSize: 12, verticalAlign: -1, marginRight: 5 }} />カレンダーで予定を管理
            </button>
          </div>
        )}

        {/* ===== カレンダータブ ===== */}
        {tab === 'calendar' && (
          <div style={S.screen}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button onClick={() => { setCalMonth(m => { const nm = m - 1; if (nm < 0) { setCalYear(y => y - 1); return 11 } return nm }); setSelectedCell(null) }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '0.5px solid var(--muted2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
              </button>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, letterSpacing: 1 }}>{calYear}年 {MONTHS[calMonth]}</div>
              <button onClick={() => { setCalMonth(m => { const nm = m + 1; if (nm > 11) { setCalYear(y => y + 1); return 0 } return nm }); setSelectedCell(null) }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '0.5px solid var(--muted2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 6 }}>
              {DAYS_JP.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, color: i === 0 ? '#ff6b6b' : i === 6 ? '#60a5fa' : 'var(--muted)', padding: '4px 0' }}>{d}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>{calCells}</div>

            {/* 凡例 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 }}>
              {Object.entries(MUSCLE_COLORS).filter(([m]) => m !== '休み').map(([m, c]) => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{m}
                </div>
              ))}
            </div>

            {/* 日付選択パネル */}
            {selectedCell && (
              <div style={S.card}>
                <div style={{ fontFamily: "'Bebas Neue'", fontSize: 16, letterSpacing: 1, marginBottom: 12 }}>
                  {selectedCell.split('-').slice(1).join('/')} ({DAYS_JP[new Date(selectedCell).getDay()]})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {MUSCLES.map(m => (
                    <button key={m} onClick={() => setCalPlanDay(selectedCell, m)}
                      style={{ padding: '6px 12px', borderRadius: 20, border: '0.5px solid', borderColor: calPlan[selectedCell] === m ? (m === '休み' ? '#334' : MUSCLE_COLORS[m]) : 'var(--muted2)', background: calPlan[selectedCell] === m ? (m === '休み' ? '#0a0d1a' : `${MUSCLE_COLORS[m]}22`) : 'var(--bg3)', color: calPlan[selectedCell] === m ? (m === '休み' ? '#445' : MUSCLE_COLORS[m]) : 'var(--muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans'", fontWeight: calPlan[selectedCell] === m ? 500 : 400 }}>
                      {m}
                    </button>
                  ))}
                  {calPlan[selectedCell] && (
                    <button onClick={() => clearCalPlanDay(selectedCell)}
                      style={{ padding: '6px 12px', borderRadius: 20, border: '0.5px solid #ff444440', background: 'none', color: '#ff4444', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans'" }}>
                      <i className="ti ti-trash" style={{ fontSize: 11, verticalAlign: -1, marginRight: 3 }} />削除
                    </button>
                  )}
                </div>
              </div>
            )}
            {!selectedCell && <div style={{ textAlign: 'center', padding: '1rem 0', fontSize: 12, color: 'var(--muted)' }}>日付をタップして予定を設定</div>}
          </div>
        )}

        {/* ===== 記録タブ ===== */}
        {tab === 'log' && (
          <div style={S.screen}>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, letterSpacing: 1, color: '#666', marginBottom: 12 }}>{todayMuscle || '胸'}</div>
            {exercises.map(ex => (
              <div key={ex.id} style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{ex.name}</div>
                  {prs.find(p => p.exercise_name === ex.name) && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(200,255,0,0.08)', color: 'var(--accent)' }}>PR {prs.find(p => p.exercise_name === ex.name)!.max_weight}kg</span>}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>
                    <th style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 10, padding: '2px 4px', textAlign: 'center' }}>SET</th>
                    <th style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 10, textAlign: 'center' }}>KG</th>
                    <th style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 10, textAlign: 'center' }}>REPS</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {ex.sets.map((s, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: 'center', color: '#444', padding: 3 }}>{i + 1}</td>
                        <td style={{ padding: 3, textAlign: 'center' }}><input style={S.inp} type="number" placeholder="60" value={s.w} onChange={e => setExercises(exs => exs.map(ex2 => ex2.id === ex.id ? { ...ex2, sets: ex2.sets.map((s2, j) => j === i ? { ...s2, w: e.target.value } : s2) } : ex2))} /></td>
                        <td style={{ padding: 3, textAlign: 'center' }}><input style={S.inp} type="number" placeholder="10" value={s.r} onChange={e => setExercises(exs => exs.map(ex2 => ex2.id === ex.id ? { ...ex2, sets: ex2.sets.map((s2, j) => j === i ? { ...s2, r: e.target.value } : s2) } : ex2))} /></td>
                        <td style={{ textAlign: 'center', padding: 3 }}>
                          <button onClick={() => {
                            setExercises(exs => exs.map(ex2 => ex2.id === ex.id ? { ...ex2, sets: ex2.sets.map((s2, j) => j === i ? { ...s2, done: !s2.done } : s2) } : ex2))
                            if (!s.done && !timerOn) startTimer(timerMax)
                          }} style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--muted2)', background: s.done ? 'var(--accent)' : 'none', color: s.done ? '#000' : 'var(--muted)', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                            {s.done && <i className="ti ti-check" style={{ fontSize: 10 }} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button onClick={() => setExercises(exs => exs.map(ex2 => ex2.id === ex.id ? { ...ex2, sets: [...ex2.sets, { w: '', r: '', done: false }] } : ex2))}
                  style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 0', marginTop: 3, fontFamily: "'DM Sans'" }}>
                  <i className="ti ti-plus" style={{ fontSize: 11, verticalAlign: -1 }} /> ADD SET
                </button>
              </div>
            ))}

            {/* タイマー */}
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ position: 'relative', width: 130, height: 130, margin: '0 auto' }}>
                <svg style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }} width="130" height="130" viewBox="0 0 130 130">
                  <circle cx="65" cy="65" r={timerR} fill="none" stroke="#1a1a1a" strokeWidth="6" />
                  <circle cx="65" cy="65" r={timerR} fill="none" stroke={timerCol} strokeWidth="6" strokeDasharray={`${timerDash} ${timerCirc}`} strokeLinecap="round" />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: 34, letterSpacing: 2, lineHeight: 1, color: timerCol }}>{timerM}:{String(timerS).padStart(2, '0')}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>{timerSec === 0 ? 'DONE' : timerOn ? 'REST' : 'PAUSED'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
                {[60, 90, 120].map(s => <button key={s} onClick={() => startTimer(s)} style={{ padding: '5px 12px', borderRadius: 20, border: '0.5px solid', borderColor: timerMax === s && timerOn ? 'var(--accent)' : 'var(--muted2)', background: timerMax === s && timerOn ? 'var(--accent)' : 'var(--bg3)', color: timerMax === s && timerOn ? '#000' : 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans'" }}>{s}s</button>)}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                <button onClick={() => setTimerOn(o => !o)} style={{ padding: '5px 16px', borderRadius: 20, border: '0.5px solid var(--muted2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans'" }}>{timerOn ? 'PAUSE' : 'RESUME'}</button>
                <button onClick={() => { setTimerSec(timerMax); setTimerOn(false) }} style={{ padding: '5px 16px', borderRadius: 20, border: '0.5px solid var(--muted2)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans'" }}>RESET</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={newExName} onChange={e => setNewExName(e.target.value)} placeholder="種目を追加..." style={{ flex: 1, fontSize: 13, background: 'var(--bg3)', border: '0.5px solid var(--muted2)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontFamily: "'DM Sans'", outline: 'none' }} />
              <button onClick={() => { if (!newExName.trim()) return; setExercises(exs => [...exs, { id: Math.random().toString(), name: newExName.trim(), sets: [{ w: '', r: '', done: false }] }]); setNewExName('') }} style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, padding: '9px 13px', cursor: 'pointer', fontSize: 15 }}>+</button>
            </div>
            <button style={{ ...S.btnMain, padding: 12, fontSize: 14 }} onClick={completeWorkout}>
              <i className="ti ti-trophy" style={{ fontSize: 13, verticalAlign: -2, marginRight: 5 }} />COMPLETE WORKOUT
            </button>
          </div>
        )}

        {/* ===== グラフタブ ===== */}
        {tab === 'graph' && (
          <div style={S.screen}>
            <div style={S.secLbl}>ボリューム推移</div>
            <div style={S.card}>
              {history.length === 0 ? <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--muted)', fontSize: 12 }}>記録するとグラフが表示されます</div> : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 90, marginBottom: 6 }}>
                  {[...history].slice(0, 8).reverse().map((h, i) => {
                    const maxVol = Math.max(...history.slice(0, 8).map(x => x.total_volume || 0), 1)
                    const pct = Math.round((h.total_volume || 0) / maxVol * 90)
                    const col = MUSCLE_COLORS[h.muscle] || '#c8ff00'
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div style={{ fontSize: 8, color: col }}>{h.total_volume || 0}</div>
                        <div style={{ width: '100%', background: col, borderRadius: '3px 3px 0 0', minHeight: 3, height: pct }} />
                        <div style={{ fontSize: 8, color: 'var(--muted)' }}>{h.date.slice(5).replace('-', '/')}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={S.secLbl}>部位バランス</div>
            <div style={S.card}>
              {['胸', '背中', '脚', '肩', '腕', '腹筋'].map(m => {
                const cnt = history.filter(h => h.muscle === m).length
                const maxF = Math.max(...['胸', '背中', '脚', '肩', '腕', '腹筋'].map(x => history.filter(h => h.muscle === x).length), 1)
                return (
                  <div key={m} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#ccc', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: MUSCLE_COLORS[m] }} />{m}
                      </span>
                      <span style={{ color: '#444' }}>{cnt}回</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 2 }}>
                      <div style={{ height: 4, background: MUSCLE_COLORS[m], borderRadius: 2, width: `${Math.round(cnt / maxF * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={S.secLbl}>最近の記録</div>
            <div style={S.card}>
              {history.length === 0 ? <div style={{ textAlign: 'center', padding: '0.8rem 0', color: 'var(--muted)', fontSize: 12 }}>まだ記録がありません</div> :
                history.slice(0, 6).map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '0.5px solid #111' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: MUSCLE_COLORS[h.muscle] || '#c8ff00', flexShrink: 0 }} />
                    <div style={{ fontSize: 10, color: '#444', minWidth: 55 }}>{h.date.slice(5).replace('-', '/')}</div>
                    <div style={{ flex: 1, fontSize: 12, color: '#aaa' }}>{h.muscle}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}>{(h.total_volume || 0).toLocaleString()}kg</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ===== プロフィールタブ ===== */}
        {tab === 'profile' && (
          <div style={S.screen}>
            <div style={{ textAlign: 'center', padding: '16px 0 12px' }}>
              <div style={{ width: 58, height: 58, borderRadius: 16, background: lv.bg, border: `1.5px solid ${lv.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <i className={`ti ${lv.icon}`} style={{ fontSize: 25, color: lv.color }} />
              </div>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 24, color: lv.color, letterSpacing: 2 }}>LV.{lv.lv} {lv.name}</div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>{xp} WORKOUTS</div>
              <div style={{ maxWidth: 180, margin: '10px auto 0' }}>
                <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: 3, background: lv.color, width: `${lvPct}%`, borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#333', marginTop: 4 }}>
                  <span>{xp}</span><span>{nl ? nl.needXP + ' next' : 'MAX'}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[{ v: streak, l: 'STREAK', c: 'var(--accent)' }, { v: history.length, l: 'SESSIONS', c: 'var(--text)' }, { v: history.reduce((s, h) => s + (h.total_volume || 0), 0).toLocaleString(), l: 'TOT KG', c: 'var(--text)' }].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg2)', border: '0.5px solid var(--muted2)', borderRadius: 8, padding: '10px 6px', textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: 24, lineHeight: 1, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={S.secLbl}>RANKS</div>
            <div style={S.card}>
              {LEVELS.map(l => (
                <div key={l.lv} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '0.5px solid var(--muted2)', opacity: lv.lv >= l.lv ? 1 : 0.28 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: l.bg, border: `0.5px solid ${l.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`ti ${l.icon}`} style={{ fontSize: 15, color: l.color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Bebas Neue'", fontSize: 15, letterSpacing: 1, color: l.color }}>LV.{l.lv} {l.name}</div>
                    <div style={{ fontSize: 10, color: '#333' }}>{l.needXP} SESSIONS</div>
                  </div>
                  {lv.lv >= l.lv ? <i className="ti ti-check" style={{ fontSize: 14, color: 'var(--accent)' }} /> : <i className="ti ti-lock" style={{ fontSize: 14, color: '#222' }} />}
                </div>
              ))}
            </div>
            <div style={S.secLbl}>PERSONAL RECORDS</div>
            <div style={S.card}>
              {prs.length === 0 ? <div style={{ textAlign: 'center', padding: '0.5rem 0', color: 'var(--muted)', fontSize: 12 }}>まだ記録がありません</div> :
                [...prs].sort((a, b) => b.max_weight - a.max_weight).slice(0, 5).map((p, i) => (
                  <div key={p.exercise_name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--muted2)' }}>
                    <div style={{ fontFamily: "'Bebas Neue'", fontSize: 18, width: 22, color: i === 0 ? 'var(--accent)' : i === 1 ? '#888' : i === 2 ? '#7a5c2e' : '#333' }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 12, color: '#ccc' }}>{p.exercise_name}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>{p.max_weight}kg</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ===== バッジタブ ===== */}
        {tab === 'badges' && (
          <div style={S.screen}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue'", fontSize: 30, color: 'var(--accent)' }}>{earnedBadges.length}</span>
              <span style={{ fontSize: 12, color: '#444' }}>/ {BADGES.length} BADGES</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {BADGES.map(b => {
                const isE = earnedBadges.includes(b.id)
                return (
                  <div key={b.id} style={{ textAlign: 'center', padding: '9px 3px', borderRadius: 8, border: `0.5px solid ${isE ? b.ac + '22' : 'var(--muted2)'}`, background: 'var(--bg2)', opacity: isE ? 1 : 0.22 }}>
                    <i className={`ti ${b.icon}`} style={{ fontSize: 20, color: isE ? b.ac : '#222', display: 'block', marginBottom: 4 }} />
                    <div style={{ fontSize: 9, fontWeight: 500, color: isE ? b.ac : '#222' }}>{b.name}</div>
                    <div style={{ fontSize: 8, color: '#333', marginTop: 2 }}>{b.cond}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ナビゲーションバー */}
      <div style={S.navBar}>
        {[
          { id: 'today', icon: 'ti-home', label: '今日' },
          { id: 'calendar', icon: 'ti-calendar', label: 'カレンダー' },
          { id: 'log', icon: 'ti-barbell', label: '記録' },
          { id: 'graph', icon: 'ti-chart-bar', label: 'グラフ' },
          { id: 'profile', icon: 'ti-user', label: 'プロフィール' },
          { id: 'badges', icon: 'ti-shield-star', label: 'バッジ' },
        ].map(n => (
          <button key={n.id} onClick={() => setTab(n.id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: 4, border: 'none', background: 'none', color: tab === n.id ? 'var(--accent)' : 'var(--muted)', fontFamily: "'DM Sans'" }}>
            <i className={`ti ${n.icon}`} style={{ fontSize: 19 }} />
            <span style={{ fontSize: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

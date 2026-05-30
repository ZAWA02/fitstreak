import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

const DAYS_JP = ['日', '月', '火', '水', '木', '金', '土']
const LEVELS = [
  { lv: 1, name: 'BEGINNER', icon: '🌱', color: '#888', needXP: 0 },
  { lv: 2, name: 'TRAINEE', icon: '💪', color: '#c8ff00', needXP: 5 },
  { lv: 3, name: 'ATHLETE', icon: '🏃', color: '#00bfff', needXP: 15 },
  { lv: 4, name: 'CHAMPION', icon: '🏅', color: '#bf5fff', needXP: 30 },
  { lv: 5, name: 'LEGEND', icon: '👑', color: '#ff4444', needXP: 60 },
]
const BADGES = [
  { id: 'first', name: '初陣', icon: '⚔️', cond: '初記録' },
  { id: 's3', name: '3日', icon: '🔥', cond: '3日連続' },
  { id: 's7', name: '1週間', icon: '📅', cond: '7日連続' },
  { id: 's30', name: '1ヶ月', icon: '🗓️', cond: '30日連続' },
  { id: 'w10', name: '10回', icon: '✅', cond: '総10回' },
  { id: 'w50', name: '50回', icon: '⭐', cond: '総50回' },
  { id: 'pr1', name: '初PR', icon: '🚀', cond: 'PR更新' },
  { id: 'lv3', name: 'ATHLETE', icon: '🏃', cond: 'Lv.3到達' },
]
const EVENT_COLORS = ['#c8ff00','#f472b6','#60a5fa','#fbbf24','#a78bfa','#f97316','#34d399','#22d3ee','#ff6b6b']

interface SetRow { w: string; r: string; done: boolean; time?: string; dist?: string }
interface Exercise { id: string; name: string; sets: SetRow[]; mode: 'strength' | 'cardio' }
interface WorkoutRecord { id: string; date: string; muscle: string; total_sets: number; total_volume: number }
interface PR { exercise_name: string; max_weight: number }
interface CalEvent { id: string; date: string; title: string; memo?: string; color: string; repeat_type?: string; repeat_id?: string; is_base?: boolean }

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function calcLv(xp: number) { let c = LEVELS[0]; for (const l of LEVELS) if (xp >= l.needXP) c = l; return c }
function nextLv(xp: number) { for (const l of LEVELS) if (xp < l.needXP) return l; return null }

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<User|null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('today')
  const [streak, setStreak] = useState(0)
  const [history, setHistory] = useState<WorkoutRecord[]>([])
  const [calEvents, setCalEvents] = useState<CalEvent[]>([])
  const [prs, setPrs] = useState<PR[]>([])
  const [earnedBadges, setEarnedBadges] = useState<string[]>([])
  const [todayDone, setTodayDone] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string|null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editEvent, setEditEvent] = useState<CalEvent|null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [editColor, setEditColor] = useState(EVENT_COLORS[0])
  const [editRepeat, setEditRepeat] = useState<string>('none')
  const [showEditChoiceModal, setShowEditChoiceModal] = useState<CalEvent|null>(null)
  const [newExName, setNewExName] = useState('')
  const [notifs, setNotifs] = useState<string[]>([])
  const [swTotal, setSwTotal] = useState(90000)  // ms remaining
  const [swMs, setSwMs] = useState(90000)       // preset ms
  const [swRunning, setSwRunning] = useState(false)
  const [isAlarm, setIsAlarm] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editUsername, setEditUsername] = useState('')
  const [editProfileMsg, setEditProfileMsg] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [friends, setFriends] = useState<any[]>([])
  const [friendRequests, setFriendRequests] = useState<any[]>([])
  const [searchUsername, setSearchUsername] = useState('')
  const [searchResult, setSearchResult] = useState<any>(null)
  const [searchMsg, setSearchMsg] = useState('')
  const [gpsTracking, setGpsTracking] = useState<string|null>(null) // exercise id being tracked
  const [gpsDistance, setGpsDistance] = useState<Record<string,number>>({}) // exId -> meters
  const [gpsWatchId, setGpsWatchId] = useState<number|null>(null)
  const gpsLastPos = { current: null as GeolocationPosition|null }

  const audioCtxRef = typeof window !== 'undefined' ? { current: null as any } : { current: null }

  const now = new Date()
  const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate()
  const todayKey = dateKey(todayY, todayM, todayD)
  const todayEvents = calEvents.filter(e => e.date === todayKey)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user); loadData(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.push('/login')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!swRunning) return
    const interval = 50
    const t = setInterval(() => {
      setSwTotal(prev => {
        if (prev <= interval) {
          setSwRunning(false)
          // Beep sound using Web Audio API
          setIsAlarm(true)
          // Start repeating alarm
          const playAlarm = () => {
            try {
              const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
              const ctx = new AudioCtx()
              const beep = (freq: number, start: number, dur: number) => {
                const o = ctx.createOscillator()
                const g = ctx.createGain()
                o.connect(g); g.connect(ctx.destination)
                o.frequency.value = freq
                o.type = 'sine'
                g.gain.setValueAtTime(0, ctx.currentTime + start)
                g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + start + 0.01)
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
                o.start(ctx.currentTime + start)
                o.stop(ctx.currentTime + start + dur + 0.05)
              }
              beep(880, 0, 0.15)
              beep(880, 0.2, 0.15)
              beep(1320, 0.4, 0.3)
              setTimeout(() => ctx.close(), 1500)
            } catch(e) {}
          }
          playAlarm()
          ;(window as any).__alarmInterval = setInterval(playAlarm, 2000)
          return 0
        }
        return prev - interval
      })
    }, interval)
    return () => clearInterval(t)
  }, [swRunning])

  async function loadData(uid: string) {
    setLoading(true)
    const [
      { data: profile },
      { data: events },
      { data: workouts },
      { data: prData },
      { data: badges },
    ] = await Promise.all([
      supabase.from('profiles').select('streak,username,avatar_url').eq('id', uid).single(),
      supabase.from('calendar_events').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('workouts').select('*').eq('user_id', uid).order('created_at',{ascending:false}).limit(30),
      supabase.from('personal_records').select('exercise_name,max_weight').eq('user_id', uid),
      supabase.from('earned_badges').select('badge_id').eq('user_id', uid),
    ])
    if (profile) { setStreak(profile.streak||0); setProfile(profile) }
    if (events) setCalEvents(events as CalEvent[])
    if (workouts) { setHistory(workouts); setTodayDone(workouts.some((w:any)=>w.date===todayKey)) }
    if (prData) setPrs(prData)
    if (badges) setEarnedBadges(badges.map((b:any)=>b.badge_id))
    // load friends
    await loadFriends(uid)
    setLoading(false)
  }

  async function addEvent() {
    if (!user || !editTitle.trim() || !selectedDate) return
    const repeatId = editRepeat !== 'none' ? crypto.randomUUID() : null
    const eventsToInsert: any[] = []

    if (editRepeat === 'none') {
      eventsToInsert.push({ user_id: user.id, date: selectedDate, title: editTitle.trim(), memo: editMemo||null, color: editColor, repeat_type: 'none', repeat_id: null, is_base: true })
    } else {
      // 基準日から12週 or 12ヶ月分生成
      const base = new Date(selectedDate + 'T00:00:00')
      const count = editRepeat === 'weekly' ? 12 : 12
      for (let i = 0; i < count; i++) {
        const d = new Date(base)
        if (editRepeat === 'weekly') d.setDate(base.getDate() + i * 7)
        else d.setMonth(base.getMonth() + i)
        eventsToInsert.push({
          user_id: user.id,
          date: dateKey(d.getFullYear(), d.getMonth(), d.getDate()),
          title: editTitle.trim(), memo: editMemo||null, color: editColor,
          repeat_type: editRepeat, repeat_id: repeatId, is_base: i === 0
        })
      }
    }

    const { data } = await supabase.from('calendar_events').insert(eventsToInsert).select()
    if (data) setCalEvents(prev => [...prev, ...(data as CalEvent[])])
    setEditTitle(''); setEditMemo(''); setEditColor(EVENT_COLORS[0]); setEditRepeat('none')
    setShowAddModal(false)
  }

  async function deleteEvent(id: string, mode: 'single'|'following'|'all') {
    const ev = calEvents.find(e => e.id === id)
    if (!ev) return
    if (mode === 'single' || !ev.repeat_id) {
      await supabase.from('calendar_events').delete().eq('id', id)
      setCalEvents(prev => prev.filter(e => e.id !== id))
    } else if (mode === 'following') {
      // この日以降の同じrepeat_idを削除
      const targets = calEvents.filter(e => e.repeat_id === ev.repeat_id && e.date >= ev.date)
      await supabase.from('calendar_events').delete().in('id', targets.map(e=>e.id))
      setCalEvents(prev => prev.filter(e => !(e.repeat_id === ev.repeat_id && e.date >= ev.date)))
    } else {
      // 全部削除
      await supabase.from('calendar_events').delete().eq('repeat_id', ev.repeat_id)
      setCalEvents(prev => prev.filter(e => e.repeat_id !== ev.repeat_id))
    }
    setEditEvent(null)
    setShowEditChoiceModal(null)
  }

  async function completeWorkout() {
    if (!user) return
    const vol = exercises.reduce((s,ex)=>s+ex.sets.reduce((s2,st)=>s2+(parseFloat(st.w)||0)*(parseInt(st.r)||0),0),0)
    const totalSets = exercises.reduce((s,ex)=>s+ex.sets.filter(st=>st.done||st.r).length,0)
    const label = todayEvents.length > 0 ? todayEvents[0].title : '記録'
    const { data: wo } = await supabase.from('workouts').insert({
      user_id:user.id, date:todayKey, muscle:label, total_sets:totalSets, total_volume:Math.round(vol)
    }).select().single()
    if (wo) {
      const setRows:any[] = []
      exercises.forEach(ex=>ex.sets.forEach((s,i)=>{if(s.w||s.r) setRows.push({workout_id:wo.id,exercise_name:ex.name,set_number:i+1,weight:parseFloat(s.w)||0,reps:parseInt(s.r)||0})}))
      if (setRows.length) await supabase.from('workout_sets').insert(setRows)
    }
    const msgs:string[] = []
    for (const ex of exercises) {
      const maxW = Math.max(...ex.sets.map(s=>parseFloat(s.w)||0))
      if (maxW>0) {
        const existing = prs.find(p=>p.exercise_name===ex.name)
        if (!existing||maxW>existing.max_weight) {
          await supabase.from('personal_records').upsert({user_id:user.id,exercise_name:ex.name,max_weight:maxW,updated_at:new Date().toISOString()},{onConflict:'user_id,exercise_name'})
          msgs.push(`🏆 PR更新！${ex.name} ${maxW}kg`)
        }
      }
    }
    const newStreak = streak+1
    await supabase.from('profiles').update({streak:newStreak}).eq('id',user.id)
    setStreak(newStreak); setTodayDone(true); setExercises([]); setSwRunning(false); setSwTotal(swMs)
    if (msgs.length) { setNotifs(msgs); setTimeout(()=>setNotifs([]),5000) }
    await loadData(user.id); setTab('today')
  }

  const xp = history.length, lv = calcLv(xp), nl = nextLv(xp)
  const lvPct = nl ? Math.round((xp-lv.needXP)/(nl.needXP-lv.needXP)*100) : 100
  // stopwatch colors
  const swColor = swRunning ? '#c8ff00' : swTotal === 0 ? '#00ff87' : '#f0f0f0'
  async function uploadAvatar(file: File) {
    if (!user) return
    setUploadingAvatar(true)
    setEditProfileMsg('')
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)
      setProfile((prev:any) => ({...prev, avatar_url: avatarUrl}))
      setEditProfileMsg('アイコンを更新しました！')
    } catch(e:any) {
      setEditProfileMsg('エラー: ' + e.message)
    }
    setUploadingAvatar(false)
  }

  async function updateUsername() {
    if (!user || !editUsername.trim()) return
    setEditProfileMsg('')
    // 重複チェック
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', editUsername.trim()).single()
    if (existing && existing.id !== user.id) { setEditProfileMsg('このユーザー名はすでに使われています'); return }
    const { error } = await supabase.from('profiles').update({ username: editUsername.trim() }).eq('id', user.id)
    if (error) { setEditProfileMsg('エラー: ' + error.message); return }
    setProfile((prev:any) => ({...prev, username: editUsername.trim()}))
    setEditProfileMsg('ユーザー名を更新しました！')
    setShowEditProfile(false)
  }

  async function loadFriends(uid: string) {
    // 承認済みフレンド
    const { data: fs } = await supabase
      .from('friendships')
      .select('*, requester:requester_id(id,username,streak), receiver:receiver_id(id,username,streak)')
      .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`)
      .eq('status','accepted')
    if (fs) {
      const list = fs.map((f:any) => {
        const friend = f.requester_id === uid ? f.receiver : f.requester
        return { ...friend, friendshipId: f.id }
      })
      setFriends(list)
    }
    // 受信したリクエスト
    const { data: reqs } = await supabase
      .from('friendships')
      .select('*, requester:requester_id(id,username,streak)')
      .eq('receiver_id', uid)
      .eq('status','pending')
    if (reqs) setFriendRequests(reqs)
  }

  async function searchFriend() {
    if (!searchUsername.trim()) return
    setSearchMsg('')
    setSearchResult(null)
    const { data } = await supabase
      .from('profiles')
      .select('id,username,streak')
      .eq('username', searchUsername.trim())
      .single()
    if (!data) { setSearchMsg('ユーザーが見つかりません'); return }
    if (data.id === user?.id) { setSearchMsg('自分自身は追加できません'); return }
    setSearchResult(data)
  }

  async function sendFriendRequest(toId: string) {
    if (!user) return
    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id, receiver_id: toId, status: 'pending'
    })
    if (error) { setSearchMsg('すでにリクエスト済みです'); return }
    setSearchMsg('フレンドリクエストを送りました！')
    setSearchResult(null)
    setSearchUsername('')
  }

  async function acceptFriend(friendshipId: string, uid: string) {
    await supabase.from('friendships').update({status:'accepted'}).eq('id', friendshipId)
    setFriendRequests(prev => prev.filter(r => r.id !== friendshipId))
    await loadFriends(uid)
  }

  async function rejectFriend(friendshipId: string) {
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setFriendRequests(prev => prev.filter(r => r.id !== friendshipId))
  }

  function calcGpsDist(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000
    const dLat = (lat2-lat1)*Math.PI/180
    const dLon = (lon2-lon1)*Math.PI/180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
  }

  function startGps(exId: string) {
    if (!navigator.geolocation) { alert('このブラウザはGPSに対応していません'); return }
    gpsLastPos.current = null
    setGpsDistance(prev=>({...prev,[exId]:0}))
    setGpsTracking(exId)
    const id = navigator.geolocation.watchPosition(
      pos => {
        if (gpsLastPos.current) {
          const d = calcGpsDist(
            gpsLastPos.current.coords.latitude, gpsLastPos.current.coords.longitude,
            pos.coords.latitude, pos.coords.longitude
          )
          if (d > 2) { // 2m以上動いた時のみ加算（ノイズ除去）
            setGpsDistance(prev => {
              const newDist = (prev[exId]||0) + d
              // 距離をkm単位でexerciseのdistに反映
              setExercises(exs => exs.map(ex => ex.id===exId ? {
                ...ex, sets: ex.sets.map((s,i) => i===0 ? {...s, dist: (newDist/1000).toFixed(2)} : s)
              } : ex))
              return {...prev, [exId]: newDist}
            })
          }
        }
        gpsLastPos.current = pos
      },
      err => { alert('GPS取得エラー: '+err.message); stopGps() },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    )
    setGpsWatchId(id)
  }

  function stopGps() {
    if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); setGpsWatchId(null) }
    setGpsTracking(null)
    gpsLastPos.current = null
  }

  function stopAlarm() {
    setIsAlarm(false)
    if ((window as any).__alarmInterval) { clearInterval((window as any).__alarmInterval); (window as any).__alarmInterval = null }
    setSwTotal(swMs)
    setSwRunning(false)
  }

  const MONTHS=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const firstDay = new Date(calYear,calMonth,1).getDay()
  const daysInMonth = new Date(calYear,calMonth+1,0).getDate()
  const daysInPrev = new Date(calYear,calMonth,0).getDate()
  const totalCells = Math.ceil((firstDay+daysInMonth)/7)*7
  const selectedEvents = selectedDate ? calEvents.filter(e=>e.date===selectedDate) : []

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    :root{--bg:#080808;--bg2:#141414;--bg3:#1e1e1e;--bg4:#272727;--acc:#c8ff00;--text:#ffffff;--sub:#b0b0b0;--muted:#777;--muted2:#333;}
    html,body{height:100%;overflow:hidden;} input,textarea,select{font-size:16px !important;}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;}
    .wrap{display:flex;flex-direction:column;height:100dvh;max-width:430px;margin:0 auto;background:var(--bg);}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 10px;flex-shrink:0;border-bottom:0.5px solid #2a2a2a;}
    .logo{font-family:'Bebas Neue';font-size:22px;letter-spacing:2px;color:var(--acc);}
    .lv-chip{display:flex;align-items:center;gap:5px;background:var(--bg3);border:0.5px solid var(--muted2);border-radius:20px;padding:4px 10px;font-size:11px;cursor:pointer;}
    .out-btn{background:none;border:0.5px solid var(--muted2);border-radius:20px;padding:4px 10px;color:var(--muted);font-size:10px;cursor:pointer;font-family:'DM Sans';}
    .content{flex:1;overflow:hidden;position:relative;}
    .page{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:12px 16px 16px;}
    .page::-webkit-scrollbar{display:none;}
    .nav{display:flex;border-top:0.5px solid var(--muted2);background:var(--bg);flex-shrink:0;padding:6px 0;padding-bottom:calc(6px + env(safe-area-inset-bottom,0px));}
    .nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border:none;background:none;color:#666;font-family:'DM Sans';cursor:pointer;transition:color 0.15s;}
    .nav-btn.on{color:var(--acc);}
    .nav-btn svg{width:20px;height:20px;}
    .nav-btn span{font-size:9px;letter-spacing:0.02em;}
    .card{background:var(--bg2);border:0.5px solid #333;border-radius:14px;padding:14px 16px;margin-bottom:10px;}
    .btn{width:100%;background:var(--acc);color:#000;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans';margin-top:8px;}
    .btn:active{transform:scale(0.98);}
    .btn-ghost{width:100%;background:none;border:0.5px solid #444;border-radius:10px;padding:10px;font-size:13px;color:#aaa;cursor:pointer;font-family:'DM Sans';margin-top:6px;}
    .sec{font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;font-weight:500;}
    .inp{width:50px;text-align:center;font-size:12px;padding:4px;border:0.5px solid var(--muted2);border-radius:6px;background:var(--bg3);color:var(--text);font-family:'DM Sans';}
    .inp:focus{outline:none;border-color:var(--acc);}
    .text-inp{width:100%;font-size:16px;background:var(--bg3);border:0.5px solid var(--muted2);border-radius:10px;padding:9px 12px;color:var(--text);font-family:'DM Sans';outline:none;}
    .text-inp:focus{border-color:var(--acc);}
    .stat-box{background:var(--bg2);border:0.5px solid var(--muted2);border-radius:10px;padding:10px;text-align:center;}
    .done-circle{width:24px;height:24px;border-radius:50%;border:0.5px solid var(--muted2);background:none;color:var(--muted);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;margin:0 auto;}
    .done-circle.on{background:var(--acc);border-color:var(--acc);color:#000;}
    .add-row{display:flex;gap:8px;margin-bottom:8px;}
    .add-row input{flex:1;font-size:13px;background:var(--bg3);border:0.5px solid var(--muted2);border-radius:10px;padding:9px 12px;color:var(--text);font-family:'DM Sans';outline:none;}
    .add-row input:focus{border-color:var(--acc);}
    .add-row button{background:var(--acc);color:#000;border:none;border-radius:10px;padding:9px 14px;cursor:pointer;font-size:16px;font-weight:500;}
    .xp-track{flex:1;height:3px;background:var(--bg4);border-radius:2px;overflow:hidden;}
    .xp-fill{height:3px;border-radius:2px;}
    .notif{border-radius:10px;padding:9px 13px;margin-bottom:7px;display:flex;align-items:center;gap:9px;font-size:12px;background:#071a07;border:0.5px solid #1a4a1a;}
    .pill{padding:6px 12px;border-radius:20px;border:0.5px solid var(--muted2);background:var(--bg3);color:var(--muted);font-size:12px;cursor:pointer;font-family:'DM Sans';}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:100;display:flex;align-items:flex-end;justify-content:center;}
    .modal-sheet{background:#161616;border-radius:20px 20px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom,0px));width:100%;max-width:430px;max-height:85vh;overflow-y:auto;}
    .color-dot{width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid transparent;flex-shrink:0;}
    .color-dot.sel{border-color:white;transform:scale(1.15);}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.05)}}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
    .cal-cell{border-radius:8px;cursor:pointer;border:0.5px solid transparent;display:flex;flex-direction:column;align-items:center;padding:4px 2px 3px;min-height:52px;}
    .cal-cell:active{opacity:0.7;}
    .event-pill{width:100%;border-radius:3px;height:4px;margin-top:2px;flex-shrink:0;}
    .day-event-row{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:0.5px solid var(--muted2);}
    .day-event-row:last-child{border-bottom:none;}
  `

  if (loading) return (
    <><style>{css}</style>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100dvh',color:'#c8ff00',fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:3}}>FITSTREAK</div></>
  )

  return (
    <><style>{css}</style>
    <div className="wrap">
      <div className="topbar">
        <div className="logo">FITSTREAK</div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div className="lv-chip" onClick={()=>setTab('profile')}>
            <span style={{fontSize:12}}>{lv.icon}</span>
            <span style={{color:lv.color,fontWeight:500}}>LV.{lv.lv} {lv.name}</span>
          </div>
          <button className="out-btn" onClick={async()=>{await supabase.auth.signOut();router.push('/login')}}>OUT</button>
        </div>
      </div>

      {notifs.length>0&&(
        <div style={{padding:'8px 16px 0',flexShrink:0}}>
          {notifs.map((n,i)=>(
            <div key={i} className="notif">
              <span style={{flex:1,color:'#c8ff00'}}>{n}</span>
              <button onClick={()=>setNotifs([])} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:16}}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="content">

        {/* ===== 今日 ===== */}
        {tab==='today'&&(
        <div className="page">
          <div style={{textAlign:'center',padding:'12px 0 10px'}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:72,lineHeight:1,color:'#c8ff00',letterSpacing:-2,textShadow:'0 0 40px rgba(200,255,0,0.3)'}}>{streak}</div>
            <div style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.15em',textTransform:'uppercase',marginTop:-2}}>DAY STREAK</div>
            <div style={{display:'flex',alignItems:'center',gap:8,maxWidth:180,margin:'8px auto 0'}}>
              <span style={{fontSize:9,color:lv.color,whiteSpace:'nowrap'}}>LV.{lv.lv}</span>
              <div className="xp-track"><div className="xp-fill" style={{width:`${lvPct}%`,background:lv.color}}/></div>
              <span style={{fontSize:9,color:'#444',whiteSpace:'nowrap'}}>{nl?nl.needXP:'MAX'}</span>
            </div>
          </div>

          {/* 今週 */}
          <div style={{display:'flex',gap:4,marginBottom:12}}>
            {DAYS_JP.map((d,i)=>{
              const offset=i-now.getDay()
              const dd=new Date(todayY,todayM,todayD+offset)
              const key=dateKey(dd.getFullYear(),dd.getMonth(),dd.getDate())
              const evs=calEvents.filter(e=>e.date===key)
              const isToday=i===now.getDay()
              const isDone=history.some((h:any)=>h.date===key)
              return(
                <div key={i} style={{flex:1,textAlign:'center'}}>
                  <div style={{fontSize:9,color:i===0?'#ff6b6b':i===6?'#60a5fa':'var(--muted)',marginBottom:3}}>{d}</div>
                  <div style={{width:'100%',aspectRatio:'1',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:500,background:isDone?'#c8ff00':evs.length>0?`${evs[0].color}22`:'var(--bg3)',border:isToday?`1.5px solid #c8ff00`:evs.length>0?`0.5px solid ${evs[0].color}55`:'0.5px solid transparent',color:isDone?'#000':isToday?'#c8ff00':'var(--muted)'}}>
                    {isDone?'✓':evs.length>0?evs[0].title.slice(0,2):d}
                  </div>
                </div>
              )
            })}
          </div>

          {todayDone?(
            <div className="card" style={{textAlign:'center',border:'0.5px solid #1a4a1a'}}>
              <div style={{fontSize:24,marginBottom:4}}>✅</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:'#00ff87',letterSpacing:1}}>TODAY COMPLETE</div>
            </div>
          ):todayEvents.length===0?(
            <div className="card" style={{textAlign:'center'}}>
              <div style={{fontSize:24,marginBottom:6}}>📅</div>
              <div style={{fontSize:13,color:'var(--muted)'}}>今日の予定が未設定です</div>
              <button className="btn" style={{width:'auto',padding:'9px 18px'}} onClick={()=>setTab('calendar')}>カレンダーで設定する</button>
            </div>
          ):(
            <div>
              {todayEvents.map(ev=>(
                <div key={ev.id} className="card" style={{border:`0.5px solid ${ev.color}44`,marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:ev.memo?6:0}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:ev.color,flexShrink:0}}/>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,flex:1}}>{ev.title}</div>
                  </div>
                  {ev.memo&&<div style={{fontSize:12,color:'#666',marginBottom:8}}>📝 {ev.memo}</div>}
                </div>
              ))}
              <button className="btn" onClick={()=>{setExercises([{id:Math.random().toString(),name:'',sets:[{w:'',r:'',done:false}],mode:'strength'}]);setTab('log')}}>▶ START WORKOUT</button>
            </div>
          )}
          <button className="btn-ghost" onClick={()=>setTab('calendar')}>📅 カレンダーで予定を管理</button>
        </div>
        )}

        {/* ===== カレンダー ===== */}
        {tab==='calendar'&&(
        <div className="page">
          {/* ヘッダー */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <button onClick={()=>{setCalMonth(m=>{const nm=m-1;if(nm<0){setCalYear(y=>y-1);return 11}return nm});setSelectedDate(null)}}
              style={{width:32,height:32,borderRadius:8,border:'0.5px solid var(--muted2)',background:'var(--bg3)',color:'var(--text)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:1}}>{calYear}年 {MONTHS[calMonth]}</div>
            <button onClick={()=>{setCalMonth(m=>{const nm=m+1;if(nm>11){setCalYear(y=>y+1);return 0}return nm});setSelectedDate(null)}}
              style={{width:32,height:32,borderRadius:8,border:'0.5px solid var(--muted2)',background:'var(--bg3)',color:'var(--text)',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
          </div>

          {/* 曜日 */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:5}}>
            {DAYS_JP.map((d,i)=><div key={i} style={{textAlign:'center',fontSize:11,color:i===0?'#ff6b6b':i===6?'#60a5fa':'var(--muted)',padding:'3px 0',fontWeight:500}}>{d}</div>)}
          </div>

          {/* カレンダーグリッド */}
          <div className="cal-grid">
            {Array.from({length:totalCells},(_,i)=>{
              let d,m,y,isOther=false
              if(i<firstDay){d=daysInPrev-firstDay+i+1;m=calMonth-1;y=calYear;if(m<0){m=11;y--};isOther=true}
              else if(i>=firstDay+daysInMonth){d=i-firstDay-daysInMonth+1;m=calMonth+1;y=calYear;if(m>11){m=0;y++};isOther=true}
              else{d=i-firstDay+1;m=calMonth;y=calYear}
              const key=dateKey(y,m,d)
              const evs=calEvents.filter(e=>e.date===key)
              const isToday=y===todayY&&m===todayM&&d===todayD
              const isDone=history.some((h:any)=>h.date===key)
              const isSel=selectedDate===key
              const dow=i%7
              return(
                <div key={i} className="cal-cell" onClick={()=>{if(isOther)return;setSelectedDate(isSel?null:key)}}
                  style={{opacity:isOther?0.12:1,background:isSel?'var(--bg4)':isDone?'#0d1f0d':'transparent',border:isToday?`1.5px solid #c8ff00`:isSel?`1px solid #c8ff00`:isDone?'0.5px solid #1a4a1a':'0.5px solid transparent'}}>
                  <div style={{
                    width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                    border:isDone?'2px solid #c8ff00':isToday?'2px solid #c8ff00':'none',
                    background:isDone?'rgba(200,255,0,0.12)':'transparent',
                    marginBottom:2,
                  }}>
                    <div style={{fontSize:12,color:dow===0&&!isOther?'#ff6b6b':dow===6&&!isOther?'#60a5fa':isToday||isDone?'#c8ff00':'#ccc',fontWeight:isToday||isDone?600:400,lineHeight:1}}>{d}</div>
                  </div>
                  {!isDone&&evs.length>0&&(
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,width:'100%'}}>
                      {evs.slice(0,2).map((ev,ei)=>(
                        <div key={ei} style={{display:'flex',alignItems:'center',gap:2,width:'100%'}}>
                        <div key={ei} style={{width:'70%',height:3,borderRadius:2,background:ev.color}}/>
                      ))}
                      {evs.length>2&&(
                        <div style={{fontSize:8,color:'#aaa',lineHeight:1,marginTop:1}}>+{evs.length-2}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 選択した日の予定 */}
          {selectedDate&&(
            <div style={{marginTop:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:16,letterSpacing:1,color:'#c8ff00'}}>
                  {selectedDate.split('-').slice(1).join('/')} ({DAYS_JP[new Date(selectedDate+'T00:00:00').getDay()]})
                </div>
                <button onClick={()=>{setShowAddModal(true);setEditTitle('');setEditMemo('');setEditColor(EVENT_COLORS[0])}}
                  style={{background:'#c8ff00',color:'#000',border:'none',borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  + 予定追加
                </button>
              </div>
              {selectedEvents.length===0?(
                <div style={{textAlign:'center',padding:'1rem 0',color:'var(--muted)',fontSize:12}}>予定がありません。追加しましょう！</div>
              ):(
                <div className="card">
                  {selectedEvents.map(ev=>(
                    <div key={ev.id} className="day-event-row" onClick={()=>setEditEvent(ev)}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:ev.color,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <div style={{fontSize:13,fontWeight:500,color:'#fff'}}>{ev.title}</div>
                          {ev.repeat_type&&ev.repeat_type!=='none'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:10,background:'rgba(200,255,0,0.1)',color:'#c8ff00'}}>{ev.repeat_type==='weekly'?'毎週':'毎月'}</span>}
                        </div>
                        {ev.memo&&<div style={{fontSize:11,color:'#666',marginTop:2}}>{ev.memo}</div>}
                      </div>
                      <span style={{fontSize:18,color:'var(--muted)'}}>›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {!selectedDate&&<div style={{fontSize:11,color:'var(--muted)',textAlign:'center',marginTop:10}}>日付をタップして予定を管理</div>}
        </div>
        )}

        {/* ===== 記録 ===== */}
        {tab==='log'&&(
        <div className="page">
          <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,color:'#555',marginBottom:10}}>
            {todayEvents.length>0?todayEvents[0].title:'WORKOUT'}
          </div>
          {exercises.map((ex,ei)=>(
            <div key={ex.id} className="card">
              {/* 種目名 */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <input value={ex.name} onChange={e=>setExercises(exs=>exs.map((x,xi)=>xi===ei?{...x,name:e.target.value}:x))}
                  placeholder="種目名を入力..." className="text-inp" style={{flex:1,fontSize:13}}/>
              </div>
              {/* モード切替 */}
              <div style={{display:'flex',gap:6,marginBottom:12}}>
                <button onClick={()=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,mode:'strength',sets:[{w:'',r:'',done:false}]}:ex2))}
                  style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:ex.mode==='strength'?'#c8ff00':'#1e1e1e',color:ex.mode==='strength'?'#000':'#666',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  💪 筋トレ
                </button>
                <button onClick={()=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,mode:'cardio',sets:[{w:'',r:'',done:false,time:'',dist:''}]}:ex2))}
                  style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:ex.mode==='cardio'?'#22d3ee':'#1e1e1e',color:ex.mode==='cardio'?'#000':'#666',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  🏃 有酸素
                </button>
              </div>

              {ex.mode==='strength'?(
                <>
                  {prs.find(p=>p.exercise_name===ex.name)&&(
                    <div style={{fontSize:11,color:'#c8ff00',marginBottom:8}}>🏆 PR: {prs.find(p=>p.exercise_name===ex.name)!.max_weight}kg</div>
                  )}
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr>
                      <th style={{color:'#999',fontWeight:500,fontSize:11,padding:'4px',textAlign:'center'}}>SET</th>
                      <th style={{color:'#999',fontWeight:500,fontSize:11,textAlign:'center'}}>KG</th>
                      <th style={{color:'#999',fontWeight:500,fontSize:11,textAlign:'center'}}>REPS</th>
                      <th/>
                    </tr></thead>
                    <tbody>
                      {ex.sets.map((s,i)=>(
                        <tr key={i}>
                          <td style={{textAlign:'center',color:'#555',padding:3}}>{i+1}</td>
                          <td style={{padding:3,textAlign:'center'}}><input className="inp" type="number" placeholder="60" value={s.w} onChange={e=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:ex2.sets.map((s2,j)=>j===i?{...s2,w:e.target.value}:s2)}:ex2))}/></td>
                          <td style={{padding:3,textAlign:'center'}}><input className="inp" type="number" placeholder="10" value={s.r} onChange={e=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:ex2.sets.map((s2,j)=>j===i?{...s2,r:e.target.value}:s2)}:ex2))}/></td>
                          <td style={{textAlign:'center',padding:3}}>
                            <button className={`done-circle ${s.done?'on':''}`} onClick={()=>{
                              setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:ex2.sets.map((s2,j)=>j===i?{...s2,done:!s2.done}:s2)}:ex2))
                              if(!s.done&&!swRunning){setSwTotal(swMs);setSwRunning(true)}
                            }}>{s.done&&'✓'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={()=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:[...ex2.sets,{w:'',r:'',done:false}]}:ex2))}
                    style={{fontSize:11,color:'#c8ff00',background:'none',border:'none',cursor:'pointer',padding:'5px 0',marginTop:3,fontFamily:"'DM Sans'"}}>+ ADD SET</button>
                </>
              ):(
                <>
                  {ex.sets.map((s,i)=>(
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,alignItems:'flex-end'}}>
                        <div>
                          <div style={{fontSize:10,color:'#999',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.08em'}}>時間（分）</div>
                          <input type="number" placeholder="30" value={s.time||''} onChange={e=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:ex2.sets.map((s2,j)=>j===i?{...s2,time:e.target.value}:s2)}:ex2))}
                            style={{width:'100%',textAlign:'center',fontSize:16,padding:'8px',border:'0.5px solid #333',borderRadius:8,background:'#1e1e1e',color:'#fff',fontFamily:"'DM Sans'",outline:'none'}}/>
                        </div>
                        <div>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5}}>
                            <div style={{fontSize:10,color:'#999',textTransform:'uppercase',letterSpacing:'0.08em'}}>距離（km）</div>
                            {i===0&&(
                              <button onClick={()=>gpsTracking===ex.id?stopGps():startGps(ex.id)}
                                style={{fontSize:10,padding:'3px 8px',borderRadius:12,border:'none',background:gpsTracking===ex.id?'rgba(255,68,68,0.2)':'rgba(34,211,238,0.15)',color:gpsTracking===ex.id?'#ff5555':'#22d3ee',cursor:'pointer',fontFamily:"'DM Sans'",fontWeight:500}}>
                                {gpsTracking===ex.id?'⏹ GPS停止':'📍 GPS計測'}
                              </button>
                            )}
                          </div>
                          <div style={{position:'relative'}}>
                            <input type="number" placeholder="5.0" step="0.01" value={s.dist||''} onChange={e=>setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:ex2.sets.map((s2,j)=>j===i?{...s2,dist:e.target.value}:s2)}:ex2))}
                              style={{width:'100%',textAlign:'center',fontSize:16,padding:'8px',border:`0.5px solid ${gpsTracking===ex.id?'#22d3ee':'#333'}`,borderRadius:8,background:'#1e1e1e',color:'#fff',fontFamily:"'DM Sans'",outline:'none'}}/>
                            {gpsTracking===ex.id&&<div style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',width:6,height:6,borderRadius:'50%',background:'#22d3ee',animation:'pulse 1s infinite'}}/>}
                          </div>
                        </div>
                        <button className={`done-circle ${s.done?'on':''}`} style={{marginBottom:2,flexShrink:0}} onClick={()=>{
                          setExercises(exs=>exs.map(ex2=>ex2.id===ex.id?{...ex2,sets:ex2.sets.map((s2,j)=>j===i?{...s2,done:!s2.done}:s2)}:ex2))
                        }}>{s.done&&'✓'}</button>
                      </div>
                      {s.time&&s.dist&&parseFloat(s.dist||'0')>0&&parseFloat(s.time||'0')>0&&(
                        <div style={{fontSize:11,color:'#22d3ee',marginTop:6,padding:'5px 8px',background:'rgba(34,211,238,0.08)',borderRadius:6}}>
                          ⚡ ペース: {(parseFloat(s.time||'0')/parseFloat(s.dist||'1')).toFixed(1)} 分/km　|　速度: {(parseFloat(s.dist||'0')/(parseFloat(s.time||'1')/60)).toFixed(1)} km/h
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          ))}

          {/* REST TIMER */}
          <div style={{textAlign:'center',padding:'14px 12px',background:'#141414',borderRadius:14,marginBottom:10,border:'0.5px solid #2a2a2a'}}>
            <div style={{fontSize:11,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10,fontWeight:500}}>REST TIMER</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:56,letterSpacing:3,lineHeight:1,color:swRunning?'#c8ff00':swTotal===0&&swMs>0?'#00ff87':'#ffffff',marginBottom:12}}>
              {String(Math.floor(swTotal/60000)).padStart(2,'0')}:{String(Math.floor((swTotal%60000)/1000)).padStart(2,'0')}<span style={{fontSize:26,color:'#555',letterSpacing:1}}>.{String(Math.floor((swTotal%1000)/10)).padStart(2,'0')}</span>
            </div>
            <div style={{display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap',marginBottom:12}}>
              {[{l:'+30分',v:1800},{l:'+1分',v:60},{l:'+30秒',v:30},{l:'+10秒',v:10}].map(btn=>(
                <button key={btn.l} onClick={()=>{setSwRunning(false);setSwTotal(p=>p+btn.v*1000);setSwMs(p=>p+btn.v*1000)}}
                  style={{padding:'7px 13px',borderRadius:20,border:'0.5px solid #404040',background:'#1e1e1e',color:'#ddd',fontSize:12,cursor:'pointer',fontFamily:"'DM Sans'",fontWeight:500}}>
                  {btn.l}
                </button>
              ))}
              <button onClick={()=>{setSwRunning(false);setSwTotal(0);setSwMs(0)}}
                style={{padding:'7px 13px',borderRadius:20,border:'0.5px solid #ff444444',background:'none',color:'#ff6666',fontSize:12,cursor:'pointer',fontFamily:"'DM Sans'"}}>
                クリア
              </button>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button onClick={()=>{
                // Unlock AudioContext on user gesture
                try {
                  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
                  const ctx = new AudioCtx()
                  const buf = ctx.createBuffer(1,1,22050)
                  const src = ctx.createBufferSource()
                  src.buffer = buf; src.connect(ctx.destination); src.start(0)
                  setTimeout(()=>ctx.close(), 100)
                } catch(e) {}
                setSwRunning(r=>!r)
              }}
                style={{padding:'11px 32px',borderRadius:24,border:'none',background:swRunning?'rgba(255,68,68,0.15)':'rgba(200,255,0,0.15)',color:swRunning?'#ff5555':'#c8ff00',fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans'",letterSpacing:'0.05em'}}>
                {swRunning?'⏸ PAUSE':'▶ START'}
              </button>
              <button onClick={()=>{setSwRunning(false);setSwTotal(swMs)}}
                style={{padding:'11px 20px',borderRadius:24,border:'0.5px solid #404040',background:'#1e1e1e',color:'#aaa',fontSize:18,cursor:'pointer',fontFamily:"'DM Sans'"}}>
                ↺
              </button>
            </div>
          </div>

          <div className="add-row">
            <input value={newExName} onChange={e=>setNewExName(e.target.value)} placeholder="種目を追加..."/>
            <button onClick={()=>{if(!newExName.trim())return;setExercises(exs=>[...exs,{id:Math.random().toString(),name:newExName.trim(),sets:[{w:'',r:'',done:false}],mode:'strength'}]);setNewExName('')}}>+</button>
          </div>
          <button className="btn" onClick={completeWorkout}>🏆 COMPLETE WORKOUT</button>
        </div>
        )}

        {/* ===== グラフ ===== */}
        {tab==='graph'&&(
        <div className="page">
          <div className="sec">ボリューム推移</div>
          <div className="card">
            {history.length===0?<div style={{textAlign:'center',padding:'1rem 0',color:'var(--muted)',fontSize:12}}>記録するとグラフが表示されます</div>:(
              <div style={{display:'flex',alignItems:'flex-end',gap:3,height:70,marginBottom:5}}>
                {[...history].slice(0,8).reverse().map((h:any,i)=>{
                  const maxVol=Math.max(...history.slice(0,8).map((x:any)=>x.total_volume||0),1)
                  const pct=Math.round((h.total_volume||0)/maxVol*70)
                  return(
                    <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                      <div style={{fontSize:7,color:'#c8ff00'}}>{h.total_volume||0}</div>
                      <div style={{width:'100%',background:'#c8ff00',borderRadius:'3px 3px 0 0',minHeight:3,height:pct}}/>
                      <div style={{fontSize:7,color:'var(--muted)'}}>{String(h.date).slice(5).replace('-','/')}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="sec" style={{marginTop:4}}>最近の記録</div>
          <div className="card">
            {history.length===0?<div style={{textAlign:'center',color:'var(--muted)',fontSize:12,padding:'0.5rem 0'}}>まだ記録がありません</div>:
              history.slice(0,6).map((h:any,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'0.5px solid #111'}}>
                  <div style={{width:5,height:5,borderRadius:'50%',background:'#c8ff00',flexShrink:0}}/>
                  <div style={{fontSize:10,color:'#444',minWidth:48}}>{String(h.date).slice(5).replace('-','/')}</div>
                  <div style={{flex:1,fontSize:12,color:'#ccc'}}>{h.muscle}</div>
                  <div style={{fontSize:12,fontWeight:500,color:'#c8ff00'}}>{(h.total_volume||0).toLocaleString()}kg</div>
                </div>
              ))}
          </div>
        </div>
        )}

        {/* ===== プロフィール ===== */}
        {tab==='profile'&&(
        <div className="page">
          <div style={{textAlign:'center',padding:'12px 0 10px'}}>
            {/* アバター */}
            <div style={{position:'relative',width:72,height:72,margin:'0 auto 10px'}}>
              {profile?.avatar_url?(
                <img src={profile.avatar_url} alt="avatar" style={{width:72,height:72,borderRadius:'50%',objectFit:'cover',border:`2px solid ${lv.color}`}}/>
              ):(
                <div style={{width:72,height:72,borderRadius:'50%',background:'#1e1e1e',border:`2px solid ${lv.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:600,color:lv.color}}>
                  {profile?.username?.[0]?.toUpperCase()||'?'}
                </div>
              )}
              <label style={{position:'absolute',bottom:0,right:0,width:22,height:22,borderRadius:'50%',background:'#c8ff00',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12}}>
                {uploadingAvatar?'⏳':'📷'}
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadAvatar(f)}}/>
              </label>
            </div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:lv.color,letterSpacing:2}}>LV.{lv.lv} {lv.name}</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:lv.color,letterSpacing:2}}>LV.{lv.lv} {lv.name}</div>
            <div style={{fontSize:15,color:'#fff',fontWeight:500,marginTop:4}}>{profile?.username||''}</div>
            <div style={{fontSize:10,color:'#555',marginTop:2}}>{xp} WORKOUTS</div>
            <button onClick={()=>{setEditUsername(profile?.username||'');setEditProfileMsg('');setShowEditProfile(true)}}
              style={{marginTop:8,background:'none',border:'0.5px solid #333',borderRadius:20,padding:'5px 14px',color:'#aaa',fontSize:11,cursor:'pointer',fontFamily:"'DM Sans'"}}>
              ✏️ プロフィール編集
            </button>
            <div style={{maxWidth:160,margin:'8px auto 0'}}>
              <div style={{height:3,background:'var(--bg4)',borderRadius:2,overflow:'hidden'}}>
                <div style={{height:3,background:lv.color,width:`${lvPct}%`,borderRadius:2}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#333',marginTop:3}}>
                <span>{xp}</span><span>{nl?nl.needXP+' next':'MAX'}</span>
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
            {[{v:streak,l:'STREAK',c:'#c8ff00'},{v:history.length,l:'SESSIONS',c:'var(--text)'},{v:history.reduce((s:number,h:any)=>s+(h.total_volume||0),0).toLocaleString(),l:'TOT KG',c:'var(--text)'}].map((s,i)=>(
              <div key={i} className="stat-box">
                <div style={{fontFamily:"'Bebas Neue'",fontSize:22,lineHeight:1,color:s.c}}>{s.v}</div>
                <div style={{fontSize:9,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
          <div className="sec">PERSONAL RECORDS</div>
          <div className="card">
            {prs.length===0?<div style={{textAlign:'center',padding:'0.5rem 0',color:'var(--muted)',fontSize:12}}>まだ記録がありません</div>:
              [...prs].sort((a,b)=>b.max_weight-a.max_weight).slice(0,5).map((p,i)=>(
                <div key={p.exercise_name} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'0.5px solid var(--muted2)'}}>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:16,width:20,color:i===0?'#c8ff00':i===1?'#888':i===2?'#7a5c2e':'#333'}}>{i+1}</div>
                  <div style={{flex:1,fontSize:13,color:'#e0e0e0'}}>{p.exercise_name}</div>
                  <div style={{fontSize:13,fontWeight:500,color:'#c8ff00'}}>{p.max_weight}kg</div>
                </div>
              ))}
          </div>
          <div className="sec" style={{marginTop:4}}>RANKS</div>
          <div className="card">
            {LEVELS.map(l=>(
              <div key={l.lv} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'0.5px solid var(--muted2)',opacity:lv.lv>=l.lv?1:0.28}}>
                <div style={{fontSize:18,width:30,textAlign:'center'}}>{l.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:1,color:l.color}}>LV.{l.lv} {l.name}</div>
                  <div style={{fontSize:9,color:'#333'}}>{l.needXP} SESSIONS</div>
                </div>
                <span style={{color:lv.lv>=l.lv?'#c8ff00':'#222'}}>{lv.lv>=l.lv?'✓':'🔒'}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ===== バッジ ===== */}
        {tab==='badges'&&(
        <div className="page">
          <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:10}}>
            <span style={{fontFamily:"'Bebas Neue'",fontSize:28,color:'#c8ff00'}}>{earnedBadges.length}</span>
            <span style={{fontSize:12,color:'#444'}}>/ {BADGES.length} BADGES</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {BADGES.map(b=>{
              const isE=earnedBadges.includes(b.id)
              return(
                <div key={b.id} style={{textAlign:'center',padding:'10px 4px',borderRadius:10,border:`0.5px solid ${isE?'#c8ff0022':'var(--muted2)'}`,background:'var(--bg2)',opacity:isE?1:0.22}}>
                  <div style={{fontSize:20,marginBottom:3}}>{b.icon}</div>
                  <div style={{fontSize:9,fontWeight:500,color:isE?'#c8ff00':'#222'}}>{b.name}</div>
                  <div style={{fontSize:8,color:'#333',marginTop:2}}>{b.cond}</div>
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* ===== フレンド ===== */}
        {tab==='friends'&&(
        <div className="page">
          {/* フレンド検索 */}
          <div className="sec">フレンドを追加</div>
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:'flex',gap:8,marginBottom:searchResult||searchMsg?10:0}}>
              <input value={searchUsername} onChange={e=>setSearchUsername(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&searchFriend()}
                placeholder="ユーザー名で検索..." className="text-inp" style={{flex:1,fontSize:14}}/>
              <button onClick={searchFriend}
                style={{background:'#c8ff00',color:'#000',border:'none',borderRadius:10,padding:'9px 14px',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:"'DM Sans'"}}>
                検索
              </button>
            </div>
            {searchMsg&&<div style={{fontSize:12,color:searchMsg.includes('送り')?'#c8ff00':'#ff6666',marginTop:6}}>{searchMsg}</div>}
            {searchResult&&(
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderTop:'0.5px solid #2a2a2a',marginTop:8}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'#1e1e1e',border:'0.5px solid #333',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:600,color:'#c8ff00'}}>
                  {searchResult.username[0].toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:500,color:'#fff'}}>{searchResult.username}</div>
                  <div style={{fontSize:11,color:'#777'}}>🔥 {searchResult.streak}日ストリーク</div>
                </div>
                <button onClick={()=>sendFriendRequest(searchResult.id)}
                  style={{background:'#c8ff00',color:'#000',border:'none',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:500,fontFamily:"'DM Sans'"}}>
                  追加
                </button>
              </div>
            )}
          </div>

          {/* フレンドリクエスト */}
          {friendRequests.length>0&&(
            <>
              <div className="sec">リクエスト受信中 {friendRequests.length}件</div>
              <div className="card" style={{marginBottom:12}}>
                {friendRequests.map(req=>(
                  <div key={req.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'0.5px solid #2a2a2a'}}>
                    <div style={{width:36,height:36,borderRadius:'50%',background:'#1e1e1e',border:'0.5px solid #333',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:600,color:'#a78bfa'}}>
                      {req.requester.username[0].toUpperCase()}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500,color:'#fff'}}>{req.requester.username}</div>
                      <div style={{fontSize:11,color:'#777'}}>🔥 {req.requester.streak}日</div>
                    </div>
                    <button onClick={()=>acceptFriend(req.id, user!.id)}
                      style={{background:'#c8ff00',color:'#000',border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:500,fontFamily:"'DM Sans'",marginRight:6}}>
                      承認
                    </button>
                    <button onClick={()=>rejectFriend(req.id)}
                      style={{background:'none',border:'0.5px solid #ff444455',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:12,color:'#ff6666',fontFamily:"'DM Sans'"}}>
                      拒否
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* フレンド一覧 */}
          <div className="sec">フレンド {friends.length}人</div>
          {friends.length===0?(
            <div style={{textAlign:'center',padding:'2rem 0',color:'#555',fontSize:13}}>
              <div style={{fontSize:32,marginBottom:8}}>👥</div>
              フレンドがいません<br/>
              <span style={{fontSize:11,color:'#444'}}>ユーザー名で検索して追加しよう</span>
            </div>
          ):(
            <div className="card">
              {[...friends].sort((a,b)=>b.streak-a.streak).map((f,i)=>{
                const maxStreak = Math.max(...friends.map((x:any)=>x.streak), 1)
                const pct = Math.round(f.streak/maxStreak*100)
                return(
                  <div key={f.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'0.5px solid #1e1e1e'}}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:20,width:24,color:i===0?'#c8ff00':i===1?'#888':'#555',textAlign:'center'}}>{i+1}</div>
                    <div style={{width:40,height:40,borderRadius:'50%',background:'#1e1e1e',border:`1.5px solid ${i===0?'#c8ff00':'#333'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:600,color:i===0?'#c8ff00':'#aaa',flexShrink:0}}>
                      {f.username[0].toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,color:'#fff',marginBottom:4}}>{f.username}</div>
                      <div style={{height:4,background:'#1e1e1e',borderRadius:2}}>
                        <div style={{height:4,background:i===0?'#c8ff00':'#444',borderRadius:2,width:`${pct}%`,transition:'width 0.5s'}}/>
                      </div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:i===0?'#c8ff00':'#aaa',lineHeight:1}}>{f.streak}</div>
                      <div style={{fontSize:9,color:'#555',textTransform:'uppercase'}}>days</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ナビゲーション */}
      <nav className="nav">
        {[
          {id:'today',label:'今日',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>},
          {id:'calendar',label:'カレンダー',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>},
          {id:'log',label:'記録',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 4v6a6 6 0 0012 0V4M4 20h16"/></svg>},
          {id:'graph',label:'グラフ',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>},
          {id:'profile',label:'プロフィール',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
          {id:'badges',label:'バッジ',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>},
          {id:'friends',label:'フレンド',svg:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>},
        ].map(n=>(
          <button key={n.id} className={`nav-btn ${tab===n.id?'on':''}`} onClick={()=>setTab(n.id)}>
            {n.svg}<span>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* ===== 予定追加モーダル ===== */}
      {showAddModal&&(
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setShowAddModal(false)}}>
          <div className="modal-sheet">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,color:'#c8ff00'}}>予定を追加</div>
              <button onClick={()=>setShowAddModal(false)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:20}}>×</button>
            </div>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.08em'}}>タイトル</div>
            <input className="text-inp" placeholder="例：胸トレ、ランニング、休養日..." value={editTitle} onChange={e=>setEditTitle(e.target.value)} style={{marginBottom:12}}/>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.08em'}}>メモ（任意）</div>
            <textarea value={editMemo} onChange={e=>setEditMemo(e.target.value)} placeholder="詳細メモ..."
              style={{width:'100%',fontSize:16,background:'var(--bg3)',border:'0.5px solid var(--muted2)',borderRadius:10,padding:'9px 12px',color:'var(--text)',fontFamily:"'DM Sans'",outline:'none',resize:'none',marginBottom:14}} rows={2}/>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em'}}>繰り返し</div>
            <div style={{display:'flex',gap:6,marginBottom:14}}>
              {[{v:'none',l:'繰り返しなし'},{v:'weekly',l:'毎週'},{v:'monthly',l:'毎月'}].map(r=>(
                <button key={r.v} onClick={()=>setEditRepeat(r.v)}
                  style={{flex:1,padding:'7px 4px',borderRadius:8,border:'none',background:editRepeat===r.v?'#c8ff00':'#1e1e1e',color:editRepeat===r.v?'#000':'#777',fontSize:11,fontWeight:editRepeat===r.v?600:400,cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  {r.l}
                </button>
              ))}
            </div>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>カラー</div>
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
              {EVENT_COLORS.map(c=>(
                <button key={c} className={`color-dot ${editColor===c?'sel':''}`} style={{background:c}} onClick={()=>setEditColor(c)}/>
              ))}
            </div>
            <button onClick={addEvent}
              style={{width:'100%',background:'#c8ff00',color:'#000',border:'none',borderRadius:10,padding:'12px',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:"'DM Sans'"}}>
              保存
            </button>
          </div>
        </div>
      )}

      {/* ===== 予定詳細・削除モーダル ===== */}
      {editEvent&&(
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setEditEvent(null)}}>
          <div className="modal-sheet">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:editEvent.color}}/>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,color:'var(--text)'}}>{editEvent.title}</div>
              </div>
              <button onClick={()=>setEditEvent(null)} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:20}}>×</button>
            </div>
            {editEvent.memo&&<div style={{fontSize:13,color:'#aaa',marginBottom:16,padding:'10px 12px',background:'var(--bg3)',borderRadius:10}}>📝 {editEvent.memo}</div>}
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:16}}>{editEvent.date.split('-').slice(1).join('/')}</div>
            {editEvent.repeat_id ? (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:11,color:'#777',marginBottom:2}}>繰り返し予定の削除</div>
                <button onClick={()=>deleteEvent(editEvent.id,'single')}
                  style={{width:'100%',background:'none',border:'0.5px solid #ff444466',borderRadius:10,padding:'11px',fontSize:13,color:'#ff4444',cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  この予定のみ削除
                </button>
                <button onClick={()=>deleteEvent(editEvent.id,'following')}
                  style={{width:'100%',background:'none',border:'0.5px solid #ff444466',borderRadius:10,padding:'11px',fontSize:13,color:'#ff4444',cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  この予定以降を削除
                </button>
                <button onClick={()=>deleteEvent(editEvent.id,'all')}
                  style={{width:'100%',background:'none',border:'0.5px solid #ff444466',borderRadius:10,padding:'11px',fontSize:13,color:'#ff8888',cursor:'pointer',fontFamily:"'DM Sans'"}}>
                  すべての繰り返しを削除
                </button>
              </div>
            ) : (
              <button onClick={()=>deleteEvent(editEvent.id,'single')}
                style={{width:'100%',background:'none',border:'0.5px solid #ff444466',borderRadius:10,padding:'12px',fontSize:13,color:'#ff4444',cursor:'pointer',fontFamily:"'DM Sans'"}}>
                🗑 この予定を削除
              </button>
            )}
          </div>
        </div>
      )}
      {/* プロフィール編集モーダル */}
      {showEditProfile&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:150,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setShowEditProfile(false)}}>
          <div style={{background:'#161616',borderRadius:'20px 20px 0 0',padding:'20px 20px calc(20px + env(safe-area-inset-bottom,0px))',width:'100%',maxWidth:430}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:1,color:'#c8ff00'}}>プロフィール編集</div>
              <button onClick={()=>setShowEditProfile(false)} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:20}}>×</button>
            </div>
            <div style={{fontSize:10,color:'#999',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.08em'}}>ユーザー名</div>
            <input value={editUsername} onChange={e=>setEditUsername(e.target.value)}
              placeholder="新しいユーザー名..." className="text-inp" style={{marginBottom:6,fontSize:16}}/>
            <div style={{fontSize:10,color:'#555',marginBottom:14}}>※ 他のユーザーと重複するユーザー名は使えません</div>
            {editProfileMsg&&(
              <div style={{fontSize:12,color:editProfileMsg.includes('更新')?'#c8ff00':'#ff6666',marginBottom:10,padding:'6px 10px',background:editProfileMsg.includes('更新')?'rgba(200,255,0,0.08)':'rgba(255,68,68,0.08)',borderRadius:8}}>
                {editProfileMsg}
              </div>
            )}
            <button onClick={updateUsername}
              style={{width:'100%',background:'#c8ff00',color:'#000',border:'none',borderRadius:10,padding:'12px',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans'"}}>
              保存
            </button>
          </div>
        </div>
      )}

      {/* アラームオーバーレイ */}
      {isAlarm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:20}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:28,letterSpacing:3,color:'#c8ff00',animation:'pulse 1s infinite'}}>TIME UP !</div>
          <div style={{fontSize:48}}>⏰</div>
          <button onClick={stopAlarm}
            style={{padding:'16px 48px',background:'#c8ff00',color:'#000',border:'none',borderRadius:24,fontSize:18,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans'",letterSpacing:'0.05em',boxShadow:'0 0 30px rgba(200,255,0,0.5)'}}>
            RESET
          </button>
          <div style={{fontSize:12,color:'#555'}}>タップして止める</div>
        </div>
      )}
    </div>
    </>
  )
}

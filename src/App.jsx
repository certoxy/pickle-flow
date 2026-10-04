import { useEffect, useState } from 'react'
import { CalendarDays, Heart, LogOut, ShieldCheck, Sparkles, Trophy, Users } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const emptyProfile = {
  full_name: '',
  organization_name: '',
  phone: '',
  city: '',
  country: 'Philippines',
}

function Header({ session, onSignOut }) {
  return (
    <header className="topbar">
      <a className="brand" href="/">
        <span className="brand-mark">P</span>
        <span>PickleFlow</span>
      </a>
      {session && (
        <button className="button button-ghost" onClick={onSignOut}>
          <LogOut size={17} /> Sign out
        </button>
      )}
    </header>
  )
}

function Landing({ onStart }) {
  const donationUrl = import.meta.env.VITE_DONATION_URL

  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={15} /> Free for organizers</span>
            <h1>Run pickleball events without the spreadsheet shuffle.</h1>
            <p>
              Create your organizer profile today. Player registration, event tools,
              queues, standings, and court management will follow as PickleFlow grows.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={onStart}>Register as an organizer</button>
              <a className="button button-secondary" href="#about">See what’s coming</a>
            </div>
          </div>
          <div className="court-card" aria-label="Pickleball court illustration">
            <div className="court-net" />
            <div className="ball">●</div>
            <div className="court-copy">
              <strong>Organize. Play. Connect.</strong>
              <span>Built for clubs and community events.</span>
            </div>
          </div>
        </section>

        <section className="feature-grid" id="about">
          <article><Users /><h3>Organizer profiles</h3><p>Keep club and contact information in one secure place.</p></article>
          <article><CalendarDays /><h3>Event tools next</h3><p>A clean foundation for registration, schedules, courts, and queues.</p></article>
          <article><Trophy /><h3>Built to grow</h3><p>Standings, rankings, loyalty, and game-day displays can be added later.</p></article>
        </section>

        <section className="donation-card">
          <div className="donation-icon"><Heart /></div>
          <div>
            <span className="eyebrow">Community supported</span>
            <h2>PickleFlow is free while we build it with organizers.</h2>
            <p>Donations are optional and help cover hosting, development, and future game-day features.</p>
          </div>
          {donationUrl ? (
            <a className="button button-donate" href={donationUrl} target="_blank" rel="noreferrer">Support PickleFlow</a>
          ) : (
            <button className="button button-donate" onClick={() => alert('Thank you! The donation option will be available soon.')}>I’d like to support</button>
          )}
        </section>
      </main>
      <footer>PickleFlow · A PAOTECHS-powered community project</footer>
    </>
  )
}

function AuthPanel({ onClose }) {
  const [mode, setMode] = useState('signup')
  const [form, setForm] = useState({ ...emptyProfile, email: '', password: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    try {
      if (!isSupabaseConfigured) throw new Error('Supabase environment variables have not been configured.')

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: form.full_name,
              organization_name: form.organization_name,
              phone: form.phone,
              city: form.city,
              country: form.country,
            },
          },
        })
        if (error) throw error
        setMessage('Registration received. Please check your email to confirm your account.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">{mode === 'signup' ? 'Organizer registration' : 'Welcome back'}</span>
        <h2 id="auth-title">{mode === 'signup' ? 'Create your free account' : 'Sign in to PickleFlow'}</h2>
        <p className="muted">No subscription or payment is required.</p>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>Full name<input required name="full_name" value={form.full_name} onChange={update} /></label>
              <label>Club or organization<input required name="organization_name" value={form.organization_name} onChange={update} /></label>
              <div className="form-row">
                <label>City<input name="city" value={form.city} onChange={update} /></label>
                <label>Country<input name="country" value={form.country} onChange={update} /></label>
              </div>
              <label>Phone number <span>(optional)</span><input name="phone" value={form.phone} onChange={update} /></label>
            </>
          )}
          <label>Email<input required type="email" name="email" value={form.email} onChange={update} /></label>
          <label>Password<input required minLength="8" type="password" name="password" value={form.password} onChange={update} /></label>
          {message && <div className="form-message">{message}</div>}
          <button className="button button-primary button-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create free organizer account' : 'Sign in'}
          </button>
        </form>

        <button className="text-button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage('') }}>
          {mode === 'signup' ? 'Already registered? Sign in' : 'Need an account? Register'}
        </button>
      </section>
    </div>
  )
}

function Dashboard({ session }) {
  const [profile, setProfile] = useState(emptyProfile)
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase
        .from('organizer_profiles')
        .select('full_name, organization_name, phone, city, country')
        .eq('user_id', session.user.id)
        .single()

      if (!error && data) setProfile({ ...emptyProfile, ...data })
      setBusy(false)
    }
    loadProfile()
  }, [session.user.id])

  async function save(event) {
    event.preventDefault()
    setSaved('')
    const { error } = await supabase
      .from('organizer_profiles')
      .update(profile)
      .eq('user_id', session.user.id)

    setSaved(error ? error.message : 'Profile saved.')
  }

  if (busy) return <main className="dashboard"><p>Loading your organizer profile…</p></main>

  return (
    <main className="dashboard">
      <section className="welcome-card">
        <span className="eyebrow"><ShieldCheck size={15} /> Organizer account</span>
        <h1>Welcome{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!</h1>
        <p>Your PickleFlow account is active and free. Event creation and player registration are the next modules on the roadmap.</p>
      </section>

      <div className="dashboard-grid">
        <section className="profile-card">
          <h2>Organizer profile</h2>
          <form onSubmit={save}>
            <label>Full name<input required value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></label>
            <label>Club or organization<input required value={profile.organization_name} onChange={(e) => setProfile({ ...profile, organization_name: e.target.value })} /></label>
            <label>Phone number<input value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
            <div className="form-row">
              <label>City<input value={profile.city || ''} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></label>
              <label>Country<input value={profile.country || ''} onChange={(e) => setProfile({ ...profile, country: e.target.value })} /></label>
            </div>
            {saved && <div className="form-message">{saved}</div>}
            <button className="button button-primary">Save profile</button>
          </form>
        </section>

        <aside className="next-card">
          <h2>Coming next</h2>
          <ol>
            <li><strong>Create an event</strong><span>Set the date, venue, format, and player limit.</span></li>
            <li><strong>Register players</strong><span>Share a link or add walk-in players.</span></li>
            <li><strong>Run game day</strong><span>Manage courts, queues, scores, and standings.</span></li>
          </ol>
          <div className="mini-donation">
            <Heart size={20} />
            <div><strong>Want to help?</strong><span>Donations will remain completely optional.</span></div>
          </div>
        </aside>
      </div>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) setShowAuth(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="app">
      <Header session={session} onSignOut={signOut} />
      {loading ? <main className="dashboard"><p>Loading PickleFlow…</p></main> : session ? <Dashboard session={session} /> : <Landing onStart={() => setShowAuth(true)} />}
      {!session && showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}
    </div>
  )
}

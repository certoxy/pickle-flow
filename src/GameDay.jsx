import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clock3, Play, Plus, RotateCcw, Swords, Trophy, UserCheck, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'

const playerName = (players, id) => players.find((player) => player.id === id)?.full_name || 'Unknown player'

export default function GameDay({ event, onBack, onEventUpdated }) {
  const [players, setPlayers] = useState([])
  const [courts, setCourts] = useState([])
  const [queue, setQueue] = useState([])
  const [games, setGames] = useState([])
  const [gamePlayers, setGamePlayers] = useState([])
  const [courtName, setCourtName] = useState('')
  const [selectedCourt, setSelectedCourt] = useState('')
  const [selectedPlayers, setSelectedPlayers] = useState([])
  const [scores, setScores] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const teamSize = event.game_format === 'singles' ? 1 : 2
  const playersNeeded = teamSize * 2

  async function load() {
    setLoading(true)
    const [playerResult, courtResult, queueResult, gameResult] = await Promise.all([
      supabase.from('player_registrations').select('*').eq('event_id', event.id).neq('status', 'cancelled').order('full_name'),
      supabase.from('event_courts').select('*').eq('event_id', event.id).order('created_at'),
      supabase.from('game_queue').select('*').eq('event_id', event.id).order('position').order('joined_at'),
      supabase.from('games').select('*').eq('event_id', event.id).order('game_number', { ascending: false })
    ])
    const loadedGames = gameResult.data || []
    const gameIds = loadedGames.map((game) => game.id)
    const participantResult = gameIds.length ? await supabase.from('game_players').select('*').in('game_id', gameIds) : { data: [] }
    setPlayers(playerResult.data || [])
    setCourts(courtResult.data || [])
    setQueue(queueResult.data || [])
    setGames(loadedGames)
    setGamePlayers(participantResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [event.id])

  const waiting = queue.filter((entry) => entry.status === 'waiting').sort((a, b) => a.position - b.position)
  const checkedIn = players.filter((player) => player.checked_in_at)
  const activeGames = games.filter((game) => ['queued', 'playing'].includes(game.status))
  const completedGames = games.filter((game) => game.status === 'completed')
  const standings = useMemo(() => checkedIn.map((player) => {
    const appearances = gamePlayers.filter((entry) => entry.player_registration_id === player.id && completedGames.some((game) => game.id === entry.game_id))
    const wins = appearances.filter((entry) => completedGames.find((game) => game.id === entry.game_id)?.winner_team === entry.team_number).length
    return { ...player, played: appearances.length, wins, losses: appearances.length - wins }
  }).sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.full_name.localeCompare(b.full_name)), [checkedIn, completedGames, gamePlayers])

  async function updateEventSettings(field, value) {
    const payload = { [field]: field === 'points_to_win' ? Number(value) : value }
    const { data, error } = await supabase.from('events').update(payload).eq('id', event.id).select().single()
    if (error) setMessage(error.message); else onEventUpdated(data)
  }

  async function toggleCheckIn(player) {
    const checked_in_at = player.checked_in_at ? null : new Date().toISOString()
    const { error } = await supabase.from('player_registrations').update({ checked_in_at }).eq('id', player.id)
    if (error) return setMessage(error.message)
    setPlayers(players.map((item) => item.id === player.id ? { ...item, checked_in_at } : item))
    if (!checked_in_at) await removeFromQueue(player.id)
  }

  async function addCourt(e) {
    e.preventDefault(); setMessage('')
    const { data, error } = await supabase.from('event_courts').insert({ event_id: event.id, name: courtName.trim() }).select().single()
    if (error) setMessage(error.message); else { setCourts([...courts, data]); setCourtName('') }
  }

  async function toggleCourt(court) {
    const status = court.status === 'disabled' ? 'available' : 'disabled'
    const { error } = await supabase.from('event_courts').update({ status }).eq('id', court.id)
    if (error) setMessage(error.message); else setCourts(courts.map((item) => item.id === court.id ? { ...item, status } : item))
  }

  async function addToQueue(playerId) {
    const position = waiting.length ? Math.max(...waiting.map((item) => item.position)) + 1 : 1
    const { data, error } = await supabase.from('game_queue').upsert({ event_id: event.id, player_registration_id: playerId, position, status: 'waiting', joined_at: new Date().toISOString() }, { onConflict: 'event_id,player_registration_id' }).select().single()
    if (error) setMessage(error.message); else setQueue([...queue.filter((item) => item.player_registration_id !== playerId), data])
  }

  async function removeFromQueue(playerId) {
    const existing = queue.find((item) => item.player_registration_id === playerId)
    if (!existing) return
    const { error } = await supabase.from('game_queue').update({ status: 'removed' }).eq('id', existing.id)
    if (!error) setQueue(queue.map((item) => item.id === existing.id ? { ...item, status: 'removed' } : item))
  }

  function toggleSelected(playerId) {
    setSelectedPlayers(selectedPlayers.includes(playerId) ? selectedPlayers.filter((id) => id !== playerId) : selectedPlayers.length < playersNeeded ? [...selectedPlayers, playerId] : selectedPlayers)
  }

  async function createMatch() {
    setMessage('')
    if (!selectedCourt) return setMessage('Select an available court.')
    if (selectedPlayers.length !== playersNeeded) return setMessage(`Select exactly ${playersNeeded} players.`)
    const gameNumber = games.length ? Math.max(...games.map((game) => game.game_number)) + 1 : 1
    const { data: game, error } = await supabase.from('games').insert({ event_id: event.id, court_id: selectedCourt, game_number: gameNumber, format: event.game_format, points_to_win: event.points_to_win }).select().single()
    if (error) return setMessage(error.message)
    const participants = selectedPlayers.map((playerId, index) => ({ game_id: game.id, player_registration_id: playerId, team_number: index < teamSize ? 1 : 2 }))
    const { data: inserted, error: playerError } = await supabase.from('game_players').insert(participants).select()
    if (playerError) return setMessage(playerError.message)
    await Promise.all([
      supabase.from('event_courts').update({ status: 'in_use' }).eq('id', selectedCourt),
      supabase.from('game_queue').update({ status: 'assigned' }).eq('event_id', event.id).in('player_registration_id', selectedPlayers)
    ])
    setGames([game, ...games]); setGamePlayers([...gamePlayers, ...(inserted || [])])
    setCourts(courts.map((court) => court.id === selectedCourt ? { ...court, status: 'in_use' } : court))
    setQueue(queue.map((entry) => selectedPlayers.includes(entry.player_registration_id) ? { ...entry, status: 'assigned' } : entry))
    setSelectedPlayers([]); setSelectedCourt('')
  }

  async function startGame(game) {
    const { error } = await supabase.from('games').update({ status: 'playing', started_at: new Date().toISOString() }).eq('id', game.id)
    if (error) setMessage(error.message); else setGames(games.map((item) => item.id === game.id ? { ...item, status: 'playing', started_at: new Date().toISOString() } : item))
  }

  async function completeGame(game) {
    const score = scores[game.id] || { one: '', two: '' }
    const one = Number(score.one), two = Number(score.two)
    if (score.one === '' || score.two === '' || one === two) return setMessage('Enter two different final scores.')
    const winner_team = one > two ? 1 : 2
    const completed_at = new Date().toISOString()
    const { error } = await supabase.from('games').update({ status: 'completed', team_one_score: one, team_two_score: two, winner_team, completed_at }).eq('id', game.id)
    if (error) return setMessage(error.message)
    await supabase.from('event_courts').update({ status: 'available' }).eq('id', game.court_id)
    setGames(games.map((item) => item.id === game.id ? { ...item, status: 'completed', team_one_score: one, team_two_score: two, winner_team, completed_at } : item))
    setCourts(courts.map((court) => court.id === game.court_id ? { ...court, status: 'available' } : court))
    setMessage(`Game ${game.game_number} recorded. Players can be added back to the queue.`)
  }

  function participants(game, team) { return gamePlayers.filter((entry) => entry.game_id === game.id && entry.team_number === team).map((entry) => playerName(players, entry.player_registration_id)).join(' & ') }

  if (loading) return <section className="profile-card"><p>Loading game day…</p></section>
  return <section className="game-day-page"><div className="section-title"><div><span className="eyebrow"><Swords size={15} /> Game-day management</span><h2>{event.name}</h2></div><button className="button button-secondary" onClick={onBack}><ArrowLeft size={16} /> Event roster</button></div>
    {message && <div className="form-message game-message">{message}</div>}
    <div className="game-day-summary"><div><strong>{checkedIn.length}</strong><span>Checked in</span></div><div><strong>{waiting.length}</strong><span>Waiting</span></div><div><strong>{activeGames.length}</strong><span>Active games</span></div><div><strong>{completedGames.length}</strong><span>Completed</span></div></div>
    <div className="game-day-grid">
      <section className="profile-card"><h3>Game settings</h3><div className="form-row"><label>Format<select value={event.game_format || 'doubles'} onChange={(e) => updateEventSettings('game_format', e.target.value)}><option value="singles">Singles</option><option value="doubles">Doubles</option><option value="mixed_doubles">Mixed doubles</option></select></label><label>Points to win<input type="number" min="1" max="99" value={event.points_to_win || 11} onChange={(e) => updateEventSettings('points_to_win', e.target.value)} /></label></div><h3 className="subheading">Courts</h3><form className="court-form" onSubmit={addCourt}><input required placeholder="Court name or number" value={courtName} onChange={(e) => setCourtName(e.target.value)} /><button className="button button-primary"><Plus size={16} /> Add</button></form><div className="court-list">{courts.map((court) => <button key={court.id} className={`court-chip ${court.status}`} disabled={court.status === 'in_use'} onClick={() => toggleCourt(court)}>{court.name}<span>{court.status.replace('_', ' ')}</span></button>)}{!courts.length && <p className="muted">Add at least one court to create matches.</p>}</div></section>
      <section className="profile-card"><h3><UserCheck size={19} /> Player check-in</h3><div className="checkin-list">{players.map((player) => { const queued = queue.find((entry) => entry.player_registration_id === player.id)?.status === 'waiting'; return <div className="checkin-row" key={player.id}><div><strong>{player.full_name}</strong><span className="capitalize">{player.skill_level}</span></div><div className="checkin-actions"><button className={`small-action ${player.checked_in_at ? 'checked' : ''}`} onClick={() => toggleCheckIn(player)}>{player.checked_in_at ? <><Check size={15} /> Present</> : 'Check in'}</button>{player.checked_in_at && <button className="small-action" onClick={() => queued ? removeFromQueue(player.id) : addToQueue(player.id)}>{queued ? 'Leave queue' : 'Join queue'}</button>}</div></div>})}</div></section>
    </div>
    <div className="game-day-grid game-day-main">
      <section className="profile-card"><h3><Clock3 size={19} /> Waiting queue</h3>{!waiting.length ? <p className="muted">Checked-in players can be added to the queue.</p> : <div className="queue-list">{waiting.map((entry, index) => <label className={`queue-row ${selectedPlayers.includes(entry.player_registration_id) ? 'selected' : ''}`} key={entry.id}><input type="checkbox" checked={selectedPlayers.includes(entry.player_registration_id)} onChange={() => toggleSelected(entry.player_registration_id)} /><span className="queue-number">{index + 1}</span><div><strong>{playerName(players, entry.player_registration_id)}</strong><span>Waiting {Math.max(0, Math.floor((Date.now() - new Date(entry.joined_at)) / 60000))} min</span></div><button type="button" onClick={(e) => { e.preventDefault(); removeFromQueue(entry.player_registration_id) }}><X size={15} /></button></label>)}</div>}<div className="match-builder"><select value={selectedCourt} onChange={(e) => setSelectedCourt(e.target.value)}><option value="">Select available court</option>{courts.filter((court) => court.status === 'available').map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select><button className="button button-primary" onClick={createMatch} disabled={selectedPlayers.length !== playersNeeded}><Swords size={16} /> Create match ({selectedPlayers.length}/{playersNeeded})</button><small>Selection order assigns Team 1, then Team 2.</small></div></section>
      <section className="profile-card"><h3><Play size={19} /> Matches</h3><div className="match-list">{activeGames.map((game) => <article className={`match-card ${game.status}`} key={game.id}><div className="match-card-title"><strong>Game {game.game_number} · {courts.find((court) => court.id === game.court_id)?.name || 'Court'}</strong><span className={`status-badge ${game.status}`}>{game.status}</span></div><div className="teams"><div><span>Team 1</span><strong>{participants(game, 1)}</strong></div><span>vs</span><div><span>Team 2</span><strong>{participants(game, 2)}</strong></div></div>{game.status === 'queued' ? <button className="button button-primary button-full" onClick={() => startGame(game)}><Play size={16} /> Start game</button> : <div className="score-entry"><input type="number" min="0" placeholder="Team 1" value={scores[game.id]?.one || ''} onChange={(e) => setScores({ ...scores, [game.id]: { ...scores[game.id], one: e.target.value } })} /><span>–</span><input type="number" min="0" placeholder="Team 2" value={scores[game.id]?.two || ''} onChange={(e) => setScores({ ...scores, [game.id]: { ...scores[game.id], two: e.target.value } })} /><button className="button button-primary" onClick={() => completeGame(game)}>Record result</button></div>}</article>)}{!activeGames.length && <p className="muted">No queued or active matches.</p>}</div></section>
    </div>
    <div className="game-day-grid">
      <section className="profile-card"><h3><Trophy size={19} /> Event standings</h3><div className="player-table-wrap"><table className="player-table"><thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th></tr></thead><tbody>{standings.map((player, index) => <tr key={player.id}><td>{index + 1}</td><td><strong>{player.full_name}</strong></td><td>{player.played}</td><td>{player.wins}</td><td>{player.losses}</td></tr>)}</tbody></table></div></section>
      <section className="profile-card"><h3><RotateCcw size={19} /> Recent results</h3><div className="result-list">{completedGames.slice(0, 8).map((game) => <div key={game.id}><strong>Game {game.game_number}: {game.team_one_score}–{game.team_two_score}</strong><span>{game.winner_team === 1 ? participants(game, 1) : participants(game, 2)} won</span></div>)}{!completedGames.length && <p className="muted">Results will appear after the first completed game.</p>}</div></section>
    </div>
  </section>
}

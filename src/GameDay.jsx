import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clock3, Play, Plus, RefreshCw, RotateCcw, Swords, Trophy, UserCheck, Users, X } from 'lucide-react'
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
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [completionPrompt, setCompletionPrompt] = useState(null)
  const [completingGame, setCompletingGame] = useState(false)
  const [substitutionPrompt, setSubstitutionPrompt] = useState(null)
  const [substitutePlayerId, setSubstitutePlayerId] = useState('')
  const [substituting, setSubstituting] = useState(false)
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

  useEffect(() => {
    if (!event.auto_assign_next_players || autoAssigning) return
    const court = courts.find((item) => item.status === 'available')
    if (!court || waiting.length < playersNeeded) return
    setAutoAssigning(true)
    createMatchFor(waiting.slice(0, playersNeeded).map((entry) => entry.player_registration_id), court.id, true).finally(() => setAutoAssigning(false))
  }, [event.auto_assign_next_players, courts, queue, playersNeeded, autoAssigning])

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

  function selectNextPlayers() {
    setSelectedPlayers(waiting.slice(0, playersNeeded).map((entry) => entry.player_registration_id))
  }

  async function createMatchFor(playerIds, courtId, automatic = false) {
    setMessage('')
    if (!courtId) { setMessage('Select an available court.'); return false }
    if (playerIds.length !== playersNeeded) { setMessage(`Select exactly ${playersNeeded} players.`); return false }
    const gameNumber = games.length ? Math.max(...games.map((game) => game.game_number)) + 1 : 1
    const { data: game, error } = await supabase.from('games').insert({ event_id: event.id, court_id: courtId, game_number: gameNumber, format: event.game_format, points_to_win: event.points_to_win }).select().single()
    if (error) { setMessage(error.message); return false }
    const participants = playerIds.map((playerId, index) => ({ game_id: game.id, player_registration_id: playerId, team_number: index < teamSize ? 1 : 2 }))
    const { data: inserted, error: playerError } = await supabase.from('game_players').insert(participants).select()
    if (playerError) { setMessage(playerError.message); return false }
    await Promise.all([
      supabase.from('event_courts').update({ status: 'in_use' }).eq('id', courtId),
      supabase.from('game_queue').update({ status: 'assigned' }).eq('event_id', event.id).in('player_registration_id', playerIds)
    ])
    setGames([game, ...games]); setGamePlayers([...gamePlayers, ...(inserted || [])])
    setCourts(courts.map((court) => court.id === courtId ? { ...court, status: 'in_use' } : court))
    setQueue(queue.map((entry) => playerIds.includes(entry.player_registration_id) ? { ...entry, status: 'assigned' } : entry))
    setSelectedPlayers([]); setSelectedCourt('')
    if (automatic) setMessage(`Game ${gameNumber} automatically assigned and ready to start.`)
    return true
  }

  async function createMatch() { await createMatchFor(selectedPlayers, selectedCourt) }

  async function startGame(game) {
    const { error } = await supabase.from('games').update({ status: 'playing', started_at: new Date().toISOString() }).eq('id', game.id)
    if (error) setMessage(error.message); else setGames(games.map((item) => item.id === game.id ? { ...item, status: 'playing', started_at: new Date().toISOString() } : item))
  }

  function availableSubstitutes(game) {
    const activePlayerIds = new Set(gamePlayers.filter((entry) => activeGames.some((item) => item.id === entry.game_id)).map((entry) => entry.player_registration_id))
    return checkedIn.filter((player) => !activePlayerIds.has(player.id) && !gamePlayers.some((entry) => entry.game_id === game.id && entry.player_registration_id === player.id))
  }

  function openSubstitution(game, slot) {
    setSubstitutePlayerId('')
    setSubstitutionPrompt({ game, slot })
  }

  async function confirmSubstitution() {
    if (!substitutionPrompt || !substitutePlayerId || substituting) return
    setSubstituting(true); setMessage('')
    const { game, slot } = substitutionPrompt
    const { error } = await supabase.rpc('substitute_game_player', {
      target_game_id: game.id,
      outgoing_player_id: slot.player_registration_id,
      incoming_player_id: substitutePlayerId
    })
    if (error) { setMessage(error.message); setSubstituting(false); return }
    const incomingName = playerName(players, substitutePlayerId)
    const outgoingName = playerName(players, slot.player_registration_id)
    await load()
    setMessage(`${incomingName} replaced ${outgoingName} in Game ${game.game_number}.`)
    setSubstituting(false); setSubstitutionPrompt(null); setSubstitutePlayerId('')
  }

  async function completeGame(game, scoreOverride) {
    const score = scoreOverride || scores[game.id] || { one: 0, two: 0 }
    const one = Number(score.one), two = Number(score.two)
    if (Math.max(one, two) < game.points_to_win) { setMessage(`A result cannot be recorded until one team reaches ${game.points_to_win} points.`); return false }
    if (one === two) { setMessage('The game cannot finish with a tied score.'); return false }
    const winner_team = one > two ? 1 : 2
    const completed_at = new Date().toISOString()
    const { error } = await supabase.from('games').update({ status: 'completed', team_one_score: one, team_two_score: two, winner_team, completed_at }).eq('id', game.id)
    if (error) { setMessage(error.message); return false }
    await supabase.from('event_courts').update({ status: 'available' }).eq('id', game.court_id)
    if (game.format === 'open_play') {
      const participantIds = gamePlayers.filter((entry) => entry.game_id === game.id).map((entry) => entry.player_registration_id)
      const queueEnd = waiting.length ? Math.max(...waiting.map((entry) => entry.position)) : 0
      const returnedAt = new Date().toISOString()
      await Promise.all(participantIds.map((playerId, index) => supabase.from('game_queue').update({ status: 'waiting', position: queueEnd + index + 1, joined_at: returnedAt }).eq('event_id', event.id).eq('player_registration_id', playerId)))
      setQueue(queue.map((entry) => { const index = participantIds.indexOf(entry.player_registration_id); return index >= 0 ? { ...entry, status: 'waiting', position: queueEnd + index + 1, joined_at: returnedAt } : entry }))
    }
    setGames(games.map((item) => item.id === game.id ? { ...item, status: 'completed', team_one_score: one, team_two_score: two, winner_team, completed_at } : item))
    setCourts(courts.map((court) => court.id === game.court_id ? { ...court, status: 'available' } : court))
    setMessage(game.format === 'open_play' ? `Game ${game.game_number} recorded. All four players returned to the back of the queue.` : `Game ${game.game_number} recorded. Players can be added back to the queue.`)
    return true
  }

  async function confirmGameCompletion() {
    if (!completionPrompt || completingGame) return
    setCompletingGame(true)
    const completed = await completeGame(completionPrompt.game, completionPrompt.score)
    setCompletingGame(false)
    if (completed) setCompletionPrompt(null)
  }

  function changeLiveScore(game, team, change) {
    const current = scores[game.id] || { one: 0, two: 0 }
    const key = team === 1 ? 'one' : 'two'
    const next = { ...current, [key]: Math.max(0, Number(current[key] || 0) + change) }
    setScores({ ...scores, [game.id]: next })
    const one = Number(next.one || 0), two = Number(next.two || 0)
    if (Math.max(one, two) >= game.points_to_win && one !== two) setCompletionPrompt({ game, score: next })
  }

  function participants(game, team) { return gamePlayers.filter((entry) => entry.game_id === game.id && entry.team_number === team).map((entry) => playerName(players, entry.player_registration_id)).join(' & ') }

  if (loading) return <section className="profile-card"><p>Loading game day…</p></section>
  return <section className="game-day-page">{completionPrompt && <div className="modal-backdrop"><section className="game-complete-dialog" role="dialog" aria-modal="true" aria-labelledby="complete-game-title"><span className="dialog-icon"><Trophy size={25} /></span><span className="eyebrow">Points to win reached</span><h2 id="complete-game-title">Complete Game {completionPrompt.game.game_number}?</h2><p className="muted">Please confirm the final score before closing the game.</p><div className="completion-score"><div><span>Team 1</span><strong>{completionPrompt.score.one}</strong><small>{participants(completionPrompt.game, 1)}</small></div><b>–</b><div><span>Team 2</span><strong>{completionPrompt.score.two}</strong><small>{participants(completionPrompt.game, 2)}</small></div></div><p className="completion-winner"><Trophy size={17} /> Team {Number(completionPrompt.score.one) > Number(completionPrompt.score.two) ? '1' : '2'} will be recorded as the winner.</p><div className="dialog-actions"><button className="button button-secondary" onClick={() => setCompletionPrompt(null)} disabled={completingGame}>Keep playing</button><button className="button button-primary" onClick={confirmGameCompletion} disabled={completingGame}><Check size={17} /> {completingGame ? 'Completing…' : 'Confirm result'}</button></div></section></div>}{substitutionPrompt && <div className="modal-backdrop"><section className="game-complete-dialog substitute-dialog" role="dialog" aria-modal="true" aria-labelledby="substitute-player-title"><span className="dialog-icon"><RefreshCw size={25} /></span><span className="eyebrow">Player substitution</span><h2 id="substitute-player-title">Replace {playerName(players, substitutionPrompt.slot.player_registration_id)}?</h2><p className="muted">The substitute takes the same team position. The current score will not change.</p><label>Substitute player<select value={substitutePlayerId} onChange={(e) => setSubstitutePlayerId(e.target.value)}><option value="">Select a checked-in player</option>{availableSubstitutes(substitutionPrompt.game).map((player) => <option key={player.id} value={player.id}>{player.full_name}</option>)}</select></label>{!availableSubstitutes(substitutionPrompt.game).length && <p className="form-message">No checked-in players are currently available.</p>}<div className="dialog-actions"><button className="button button-secondary" onClick={() => setSubstitutionPrompt(null)} disabled={substituting}>Cancel</button><button className="button button-primary" onClick={confirmSubstitution} disabled={!substitutePlayerId || substituting}><RefreshCw size={17} /> {substituting ? 'Substituting…' : 'Confirm substitution'}</button></div></section></div>}<div className="section-title"><div><span className="eyebrow"><Swords size={15} /> Game-day management</span><h2>{event.name}</h2></div><button className="button button-secondary" onClick={onBack}><ArrowLeft size={16} /> Event roster</button></div>
    {message && <div className="form-message game-message">{message}</div>}
    <div className="game-day-summary"><div><strong>{checkedIn.length}</strong><span>Checked in</span></div><div><strong>{waiting.length}</strong><span>Waiting</span></div><div><strong>{activeGames.length}</strong><span>Active games</span></div><div><strong>{completedGames.length}</strong><span>Completed</span></div></div>
    <div className="game-day-grid game-day-main">
      <section className="profile-card"><h3><Clock3 size={19} /> Waiting queue</h3>{!waiting.length ? <p className="muted">Checked-in players can be added to the queue.</p> : <div className="queue-list">{waiting.map((entry, index) => <label className={`queue-row ${selectedPlayers.includes(entry.player_registration_id) ? 'selected' : ''}`} key={entry.id}><input type="checkbox" checked={selectedPlayers.includes(entry.player_registration_id)} onChange={() => toggleSelected(entry.player_registration_id)} /><span className="queue-number">{index + 1}</span><div><strong>{playerName(players, entry.player_registration_id)}</strong><span>Waiting {Math.max(0, Math.floor((Date.now() - new Date(entry.joined_at)) / 60000))} min</span></div><button type="button" onClick={(e) => { e.preventDefault(); removeFromQueue(entry.player_registration_id) }}><X size={15} /></button></label>)}</div>}<div className="match-builder">{event.game_format === 'open_play' && <button className="button button-secondary" onClick={selectNextPlayers} disabled={waiting.length < 4}>Select next four players</button>}<select value={selectedCourt} onChange={(e) => setSelectedCourt(e.target.value)}><option value="">Select available court</option>{courts.filter((court) => court.status === 'available').map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select><button className="button button-primary" onClick={createMatch} disabled={selectedPlayers.length !== playersNeeded}><Swords size={16} /> Create match ({selectedPlayers.length}/{playersNeeded})</button><small>{event.game_format === 'open_play' ? 'Queue order assigns the first two to Team 1 and the next two to Team 2.' : 'Selection order assigns Team 1, then Team 2.'}</small></div></section>
      <section className="profile-card"><h3><Play size={19} /> Matches</h3><div className="match-list">{activeGames.map((game) => <article className={`match-card ${game.status}`} key={game.id}><div className="match-card-title"><strong>Game {game.game_number} · {courts.find((court) => court.id === game.court_id)?.name || 'Court'}</strong><span className={`status-badge ${game.status}`}>{game.status}</span></div><div className="teams"><div className="team-with-subs"><span>Team 1</span>{gamePlayers.filter((entry) => entry.game_id === game.id && entry.team_number === 1).map((slot) => <div className="participant-row" key={slot.id}><strong>{playerName(players, slot.player_registration_id)}</strong><button type="button" onClick={() => openSubstitution(game, slot)} aria-label={`Substitute ${playerName(players, slot.player_registration_id)}`} title="Substitute player"><RefreshCw size={14} /> Sub</button></div>)}</div><span>vs</span><div className="team-with-subs"><span>Team 2</span>{gamePlayers.filter((entry) => entry.game_id === game.id && entry.team_number === 2).map((slot) => <div className="participant-row" key={slot.id}><strong>{playerName(players, slot.player_registration_id)}</strong><button type="button" onClick={() => openSubstitution(game, slot)} aria-label={`Substitute ${playerName(players, slot.player_registration_id)}`} title="Substitute player"><RefreshCw size={14} /> Sub</button></div>)}</div></div>{game.status === 'queued' ? <button className="button button-primary button-full" onClick={() => startGame(game)}><Play size={16} /> Start game</button> : <div className="live-score"><div><span>Team 1</span><div className="score-control"><button onClick={() => changeLiveScore(game, 1, -1)} aria-label="Subtract Team 1 point">−</button><strong>{scores[game.id]?.one || 0}</strong><button onClick={() => changeLiveScore(game, 1, 1)} aria-label="Add Team 1 point">+</button></div></div><b>First to {game.points_to_win}</b><div><span>Team 2</span><div className="score-control"><button onClick={() => changeLiveScore(game, 2, -1)} aria-label="Subtract Team 2 point">−</button><strong>{scores[game.id]?.two || 0}</strong><button onClick={() => changeLiveScore(game, 2, 1)} aria-label="Add Team 2 point">+</button></div></div></div>}</article>)}{!activeGames.length && <p className="muted">No queued or active matches.</p>}</div></section>
    </div>
    <div className="game-day-grid">
      <details className="profile-card game-settings" open={courts.length === 0 ? true : undefined}><summary>Game settings & courts</summary><div className="settings-content"><div className="form-row"><label>Format<select value={event.game_format || 'doubles'} onChange={(e) => updateEventSettings('game_format', e.target.value)}><option value="open_play">Open Play</option><option value="singles">Singles</option><option value="doubles">Doubles</option><option value="mixed_doubles">Mixed doubles</option></select></label><label>Points to win<input type="number" min="1" max="99" value={event.points_to_win || 11} onChange={(e) => updateEventSettings('points_to_win', e.target.value)} /></label></div><label className="auto-assign-toggle"><input type="checkbox" checked={Boolean(event.auto_assign_next_players)} onChange={(e) => updateEventSettings('auto_assign_next_players', e.target.checked)} /><span><strong>Auto-assign next players</strong><small>Automatically create the next match when enough players and a court are available.</small></span></label>{event.game_format === 'open_play' && <div className="open-play-note"><strong>Four on, four off</strong><span>The next four waiting players take the court. After the result, all four return to the back of the queue.</span></div>}<h3 className="subheading">Courts</h3><form className="court-form" onSubmit={addCourt}><input required placeholder="Court name or number" value={courtName} onChange={(e) => setCourtName(e.target.value)} /><button className="button button-primary"><Plus size={16} /> Add</button></form><div className="court-list">{courts.map((court) => <button key={court.id} className={`court-chip ${court.status}`} disabled={court.status === 'in_use'} onClick={() => toggleCourt(court)}>{court.name}<span>{court.status.replace('_', ' ')}</span></button>)}{!courts.length && <p className="muted">Add at least one court to create matches.</p>}</div></div></details>
      <section className="profile-card"><h3><UserCheck size={19} /> Player check-in</h3><div className="checkin-list">{players.map((player) => { const queued = queue.find((entry) => entry.player_registration_id === player.id)?.status === 'waiting'; return <div className="checkin-row" key={player.id}><div><strong>{player.full_name}</strong><span className="capitalize">{player.skill_level}</span></div><div className="checkin-actions"><button className={`small-action ${player.checked_in_at ? 'checked' : ''}`} onClick={() => toggleCheckIn(player)}>{player.checked_in_at ? <><Check size={15} /> Present</> : 'Check in'}</button>{player.checked_in_at && <button className="small-action" onClick={() => queued ? removeFromQueue(player.id) : addToQueue(player.id)}>{queued ? 'Leave queue' : 'Join queue'}</button>}</div></div>})}</div></section>
    </div>
    <div className="game-day-grid">
      <section className="profile-card"><h3><Trophy size={19} /> Event standings</h3><div className="player-table-wrap"><table className="player-table"><thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th></tr></thead><tbody>{standings.map((player, index) => <tr key={player.id}><td>{index + 1}</td><td><strong>{player.full_name}</strong></td><td>{player.played}</td><td>{player.wins}</td><td>{player.losses}</td></tr>)}</tbody></table></div></section>
      <section className="profile-card"><h3><RotateCcw size={19} /> Recent results</h3><div className="result-list">{completedGames.slice(0, 8).map((game) => <div key={game.id}><strong>Game {game.game_number}: {game.team_one_score}–{game.team_two_score}</strong><span>{game.winner_team === 1 ? participants(game, 1) : participants(game, 2)} won</span></div>)}{!completedGames.length && <p className="muted">Results will appear after the first completed game.</p>}</div></section>
    </div>
  </section>
}

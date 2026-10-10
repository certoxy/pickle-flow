import { useCallback, useEffect, useState } from "react";
import { Clock3, Trophy, Users } from "lucide-react";
import { supabase } from "./lib/supabase";

const names = (list = []) => list.join(" · ");

export default function MatchBoard({ token }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(new Date());

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_event_display_view", { p_token: token });
    if (loadError) setError(loadError.message);
    else { setBoard(data); setError(""); }
  }, [token]);

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, 2500);
    const tick = window.setInterval(() => setClock(new Date()), 1000);
    return () => { window.clearInterval(refresh); window.clearInterval(tick); };
  }, [load]);

  if (error) return <main className="tv-board tv-board-empty"><h1>Match Board unavailable</h1><p>{error}</p></main>;
  if (!board) return <main className="tv-board tv-board-empty"><p>Loading Match Board…</p></main>;

  return <main className="tv-board">
    <header className="tv-header">
      <div><span className="tv-live-dot" /> LIVE MATCH BOARD</div>
      <section><h1>{board.event_name}</h1><p>{board.venue || "PickleFlow Game Day"}</p></section>
      <time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </header>
    <section className="tv-courts">
      {board.courts.map((court) => <article className={`tv-court ${court.game ? "playing" : "idle"}`} key={court.id}>
        <header><h2>{court.name}</h2><span>{court.game ? `GAME ${court.game.game_number}` : "AVAILABLE"}</span></header>
        {court.game ? <>
          <div className="tv-score">
            <div><strong>{court.game.team_one_score}</strong><span>{names(court.game.team_one)}</span></div>
            <b>–</b>
            <div><strong>{court.game.team_two_score}</strong><span>{names(court.game.team_two)}</span></div>
          </div>
        </> : <div className="tv-no-game"><Clock3 /><span>Waiting for players</span></div>}
        <footer><span>NEXT</span>{court.next_game ? <strong>Game {court.next_game.game_number}: {names(court.next_game.team_one)} vs {names(court.next_game.team_two)}</strong> : <strong>No match queued</strong>}</footer>
      </article>)}
      {!board.courts.length && <div className="tv-no-courts">No active courts</div>}
    </section>
    <section className="tv-lower">
      <article className="tv-queue"><h2><Users /> Player Queue <span>{board.waiting.length}</span></h2><div>{board.waiting.length ? board.waiting.slice(0, 12).map((player) => <span key={`${player.position}-${player.name}`}><b>{player.position}</b>{player.name}</span>) : <p>No players waiting</p>}</div></article>
      <article className="tv-winners"><h2><Trophy /> Recent Winners</h2><div>{board.recent_games.length ? board.recent_games.map((game) => <span key={game.game_number}><b>Game {game.game_number} · {game.court_name}</b><strong>{names(game.winners)}</strong><em>{game.team_one_score}–{game.team_two_score}</em></span>) : <p>Completed games will appear here</p>}</div></article>
    </section>
    <footer className="tv-footer"><img src="/brand/pickleflow-logo.png" alt="PickleFlow" /><span>Scores update automatically</span></footer>
  </main>;
}

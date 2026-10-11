import { useCallback, useEffect, useState } from "react";
import { Clock3, Minus, Plus, RefreshCw, Trophy } from "lucide-react";
import { supabase } from "./lib/supabase";

export default function CourtScoring({ token }) {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase.rpc("get_court_scoring_view", {
      p_token: token,
    });
    if (error) setMessage(error.message);
    else {
      setView(data);
      setMessage("");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function changeScore(team, delta) {
    if (!view?.game || saving) return;
    const game = view.game;
    const one = Math.max(0, Number(game.team_one_score) + (team === 1 ? delta : 0));
    const two = Math.max(0, Number(game.team_two_score) + (team === 2 ? delta : 0));
    setView({ ...view, game: { ...game, team_one_score: one, team_two_score: two } });
    setSaving(true);
    const { error } = await supabase.rpc("update_court_score", {
      p_token: token,
      p_game_id: game.id,
      p_team_one_score: one,
      p_team_two_score: two,
    });
    if (error) {
      setMessage(error.message);
      await load(true);
    }
    setSaving(false);
  }

  if (loading) return <main className="court-scoring-page"><p>Loading court…</p></main>;
  if (!view) return <main className="court-scoring-page"><section className="scorer-empty"><h1>Scoring link unavailable</h1><p>{message}</p></section></main>;
  const reached = view.game && Math.max(view.game.team_one_score, view.game.team_two_score) >= view.game.points_to_win && view.game.team_one_score !== view.game.team_two_score;

  return (
    <main className="court-scoring-page">
      <header className="scorer-header">
        <img src="/brand/pickleflow-logo.png" alt="PickleFlow" />
        <div><span>{view.event_name}</span><strong>{view.court_name}</strong></div>
      </header>
      {message && <div className="form-message error">{message}</div>}
      {view.game ? (
        <section className="scorer-card">
          <span className="eyebrow">Live · Game {view.game.game_number}</span>
          <h1>First to {view.game.points_to_win}</h1>
          <div className="scorer-teams">
            {[1, 2].map((team) => {
              const score = team === 1 ? view.game.team_one_score : view.game.team_two_score;
              const names = team === 1 ? view.game.team_one : view.game.team_two;
              return <article key={team}>
                <span>Team {team}</span>
                <h2>{names.join(" & ")}</h2>
                <strong>{score}</strong>
                <div className="scorer-controls">
                  <button onClick={() => changeScore(team, -1)} disabled={saving || score === 0} aria-label={`Subtract Team ${team} point`}><Minus /></button>
                  <button onClick={() => changeScore(team, 1)} disabled={saving} aria-label={`Add Team ${team} point`}><Plus /></button>
                </div>
              </article>;
            })}
          </div>
          {reached && <div className="scorer-winner"><Trophy size={20} /><span><strong>Points to win reached.</strong> The organizer must confirm the final result.</span></div>}
        </section>
      ) : (
        <section className="scorer-empty"><Clock3 /><h1>Waiting for a match</h1><p>This screen will update when the organizer starts a game on {view.court_name}.</p><button className="button button-secondary" onClick={() => load()}><RefreshCw size={17} /> Refresh</button></section>
      )}
      {view.next_game && <p className="scorer-next">Next: Game {view.next_game.game_number}</p>}
      <p className="scorer-note">Score changes appear live on the organizer’s Match Board.</p>
    </main>
  );
}

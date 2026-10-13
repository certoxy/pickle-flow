import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Heart, Minus, Plus, RefreshCw, Trophy, Wifi, WifiOff } from "lucide-react";
import { supabase } from "./lib/supabase";
import {
  acknowledgePendingScore,
  cacheCourtView,
  getCachedCourtView,
  pendingScoreForCourt,
  savePendingScore,
} from "./lib/offlineScores";

export default function CourtScoring({ token }) {
  const cached = getCachedCourtView(token);
  const [view, setView] = useState(cached);
  const [loading, setLoading] = useState(!cached);
  const [message, setMessage] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncState, setSyncState] = useState(
    pendingScoreForCourt(token, cached?.game?.id) ? "pending" : "synced",
  );
  const [pendingCount, setPendingCount] = useState(
    pendingScoreForCourt(token, cached?.game?.id) ? 1 : 0,
  );
  const syncTimer = useRef(null);
  const flushing = useRef(false);
  const activeGameId = view?.game?.id;
  const hasActiveGame = Boolean(activeGameId);

  const applyPendingScore = useCallback((data) => {
    if (!data?.game) return data;
    const pending = pendingScoreForCourt(token, data.game.id);
    return pending
      ? {
          ...data,
          game: {
            ...data.game,
            team_one_score: pending.one,
            team_two_score: pending.two,
          },
        }
      : data;
  }, [token]);

  const load = useCallback(async (quiet = false) => {
    if (!navigator.onLine) {
      const local = applyPendingScore(getCachedCourtView(token));
      if (local) setView(local);
      setIsOnline(false);
      setSyncState("pending");
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    const { data, error } = await supabase.rpc("get_court_scoring_view", {
      p_token: token,
    });
    if (error) {
      const local = applyPendingScore(getCachedCourtView(token));
      if (local) setView(local);
      setMessage(error.message);
    } else {
      cacheCourtView(token, data);
      setView(applyPendingScore(data));
      setMessage("");
    }
    setLoading(false);
  }, [applyPendingScore, token]);

  const flushPending = useCallback(async () => {
    if (!navigator.onLine || flushing.current) return false;
    flushing.current = true;
    setSyncState("syncing");
    let success = true;
    try {
      let pending = activeGameId
        ? pendingScoreForCourt(token, activeGameId)
        : null;
      while (pending && navigator.onLine) {
        const { error } = await supabase.rpc("update_court_score", {
          p_token: token,
          p_game_id: pending.gameId,
          p_team_one_score: pending.one,
          p_team_two_score: pending.two,
        });
        if (error) {
          success = false;
          setMessage(`Score saved on this device and will retry: ${error.message}`);
          setSyncState("error");
          break;
        }
        acknowledgePendingScore(pending);
        pending = pendingScoreForCourt(token, pending.gameId);
      }
      setPendingCount(pending ? 1 : 0);
      if (!pending) {
        setSyncState("synced");
        setMessage("");
      }
    } finally {
      flushing.current = false;
    }
    return success;
  }, [activeGameId, token]);

  useEffect(() => {
    let timer;
    let stopped = false;
    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || document.hidden || !navigator.onLine) return;
      timer = window.setTimeout(async () => {
        await load(true);
        schedule();
      }, hasActiveGame ? 15000 : 30000);
    };
    const resume = () => {
      if (!document.hidden) load(true).finally(schedule);
      else window.clearTimeout(timer);
    };
    load().finally(schedule);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [hasActiveGame, load]);

  useEffect(() => {
    const goOffline = () => {
      setIsOnline(false);
      setSyncState("pending");
    };
    const goOnline = async () => {
      setIsOnline(true);
      await flushPending();
      await load(true);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (navigator.onLine) flushPending();
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.clearTimeout(syncTimer.current);
    };
  }, [flushPending, load]);

  function changeScore(team, delta) {
    if (!view?.game) return;
    setView((currentView) => {
      if (!currentView?.game) return currentView;
      const game = currentView.game;
      const one = Math.max(0, Number(game.team_one_score) + (team === 1 ? delta : 0));
      const two = Math.max(0, Number(game.team_two_score) + (team === 2 ? delta : 0));
      const nextView = { ...currentView, game: { ...game, team_one_score: one, team_two_score: two } };
      cacheCourtView(token, nextView);
      savePendingScore({ mode: "court", token, gameId: game.id, one, two });
      setPendingCount(1);
      setIsOnline(navigator.onLine);
      setSyncState(navigator.onLine ? "syncing" : "pending");
      window.clearTimeout(syncTimer.current);
      if (navigator.onLine)
        syncTimer.current = window.setTimeout(() => flushPending(), 350);
      return nextView;
    });
  }

  if (loading) return <main className="court-scoring-page"><p>Loading court…</p></main>;
  if (!view) return <main className="court-scoring-page"><section className="scorer-empty"><h1>Scoring link unavailable</h1><p>{message || "Connect to the internet once to open this scoring link."}</p></section></main>;
  const reached = view.game && Math.max(view.game.team_one_score, view.game.team_two_score) >= view.game.points_to_win && view.game.team_one_score !== view.game.team_two_score;

  return (
    <main className="court-scoring-page">
      <header className="scorer-header">
        <img src="/brand/pickleflow-logo.png" alt="PickleFlow" />
        <div className="scorer-header-actions">
          <div><span>{view.event_name}</span><strong>{view.court_name}</strong></div>
          <a href="/suggest" target="_blank" rel="noreferrer">Suggest</a>
          <a href="/donate" target="_blank" rel="noreferrer"><Heart size={15} /> Donate</a>
        </div>
      </header>
      <div className={`score-sync-status ${!isOnline ? "offline" : syncState}`} role="status">
        {!isOnline ? <WifiOff size={17} /> : <Wifi size={17} />}
        <span>{!isOnline
          ? `Offline · ${pendingCount ? "score saved on this device" : "ready to score"}`
          : syncState === "syncing" ? "Syncing score…"
            : syncState === "error" ? "Score saved · waiting to retry"
              : "Online · Score synced"}</span>
      </div>
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
                  <button onClick={() => changeScore(team, -1)} disabled={score === 0} aria-label={`Subtract Team ${team} point`}><Minus /></button>
                  <button onClick={() => changeScore(team, 1)} aria-label={`Add Team ${team} point`}><Plus /></button>
                </div>
              </article>;
            })}
          </div>
          {reached && <div className="scorer-winner"><Trophy size={20} /><span><strong>Points to win reached.</strong> The organizer must confirm the final result while online.</span></div>}
        </section>
      ) : (
        <section className="scorer-empty"><Clock3 /><h1>Waiting for a match</h1><p>This screen will update when the organizer starts a game on {view.court_name}.</p><button className="button button-secondary" onClick={() => load()}><RefreshCw size={17} /> Refresh</button></section>
      )}
      {view.next_game && <p className="scorer-next">Next: Game {view.next_game.game_number}</p>}
      <p className="scorer-note">Scores are saved on this device during a temporary connection loss and sync automatically when online.</p>
    </main>
  );
}

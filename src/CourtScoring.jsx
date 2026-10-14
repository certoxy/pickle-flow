import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleDot, Clock3, Heart, HelpCircle, Lock, Minus, Plus, Radio, RefreshCw, Trophy, Wifi, WifiOff } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "./lib/supabase";
import {
  acknowledgePendingScore,
  cacheCourtView,
  getCachedCourtView,
  pendingScoreForCourt,
  savePendingScore,
} from "./lib/offlineScores";
import { createOfflineScorerSync, createScorerDirectSync } from "./lib/directScoreSync";
import ContextualTour from "./ContextualTour";

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
  const [directState, setDirectState] = useState("pairing");
  const [offlineAnswer, setOfflineAnswer] = useState("");
  const [offlineError, setOfflineError] = useState("");
  const [offlineOfferInput, setOfflineOfferInput] = useState("");
  const [acceptingOfflineOffer, setAcceptingOfflineOffer] = useState(false);
  const [servingTeam, setServingTeam] = useState(1);
  const [serveNumber, setServeNumber] = useState(1);
  const [showPageTour, setShowPageTour] = useState(false);
  const syncTimer = useRef(null);
  const flushing = useRef(false);
  const directSync = useRef(null);
  const offlineSync = useRef(null);
  const initializedServiceGame = useRef(null);
  const activeGameId = view?.game?.id;
  const hasActiveGame = Boolean(activeGameId);
  useEffect(() => {
    if (!window.localStorage.getItem("pickleflow-tour-scoring")) setShowPageTour(true);
  }, []);

  function acknowledgeDirectScore(ack) {
    const pending = pendingScoreForCourt(token, ack.gameId);
    if (
      pending &&
      Number(pending.one) === Number(ack.one) &&
      Number(pending.two) === Number(ack.two)
    ) {
      acknowledgePendingScore(pending);
      setPendingCount(0);
    }
  }

  async function acceptOfflineOffer(offer) {
    if (!offer?.trim() || acceptingOfflineOffer) return;
    setAcceptingOfflineOffer(true);
    setOfflineError("");
    directSync.current?.close();
    directSync.current = null;
    offlineSync.current?.close();
    offlineSync.current = createOfflineScorerSync({
      onStatus: setDirectState,
      onAck: acknowledgeDirectScore,
      onView: (nextView) => {
        cacheCourtView(token, nextView);
        setView(applyPendingScore(nextView));
        setLoading(false);
        setMessage("");
      },
    });
    try {
      setDirectState("pairing");
      const answer = await offlineSync.current.acceptOffer(offer.trim());
      setOfflineAnswer(`pickleflow-answer:${answer}`);
      setOfflineOfferInput("");
    } catch (error) {
      setOfflineError(error.message);
    } finally {
      setAcceptingOfflineOffer(false);
    }
  }

  useEffect(() => {
    if (!activeGameId) return;
    const saved = window.localStorage.getItem(`pickleflow-serving-${activeGameId}`);
    const persisted = view?.game?.serving_team && view?.game?.serve_number
      ? `${view.game.serving_team}:${view.game.serve_number}`
      : saved || "1:1";
    const [team, serve] = String(persisted).split(":").map(Number);
    setServingTeam(team === 2 ? 2 : 1);
    setServeNumber(serve === 2 ? 2 : 1);
    if (navigator.onLine && initializedServiceGame.current !== activeGameId) {
      initializedServiceGame.current = activeGameId;
      saveServingState(team === 2 ? 2 : 1, serve === 2 ? 2 : 1);
    }
  }, [activeGameId, view?.game?.serving_team, view?.game?.serve_number]);

  async function saveServingState(team, serve) {
    if (!activeGameId || !navigator.onLine) return;
    const { error } = await supabase.rpc("update_court_service", {
      p_token: token,
      p_game_id: activeGameId,
      p_serving_team: team,
      p_serve_number: serve,
    });
    if (error) setMessage(`Serving indicator could not sync: ${error.message}`);
  }

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
    const offer = new URLSearchParams(window.location.search).get("offlineOffer");
    if (offer) {
      acceptOfflineOffer(offer);
    } else {
      directSync.current = createScorerDirectSync({
        token,
        onStatus: setDirectState,
        onAck: acknowledgeDirectScore,
      });
    }
    return () => {
      directSync.current?.close();
      directSync.current = null;
      offlineSync.current?.close();
      offlineSync.current = null;
    };
  }, [token]);

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
    if (delta > 0 && team !== servingTeam) return;
    setView((currentView) => {
      if (!currentView?.game) return currentView;
      const game = currentView.game;
      const one = Math.max(0, Number(game.team_one_score) + (team === 1 ? delta : 0));
      const two = Math.max(0, Number(game.team_two_score) + (team === 2 ? delta : 0));
      const nextView = { ...currentView, game: { ...game, team_one_score: one, team_two_score: two } };
      cacheCourtView(token, nextView);
      savePendingScore({ mode: "court", token, gameId: game.id, one, two });
      directSync.current?.sendScore({ gameId: game.id, one, two });
      offlineSync.current?.sendScore({ gameId: game.id, one, two });
      setPendingCount(1);
      setIsOnline(navigator.onLine);
      setSyncState(navigator.onLine ? "syncing" : "pending");
      window.clearTimeout(syncTimer.current);
      if (navigator.onLine)
        syncTimer.current = window.setTimeout(() => flushPending(), 350);
      return nextView;
    });
  }

  function changeServingTeam(team) {
    if (!activeGameId) return;
    setServingTeam(team);
    setServeNumber(1);
    window.localStorage.setItem(`pickleflow-serving-${activeGameId}`, `${team}:1`);
    saveServingState(team, 1);
  }

  function advanceServe() {
    if (!activeGameId) return;
    const nextTeam = serveNumber === 1 ? servingTeam : servingTeam === 1 ? 2 : 1;
    const nextServe = serveNumber === 1 ? 2 : 1;
    setServingTeam(nextTeam);
    setServeNumber(nextServe);
    window.localStorage.setItem(`pickleflow-serving-${activeGameId}`, `${nextTeam}:${nextServe}`);
    saveServingState(nextTeam, nextServe);
  }

  async function copyOfflineAnswer() {
    try {
      await navigator.clipboard.writeText(offlineAnswer);
      setMessage("Response code copied. Paste it into the organizer’s Step 2 field.");
    } catch {
      setMessage("Select and copy the response code below.");
    }
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
          <button className="scorer-help-button" type="button" onClick={() => setShowPageTour(true)}><HelpCircle size={16} /> Guide</button>
          <a href="/suggest" target="_blank" rel="noreferrer">Suggest</a>
          <a href="/donate" target="_blank" rel="noreferrer"><Heart size={15} /> Donate</a>
        </div>
      </header>
      <div className={`score-sync-status ${!isOnline ? "offline" : syncState}`} data-tour="score-sync" role="status">
        {!isOnline ? <WifiOff size={17} /> : <Wifi size={17} />}
        <span>{!isOnline
          ? `Offline · ${pendingCount ? "score saved on this device" : "ready to score"}`
          : syncState === "syncing" ? "Syncing score…"
            : syncState === "error" ? "Score saved · waiting to retry"
              : "Online · Score synced"}</span>
      </div>
      <div className={`direct-score-status ${directState}`} role="status">
        <Radio size={17} />
        <span>{directState === "connected" ? "Direct to organizer · Connected" : directState === "answer-ready" ? "Response ready · complete Step 2 on the organizer" : directState === "connecting" ? "Connecting directly to organizer…" : directState === "unsupported" ? "Direct sync is not supported on this browser" : directState === "error" ? "Direct sync unavailable · check the code and local network" : "Pairing directly with organizer…"}</span>
      </div>
      {directState !== "connected" && !offlineAnswer && <details className="offline-manual-pairing">
        <summary>Pair fully offline with an organizer code</summary>
        <p>Paste the <strong>organizer offer code</strong> here. This device will then create a response code for the organizer.</p>
        <textarea value={offlineOfferInput} onChange={(event) => setOfflineOfferInput(event.target.value)} placeholder="pickleflow-offer:…" />
        <button type="button" className="button button-primary" disabled={!offlineOfferInput.trim() || acceptingOfflineOffer} onClick={() => acceptOfflineOffer(offlineOfferInput)}>{acceptingOfflineOffer ? "Creating response…" : "Accept organizer code"}</button>
      </details>}
      {offlineError && <div className="form-message error">Offline pairing failed: {offlineError}</div>}
      {message && <div className="form-message error">{message}</div>}
      {view.game ? (
        <section className="scorer-card">
          <span className="eyebrow">Live · Game {view.game.game_number}</span>
          <h1>First to {view.game.points_to_win}</h1>
          <button type="button" data-tour="serve-control" className={`serve-guide team-${servingTeam}`} onClick={advanceServe} aria-label={`Team ${servingTeam}, serve ${serveNumber}. Advance serve.`}>
            <span className="serve-arrows" aria-hidden="true">
              {servingTeam === 1
                ? serveNumber === 1 ? <ChevronLeft /> : <ChevronsLeft />
                : serveNumber === 1 ? <ChevronRight /> : <ChevronsRight />}
            </span>
            <span><strong>Team {servingTeam} · Serve {serveNumber}</strong><small>Tap after a side-out</small></span>
          </button>
          <div className="scorer-teams" data-tour="score-controls">
            {[1, 2].map((team) => {
              const score = team === 1 ? view.game.team_one_score : view.game.team_two_score;
              const names = team === 1 ? view.game.team_one : view.game.team_two;
              const isServing = servingTeam === team;
              return <article key={team} className={isServing ? "serving" : "receiving"}>
                <button type="button" className="serve-toggle" onClick={() => changeServingTeam(team)} aria-pressed={isServing}>
                  {isServing ? <><CircleDot size={15} /> Serving · {serveNumber}</> : <>Start serve</>}
                </button>
                <span>Team {team}</span>
                <h2>{names.join(" & ")}</h2>
                <strong>{score}</strong>
                <div className="scorer-controls">
                  <button onClick={() => changeScore(team, -1)} disabled={score === 0} aria-label={`Subtract Team ${team} point`}><Minus /></button>
                  <button onClick={() => changeScore(team, 1)} disabled={!isServing} aria-label={isServing ? `Add Team ${team} point` : `Team ${team} is not serving`} title={isServing ? "Add point" : "Only the serving team can score"}>{isServing ? <Plus /> : <Lock />}</button>
                </div>
              </article>;
            })}
          </div>
          {reached && <div className="scorer-winner"><Trophy size={20} /><span><strong>Points to win reached.</strong> The organizer must confirm the final result while online.</span></div>}
        </section>
      ) : (
        <section className="scorer-empty"><Clock3 /><h1>Waiting for a match</h1><p>This screen will update when the organizer starts a game on {view.court_name}.</p><button className="button button-secondary" onClick={() => load()}><RefreshCw size={17} /> Refresh</button></section>
      )}
      <ContextualTour open={showPageTour} onClose={() => setShowPageTour(false)} storageKey="pickleflow-tour-scoring" steps={[
        { selector: '[data-tour="score-sync"]', title: "Check the connection", text: "Green and Online means score changes are reaching the organizer and Match Board. Offline changes stay safely on this phone until internet returns." },
        { selector: '[data-tour="serve-control"]', title: "Change the serve", text: "This shows the serving team and Serve 1 or Serve 2. Tap it after a side-out to move to the next serve." },
        { selector: '[data-tour="score-controls"]', title: "Update the score", text: "Only the serving team can add a point. Use minus if you need to correct the last score." },
      ]} />
      {offlineAnswer && directState !== "connected" && <section className="offline-response-card">
        <span className="eyebrow">Offline pairing · Step 2</span>
        <h2>Scan this response on the organizer device</h2>
        <QRCodeCanvas value={offlineAnswer} size={270} level="L" marginSize={2} />
        <p>Keep this page open. The connection status will update automatically.</p>
        <details><summary>Response code fallback</summary><textarea readOnly value={offlineAnswer} onFocus={(event) => event.target.select()} /><button type="button" className="button button-secondary" onClick={copyOfflineAnswer}>Copy response code</button></details>
      </section>}
      {view.next_game && <p className="scorer-next">Next: Game {view.next_game.game_number}</p>}
      <p className="scorer-note">Scores are saved on this device during a temporary connection loss and sync automatically when online.</p>
    </main>
  );
}

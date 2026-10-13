import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Heart, Trophy, Users, Volume2, VolumeX } from "lucide-react";
import { supabase } from "./lib/supabase";

const names = (list = []) => list.join(" · ");

export default function MatchBoard({ token }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(new Date());
  const [announcementsEnabled, setAnnouncementsEnabled] = useState(false);
  const boardRef = useRef(null);
  const announcementsRef = useRef(false);

  function speak(message) {
    if (!announcementsRef.current || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(message);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang === "en-PH") || voices.find((voice) => voice.lang.startsWith("en")) || null;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }

  function announceChanges(previous, next) {
    if (!previous) return;
    next.courts.forEach((court) => {
      const before = previous.courts.find((item) => item.id === court.id);
      if (court.game && before?.game?.id !== court.game.id)
        speak(`Now playing on ${court.name}. Game ${court.game.game_number}. ${names(court.game.team_one)}, versus ${names(court.game.team_two)}.`);
      if (court.next_game && before?.next_game?.game_number !== court.next_game.game_number)
        speak(`Next match on ${court.name}. Game ${court.next_game.game_number}. ${names(court.next_game.team_one)}, versus ${names(court.next_game.team_two)}. Please get ready.`);
    });
    if (next.next_match && previous.next_match?.game_number !== next.next_match.game_number)
      speak(`Next match. Game ${next.next_match.game_number}. ${names(next.next_match.team_one)}, versus ${names(next.next_match.team_two)}. Court assignment is pending.`);
    const previousGames = new Set(previous.recent_games.map((game) => game.game_number));
    [...next.recent_games].reverse().forEach((game) => {
      if (!previousGames.has(game.game_number))
        speak(`Game ${game.game_number} is complete on ${game.court_name}. Final score, ${game.team_one_score} to ${game.team_two_score}. Congratulations to ${names(game.winners)}.`);
    });
  }

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("get_event_display_view", { p_token: token });
    if (loadError) setError(loadError.message);
    else {
      if (announcementsRef.current) announceChanges(boardRef.current, data);
      boardRef.current = data;
      setBoard(data);
      setError("");
    }
  }, [token]);

  useEffect(() => {
    let refresh;
    let stopped = false;
    const schedule = () => {
      window.clearTimeout(refresh);
      if (stopped || document.hidden) return;
      const hasActiveGame = boardRef.current?.courts?.some((court) => court.game);
      refresh = window.setTimeout(async () => {
        await load();
        schedule();
      }, hasActiveGame ? 10000 : 30000);
    };
    const resume = () => {
      if (!document.hidden) load().finally(schedule);
      else window.clearTimeout(refresh);
    };
    load().finally(schedule);
    document.addEventListener("visibilitychange", resume);
    const tick = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      stopped = true;
      window.clearTimeout(refresh);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [load]);

  function toggleAnnouncements() {
    if (!("speechSynthesis" in window)) return setError("Voice announcements are not supported by this browser.");
    const next = !announcementsRef.current;
    announcementsRef.current = next;
    setAnnouncementsEnabled(next);
    window.speechSynthesis.cancel();
    if (next) {
      const welcome = new SpeechSynthesisUtterance("PickleFlow voice announcements are now enabled.");
      welcome.rate = 0.92;
      window.speechSynthesis.speak(welcome);
    }
  }

  if (error) return <main className="tv-board tv-board-empty"><h1>Match Board unavailable</h1><p>{error}</p></main>;
  if (!board) return <main className="tv-board tv-board-empty"><p>Loading Match Board…</p></main>;

  return <main className="tv-board">
    <header className="tv-header">
      <div><span className="tv-live-dot" /> LIVE MATCH BOARD</div>
      <section><h1>{board.event_name}</h1><p>{board.venue || "PickleFlow Game Day"}</p></section>
      <aside><time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div className="tv-header-actions"><a href="/suggest" target="_blank" rel="noreferrer">Suggest</a><a href="/donate" target="_blank" rel="noreferrer"><Heart /><span>Donate</span></a><button className={announcementsEnabled ? "enabled" : ""} onClick={toggleAnnouncements}>{announcementsEnabled ? <Volume2 /> : <VolumeX />}<span>{announcementsEnabled ? "Voice on" : "Enable voice"}</span></button></div></aside>
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
    {board.next_match && <section className="tv-next-match">
      <div><Clock3 /><span>UP NEXT · COURT PENDING</span></div>
      <strong>Game {board.next_match.game_number}</strong>
      <p>{names(board.next_match.team_one)} <b>vs</b> {names(board.next_match.team_two)}</p>
    </section>}
    <section className="tv-lower">
      <article className="tv-queue"><h2><Users /> Player Queue <span>{board.waiting.length}</span></h2><div>{board.waiting.length ? board.waiting.slice(0, 12).map((player) => <span key={`${player.position}-${player.name}`}><b>{player.position}</b>{player.name}</span>) : <p>No players waiting</p>}</div></article>
      <article className="tv-winners"><h2><Trophy /> Recent Winners</h2><div>{board.recent_games.length ? board.recent_games.map((game) => <span key={game.game_number}><b>Game {game.game_number} · {game.court_name}</b><strong>{names(game.winners)}</strong><em>{game.team_one_score}–{game.team_two_score}</em></span>) : <p>Completed games will appear here</p>}</div></article>
    </section>
    <footer className="tv-footer"><img src="/brand/pickleflow-logo.png" alt="PickleFlow" /><span>Scores update automatically</span></footer>
  </main>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  Clock3,
  Copy,
  Crown,
  Download,
  Edit3,
  ExternalLink,
  Flag,
  HelpCircle,
  Link,
  MonitorUp,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Settings2,
  Swords,
  Trophy,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import QrScanner from "./QrScanner";
import ContextualTour from "./ContextualTour";
import { supabase } from "./lib/supabase";
import {
  acknowledgePendingScore,
  pendingScoresForEvent,
  savePendingScore,
} from "./lib/offlineScores";
import { createOfflineOrganizerSync, createOrganizerDirectSync } from "./lib/directScoreSync";
import {
  acknowledgeGameDayOperation,
  cacheGameDayState,
  enqueueGameDayOperation,
  getCachedGameDayState,
  pendingGameDayOperations,
} from "./lib/offlineGameDay";

const playerName = (players, id) =>
  players.find((player) => player.id === id)?.full_name || "Unknown player";

function normalizeCourtAssignments(gameList) {
  const unassignIds = [];
  const courtIds = [
    ...new Set(
      gameList
        .filter(
          (game) =>
            game.court_id && ["queued", "playing"].includes(game.status),
        )
        .map((game) => game.court_id),
    ),
  ];
  courtIds.forEach((courtId) => {
    const assigned = gameList
      .filter(
        (game) =>
          game.court_id === courtId &&
          ["queued", "playing"].includes(game.status),
      )
      .sort(
        (a, b) =>
          (a.status === b.status ? 0 : a.status === "playing" ? -1 : 1) ||
          a.game_number - b.game_number,
      );
    assigned.slice(1).forEach((game) => unassignIds.push(game.id));
  });
  return {
    games: gameList.map((game) =>
      unassignIds.includes(game.id) ? { ...game, court_id: null } : game,
    ),
    unassignIds,
  };
}

export default function GameDay({ event, onBack, onEventUpdated }) {
  const [players, setPlayers] = useState([]);
  const [courts, setCourts] = useState([]);
  const [queue, setQueue] = useState([]);
  const [games, setGames] = useState([]);
  const [gamePlayers, setGamePlayers] = useState([]);
  const [courtName, setCourtName] = useState("");
  const [editingCourtId, setEditingCourtId] = useState(null);
  const [editingCourtName, setEditingCourtName] = useState("");
  const [savingCourtName, setSavingCourtName] = useState(false);
  const [monitoredCourt, setMonitoredCourt] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoPlacingMatch, setAutoPlacingMatch] = useState(false);
  const [autoQueueing, setAutoQueueing] = useState(false);
  const [completionPrompt, setCompletionPrompt] = useState(null);
  const [completingGame, setCompletingGame] = useState(false);
  const [scoringLink, setScoringLink] = useState(null);
  const [displayLink, setDisplayLink] = useState(null);
  const [substitutionPrompt, setSubstitutionPrompt] = useState(null);
  const [substitutePlayerId, setSubstitutePlayerId] = useState("");
  const [substituting, setSubstituting] = useState(false);
  const [newPlayer, setNewPlayer] = useState({
    full_name: "",
    skill_level: "beginner",
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncState, setSyncState] = useState("synced");
  const [pendingScoreCount, setPendingScoreCount] = useState(
    () => pendingScoresForEvent(event.id).length,
  );
  const [pendingOperationCount, setPendingOperationCount] = useState(
    () => pendingGameDayOperations(event.id).length,
  );
  const [directConnections, setDirectConnections] = useState({});
  const [offlinePairing, setOfflinePairing] = useState(null);
  const [offlineAnswer, setOfflineAnswer] = useState("");
  const [showOfflineScanner, setShowOfflineScanner] = useState(false);
  const [showPageTour, setShowPageTour] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEndPrompt, setShowEndPrompt] = useState(false);
  const [endingEvent, setEndingEvent] = useState(false);
  const scoreSaveChains = useRef({});
  const directSyncs = useRef(new Map());
  const offlineSyncs = useRef(new Map());
  const gamesRef = useRef([]);
  const courtDataRef = useRef({ players: [], gamePlayers: [], scores: {} });
  const courtViewInitialized = useRef(false);
  const teamSize = event.game_format === "singles" ? 1 : 2;
  useEffect(() => {
    if (!window.localStorage.getItem("pickleflow-tour-game-day")) setShowPageTour(true);
  }, []);
  const playersNeeded = teamSize * 2;

  async function load() {
    setLoading(true);
    if (!navigator.onLine) {
      const cached = getCachedGameDayState(event.id);
      if (cached) {
        const normalized = normalizeCourtAssignments(cached.games || []);
        setPlayers(cached.players || []);
        setCourts(cached.courts || []);
        setQueue(cached.queue || []);
        setGames(normalized.games);
        setGamePlayers(cached.gamePlayers || []);
        setScores(cached.scores || {});
        setPendingScoreCount(pendingScoresForEvent(event.id).length);
        setPendingOperationCount(pendingGameDayOperations(event.id).length);
        setMessage("Offline Game Day restored from this browser.");
      } else {
        setMessage("Connect once to load this event before using Offline Game Day.");
      }
      setLoading(false);
      return;
    }
    const [playerResult, courtResult, queueResult, gameResult] =
      await Promise.all([
        supabase
          .from("player_registrations")
          .select("*")
          .eq("event_id", event.id)
          .neq("status", "cancelled")
          .order("full_name"),
        supabase
          .from("event_courts")
          .select("*")
          .eq("event_id", event.id)
          .order("created_at"),
        supabase
          .from("game_queue")
          .select("*")
          .eq("event_id", event.id)
          .order("position")
          .order("joined_at"),
        supabase
          .from("games")
          .select("*")
          .eq("event_id", event.id)
          .order("game_number", { ascending: false }),
      ]);
    const normalized = normalizeCourtAssignments(gameResult.data || []);
    const loadedGames = normalized.games;
    if (normalized.unassignIds.length)
      await supabase
        .from("games")
        .update({ court_id: null })
        .in("id", normalized.unassignIds);
    const gameIds = loadedGames.map((game) => game.id);
    const participantResult = gameIds.length
      ? await supabase.from("game_players").select("*").in("game_id", gameIds)
      : { data: [] };
    setPlayers(playerResult.data || []);
    setCourts(courtResult.data || []);
    setQueue(queueResult.data || []);
    setGames(loadedGames);
    setGamePlayers(participantResult.data || []);
    const pending = pendingScoresForEvent(event.id);
    setPendingScoreCount(pending.length);
    setScores(Object.fromEntries(loadedGames.map((game) => {
      const local = pending.find((entry) => entry.gameId === game.id);
      return [game.id, local
        ? { one: local.one, two: local.two }
        : {
            one: Number(game.team_one_score || 0),
            two: Number(game.team_two_score || 0),
          }];
    })));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [event.id]);

  useEffect(() => {
    if (courtViewInitialized.current || courts.length < 4) return;
    courtViewInitialized.current = true;
    setMonitoredCourt(courts[0]?.id || "");
  }, [courts]);

  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  useEffect(() => {
    if (loading || !players.length) return;
    cacheGameDayState(event.id, {
      players,
      courts,
      queue,
      games,
      gamePlayers,
      scores,
    });
  }, [event.id, gamePlayers, games, loading, players, queue, scores, courts]);

  useEffect(() => {
    courtDataRef.current = { players, gamePlayers, scores };
    offlineSyncs.current.forEach((sync, courtId) =>
      sync.sendView?.(buildOfflineCourtView(courtId)),
    );
  }, [players, gamePlayers, scores, games]);

  useEffect(() => () => {
    directSyncs.current.forEach((sync) => sync.close());
    directSyncs.current.clear();
    offlineSyncs.current.forEach((sync) => sync.close());
    offlineSyncs.current.clear();
  }, []);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setSyncState("offline");
    };
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineGameDay();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    if (
      navigator.onLine &&
      (pendingGameDayOperations(event.id).length ||
        pendingScoresForEvent(event.id).length)
    )
      syncOfflineGameDay();
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [event.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`game-day-scores-${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `event_id=eq.${event.id}`,
        },
        ({ eventType, new: nextGame, old: previousGame }) => {
          if (eventType === "DELETE") {
            setGames((current) =>
              current.filter((game) => game.id !== previousGame.id),
            );
            setScores((current) => {
              const next = { ...current };
              delete next[previousGame.id];
              return next;
            });
            return;
          }
          setGames((current) => {
            const exists = current.some((game) => game.id === nextGame.id);
            return exists
              ? current.map((game) =>
                  game.id === nextGame.id ? { ...game, ...nextGame } : game,
                )
              : [nextGame, ...current];
          });
          if (!pendingScoresForEvent(event.id).some((entry) => entry.gameId === nextGame.id))
            setScores((current) => ({
              ...current,
              [nextGame.id]: {
                one: Number(nextGame.team_one_score || 0),
                two: Number(nextGame.team_two_score || 0),
              },
            }));
          const one = Number(nextGame.team_one_score || 0);
          const two = Number(nextGame.team_two_score || 0);
          if (
            nextGame.status === "playing" &&
            Math.max(one, two) >= nextGame.points_to_win &&
            one !== two
          ) {
            setCompletionPrompt((current) =>
              current?.game?.id === nextGame.id
                ? current
                : { game: nextGame, score: { one, two } },
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [event.id]);

  const waiting = queue
    .filter((entry) => entry.status === "waiting")
    .sort((a, b) => a.position - b.position);
  const checkedIn = players.filter((player) => player.checked_in_at);
  const activeGames = games
    .filter((game) => ["queued", "playing"].includes(game.status))
    .sort(
      (a, b) =>
        (a.status === b.status ? 0 : a.status === "playing" ? -1 : 1) ||
        (a.court_id ? 0 : 1) - (b.court_id ? 0 : 1) ||
        (a.court_id || "").localeCompare(b.court_id || "") ||
        a.game_number - b.game_number,
    );
  const completedGames = games.filter((game) => game.status === "completed");
  const monitoredGames = monitoredCourt
    ? activeGames.filter((game) => game.court_id === monitoredCourt)
    : activeGames;
  const activePlayerIds = new Set(
    gamePlayers
      .filter((entry) => activeGames.some((game) => game.id === entry.game_id))
      .map((entry) => entry.player_registration_id),
  );
  const availableCheckedInNotQueued = checkedIn.filter(
    (player) =>
      !activePlayerIds.has(player.id) &&
      !queue.some(
        (entry) =>
          entry.player_registration_id === player.id &&
          entry.status === "waiting",
      ),
  );
  const playingGameForCourt = (courtId) =>
    activeGames.find(
      (game) => game.court_id === courtId && game.status === "playing",
    );
  const unassignedQueuedGames = activeGames
    .filter((game) => game.status === "queued" && !game.court_id)
    .sort((a, b) => a.game_number - b.game_number);
  const courtCanAcceptMatch = (court) =>
    court.status === "available" &&
    !activeGames.some((game) => game.court_id === court.id);
  const isNextMatch = (game) =>
    game.status === "queued" && !game.court_id;
  const eventEnded = event.status === "completed";
  const pendingChangeCount = pendingScoreCount + pendingOperationCount;
  const standings = useMemo(
    () =>
      checkedIn
        .map((player) => {
          const appearances = gamePlayers.filter(
            (entry) =>
              entry.player_registration_id === player.id &&
              completedGames.some((game) => game.id === entry.game_id),
          );
          const wins = appearances.filter(
            (entry) =>
              completedGames.find((game) => game.id === entry.game_id)
                ?.winner_team === entry.team_number,
          ).length;
          const accumulatedScore = appearances.reduce((total, entry) => {
            const game = completedGames.find(
              (completedGame) => completedGame.id === entry.game_id,
            );
            if (!game) return total;
            return (
              total +
              Number(
                entry.team_number === 1
                  ? game.team_one_score || 0
                  : game.team_two_score || 0,
              )
            );
          }, 0);
          const pointsAllowed = appearances.reduce((total, entry) => {
            const game = completedGames.find(
              (completedGame) => completedGame.id === entry.game_id,
            );
            if (!game) return total;
            return (
              total +
              Number(
                entry.team_number === 1
                  ? game.team_two_score || 0
                  : game.team_one_score || 0,
              )
            );
          }, 0);
          return {
            ...player,
            played: appearances.length,
            wins,
            losses: appearances.length - wins,
            winRate: appearances.length ? (wins / appearances.length) * 100 : 0,
            accumulatedScore,
            pointsAllowed,
            pointDifferential: accumulatedScore - pointsAllowed,
          };
        })
        .sort(
          (a, b) =>
            b.wins - a.wins ||
            a.losses - b.losses ||
            a.full_name.localeCompare(b.full_name),
        ),
    [checkedIn, completedGames, gamePlayers],
  );
  const topWinPercentage = useMemo(
    () =>
      [...standings]
        .filter((player) => player.played > 0)
        .sort(
          (a, b) =>
            b.winRate - a.winRate ||
            b.wins - a.wins ||
            b.played - a.played ||
            b.accumulatedScore - a.accumulatedScore ||
            a.full_name.localeCompare(b.full_name),
        )
        .slice(0, 5),
    [standings],
  );
  const topAccumulatedScore = useMemo(
    () =>
      [...standings]
        .filter((player) => player.played > 0)
        .sort(
          (a, b) =>
            b.accumulatedScore - a.accumulatedScore ||
            b.winRate - a.winRate ||
            b.wins - a.wins ||
            a.full_name.localeCompare(b.full_name),
        )
        .slice(0, 5),
    [standings],
  );
  const championship = useMemo(() => {
    const maxGames = Math.max(0, ...standings.map((player) => player.played));
    const minimumGames = Math.max(1, maxGames - 1);
    const eligible = standings
      .filter((player) => player.played >= minimumGames)
      .sort(
        (a, b) =>
          b.winRate - a.winRate ||
          b.wins - a.wins ||
          b.pointDifferential - a.pointDifferential ||
          b.accumulatedScore - a.accumulatedScore ||
          a.pointsAllowed - b.pointsAllowed ||
          a.full_name.localeCompare(b.full_name),
      );
    const leader = eligible[0];
    const champions = leader
      ? eligible.filter(
          (player) =>
            Math.abs(player.winRate - leader.winRate) < 0.001 &&
            player.wins === leader.wins &&
            player.pointDifferential === leader.pointDifferential &&
            player.accumulatedScore === leader.accumulatedScore &&
            player.pointsAllowed === leader.pointsAllowed,
        )
      : [];
    return { champions, minimumGames, maxGames };
  }, [standings]);
  const completedGameIds = useMemo(
    () => new Set(completedGames.map((game) => game.id)),
    [completedGames],
  );
  const playerGameCounts = useMemo(() => {
    const counts = new Map();
    gamePlayers.forEach((entry) => {
      if (!completedGameIds.has(entry.game_id)) return;
      counts.set(
        entry.player_registration_id,
        (counts.get(entry.player_registration_id) || 0) + 1,
      );
    });
    return counts;
  }, [completedGameIds, gamePlayers]);
  const partnerCounts = useMemo(() => {
    const counts = new Map();
    completedGames.forEach((game) => {
      [1, 2].forEach((team) => {
        const teammates = gamePlayers
          .filter(
            (entry) =>
              entry.game_id === game.id && entry.team_number === team,
          )
          .map((entry) => entry.player_registration_id);
        if (teammates.length !== 2) return;
        const key = [...teammates].sort().join(":");
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    return counts;
  }, [completedGames, gamePlayers]);

  function partnershipCount(first, second) {
    return partnerCounts.get([first, second].sort().join(":")) || 0;
  }

  function arrangeOpenPlayPartners(playerIds) {
    if (event.game_format !== "open_play" || playerIds.length !== 4)
      return playerIds;
    const [a, b, c, d] = playerIds;
    const options = [
      [a, b, c, d],
      [a, c, b, d],
      [a, d, b, c],
    ];
    return options.sort(
      (first, second) =>
        partnershipCount(first[0], first[1]) +
        partnershipCount(first[2], first[3]) -
        partnershipCount(second[0], second[1]) -
        partnershipCount(second[2], second[3]),
    )[0];
  }

  function fairNextPlayerIds() {
    const ranked = waiting
      .map((entry, queueIndex) => ({
        id: entry.player_registration_id,
        gamesPlayed: playerGameCounts.get(entry.player_registration_id) || 0,
        queueIndex,
      }))
      .sort(
        (a, b) =>
          a.gamesPlayed - b.gamesPlayed || a.queueIndex - b.queueIndex,
      );
    if (ranked.length < playersNeeded) return [];
    if (event.game_format !== "open_play" || playersNeeded !== 4)
      return ranked.slice(0, playersNeeded).map((player) => player.id);

    // Search a fair-sized front pool. Games played is weighted first, then
    // repeat partnerships, then queue order.
    const pool = ranked.slice(0, Math.min(20, ranked.length));
    let best = null;
    for (let a = 0; a < pool.length - 3; a += 1)
      for (let b = a + 1; b < pool.length - 2; b += 1)
        for (let c = b + 1; c < pool.length - 1; c += 1)
          for (let d = c + 1; d < pool.length; d += 1) {
            const group = [pool[a], pool[b], pool[c], pool[d]];
            const arranged = arrangeOpenPlayPartners(
              group.map((player) => player.id),
            );
            const repeatedPartners =
              partnershipCount(arranged[0], arranged[1]) +
              partnershipCount(arranged[2], arranged[3]);
            const gamesPlayed = group.reduce(
              (total, player) => total + player.gamesPlayed,
              0,
            );
            const queueCost = group.reduce(
              (total, player) => total + player.queueIndex,
              0,
            );
            const score = gamesPlayed * 1_000_000 + repeatedPartners * 10_000 + queueCost;
            if (!best || score < best.score) best = { score, ids: arranged };
          }
    return best?.ids || ranked.slice(0, 4).map((player) => player.id);
  }

  useEffect(() => {
    if (
      eventEnded ||
      !event.auto_assign_next_players ||
      autoQueueing ||
      !availableCheckedInNotQueued.length
    )
      return;
    const firstPosition = waiting.length
      ? Math.max(...waiting.map((entry) => entry.position)) + 1
      : 1;
    const joinedAt = new Date().toISOString();
    const playerIds = availableCheckedInNotQueued.map((player) => player.id);
    setAutoQueueing(true);
    supabase
      .from("game_queue")
      .upsert(
        playerIds.map((playerId, index) => ({
          event_id: event.id,
          player_registration_id: playerId,
          position: firstPosition + index,
          status: "waiting",
          joined_at: joinedAt,
        })),
        { onConflict: "event_id,player_registration_id" },
      )
      .select()
      .then(({ data, error }) => {
        if (error) {
          setMessage(`Players could not be auto-queued: ${error.message}`);
          return;
        }
        setQueue((current) => [
          ...current.filter(
            (entry) => !playerIds.includes(entry.player_registration_id),
          ),
          ...(data || []),
        ]);
      })
      .finally(() => setAutoQueueing(false));
  }, [
    event.auto_assign_next_players,
    eventEnded,
    event.id,
    players,
    queue,
    games,
    gamePlayers,
    autoQueueing,
  ]);

  useEffect(() => {
    if (
      eventEnded ||
      !event.auto_assign_next_players ||
      autoAssigning ||
      autoQueueing ||
      availableCheckedInNotQueued.length ||
      unassignedQueuedGames.length
    )
      return;
    if (waiting.length < playersNeeded) return;
    setAutoAssigning(true);
    createMatchFor(
      fairNextPlayerIds(),
      true,
    ).finally(() => setAutoAssigning(false));
  }, [
    event.auto_assign_next_players,
    eventEnded,
    courts,
    queue,
    games,
    playersNeeded,
    autoAssigning,
    autoQueueing,
  ]);

  useEffect(() => {
    if (eventEnded || autoPlacingMatch || !unassignedQueuedGames.length) return;
    const court = courts.find(courtCanAcceptMatch);
    if (!court) return;
    setAutoPlacingMatch(true);
    assignMatchToCourt(unassignedQueuedGames[0], court).finally(() =>
      setAutoPlacingMatch(false),
    );
  }, [courts, games, autoPlacingMatch, eventEnded]);

  async function updateEventSettings(field, value) {
    const payload = {
      [field]: field === "points_to_win" ? Number(value) : value,
    };
    const { data, error } = await supabase
      .from("events")
      .update(payload)
      .eq("id", event.id)
      .select()
      .single();
    if (error) setMessage(error.message);
    else onEventUpdated(data);
  }

  async function checkInPlayer(player) {
    if (player.checked_in_at) return;
    const checked_in_at = new Date().toISOString();
    const { error } = await supabase
      .from("player_registrations")
      .update({ checked_in_at })
      .eq("id", player.id);
    if (error) return setMessage(error.message);
    setPlayers(
      players.map((item) =>
        item.id === player.id ? { ...item, checked_in_at } : item,
      ),
    );
    const queued = await addToQueue(player.id);
    if (queued)
      setMessage(`${player.full_name} checked in and joined the queue.`);
  }

  async function markPlayerOut(player) {
    if (!player.checked_in_at || activePlayerIds.has(player.id)) return;
    const { error } = await supabase
      .from("player_registrations")
      .update({ checked_in_at: null })
      .eq("id", player.id);
    if (error) return setMessage(error.message);
    await removeFromQueue(player.id);
    setPlayers(
      players.map((item) =>
        item.id === player.id ? { ...item, checked_in_at: null } : item,
      ),
    );
    setMessage(`${player.full_name} is marked out for this event.`);
  }

  async function addCourt(e) {
    e.preventDefault();
    setMessage("");
    const { data, error } = await supabase
      .from("event_courts")
      .insert({ event_id: event.id, name: courtName.trim() })
      .select()
      .single();
    if (error) setMessage(error.message);
    else {
      setCourts([...courts, data]);
      setCourtName("");
    }
  }

  async function toggleCourt(court) {
    const status = court.status === "disabled" ? "available" : "disabled";
    const { error } = await supabase
      .from("event_courts")
      .update({ status })
      .eq("id", court.id);
    if (error) setMessage(error.message);
    else
      setCourts(
        courts.map((item) =>
          item.id === court.id ? { ...item, status } : item,
        ),
      );
  }

  function beginCourtRename(court) {
    setMessage("");
    setEditingCourtId(court.id);
    setEditingCourtName(court.name);
  }

  function cancelCourtRename() {
    setEditingCourtId(null);
    setEditingCourtName("");
  }

  async function renameCourt(e, court) {
    e.preventDefault();
    const name = editingCourtName.trim();
    if (!name || savingCourtName) return;
    setSavingCourtName(true);
    setMessage("");
    const { error } = await supabase
      .from("event_courts")
      .update({ name })
      .eq("id", court.id)
      .eq("event_id", event.id);
    setSavingCourtName(false);
    if (error) {
      setMessage(error.code === "23505" ? "Another court already uses that name." : error.message);
      return;
    }
    setCourts(courts.map((item) => item.id === court.id ? { ...item, name } : item));
    if (scoringLink?.court.id === court.id)
      setScoringLink({ ...scoringLink, court: { ...scoringLink.court, name } });
    cancelCourtRename();
    setMessage(`Court renamed to ${name}.`);
  }

  async function openScoringLink(court) {
    setMessage("");
    const cacheKey = `pickleflow-scoring-access-${court.id}`;
    const cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
    if (!navigator.onLine) {
      if (!cached?.access_token)
        return setMessage("Open this court’s scoring link once while online before pairing fully offline.");
      const url = `${window.location.origin}/?score=${cached.access_token}`;
      setScoringLink({ court, url, expiresAt: cached.expires_at });
      return;
    }
    const { data, error } = await supabase.rpc("create_court_scoring_access", {
      p_court_id: court.id,
    });
    if (error) {
      if (cached?.access_token) {
        const url = `${window.location.origin}/?score=${cached.access_token}`;
        setScoringLink({ court, url, expiresAt: cached.expires_at });
        return;
      }
      return setMessage(error.message);
    }
    const access = data?.[0];
    const url = `${window.location.origin}/?score=${access.access_token}`;
    window.localStorage.setItem(cacheKey, JSON.stringify(access));
    directSyncs.current.get(court.id)?.close();
    setDirectConnections((current) => ({ ...current, [court.id]: "waiting" }));
    const directSync = createOrganizerDirectSync({
      token: access.access_token,
      onStatus: (status) =>
        setDirectConnections((current) => ({ ...current, [court.id]: status })),
      onScore: handleDirectScore,
    });
    directSyncs.current.set(court.id, directSync);
    setScoringLink({ court, url, expiresAt: access.expires_at });
  }

  function buildOfflineCourtView(courtId) {
    const court = courts.find((item) => item.id === courtId);
    if (!court) return null;
    const { players: currentPlayers, gamePlayers: currentSlots, scores: currentScores } = courtDataRef.current;
    const game = gamesRef.current.find((item) => item.court_id === courtId && item.status === "playing");
    const nextGame = gamesRef.current.find((item) => item.court_id === courtId && item.status === "queued");
    const shapeGame = (item, includeScore = false) => item ? {
      id: item.id,
      game_number: item.game_number,
      points_to_win: item.points_to_win,
      team_one_score: includeScore ? Number(currentScores[item.id]?.one ?? item.team_one_score ?? 0) : undefined,
      team_two_score: includeScore ? Number(currentScores[item.id]?.two ?? item.team_two_score ?? 0) : undefined,
      team_one: currentSlots.filter((slot) => slot.game_id === item.id && slot.team_number === 1).map((slot) => playerName(currentPlayers, slot.player_registration_id)),
      team_two: currentSlots.filter((slot) => slot.game_id === item.id && slot.team_number === 2).map((slot) => playerName(currentPlayers, slot.player_registration_id)),
    } : null;
    return {
      event_name: event.name,
      court_name: court.name,
      game: shapeGame(game, true),
      next_game: shapeGame(nextGame),
    };
  }

  async function beginOfflinePairing() {
    if (!scoringLink?.court) return;
    const court = scoringLink.court;
    setMessage("");
    setOfflineAnswer("");
    setOfflinePairing({ court, status: "creating", offerUrl: "" });
    offlineSyncs.current.get(court.id)?.close();
    const sync = createOfflineOrganizerSync({
      onScore: handleDirectScore,
      getView: () => buildOfflineCourtView(court.id),
      onStatus: (status) => {
        setDirectConnections((current) => ({ ...current, [court.id]: status }));
        setOfflinePairing((current) => current?.court.id === court.id ? { ...current, status } : current);
      },
    });
    offlineSyncs.current.set(court.id, sync);
    try {
      const offer = await sync.createOffer();
      const offerUrl = `${scoringLink.url}&offlineOffer=${encodeURIComponent(offer)}`;
      setOfflinePairing({ court, status: "offer-ready", offerUrl, offerCode: `pickleflow-offer:${offer}` });
    } catch (error) {
      setOfflinePairing({ court, status: "error", offerUrl: "" });
      setMessage(`Offline pairing could not start: ${error.message}`);
    }
  }

  async function acceptOfflineAnswer(value = offlineAnswer) {
    if (!offlinePairing?.court || !value.trim()) return;
    const sync = offlineSyncs.current.get(offlinePairing.court.id);
    try {
      await sync.acceptAnswer(value.trim());
      setShowOfflineScanner(false);
      setOfflineAnswer("");
    } catch (error) {
      setMessage(`The offline response could not be accepted: ${error.message}`);
    }
  }

  async function copyScoringLink() {
    try {
      await navigator.clipboard.writeText(scoringLink.url);
      setMessage(`${scoringLink.court.name} scoring link copied.`);
    } catch {
      setMessage("Copy the scoring link from the field below.");
    }
  }

  function downloadScoringQr() {
    const canvas = document.getElementById("court-scoring-qr");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${scoringLink.court.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-scoring-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function openDisplayLink() {
    setMessage("");
    const { data, error } = await supabase.rpc("create_event_display_access", { p_event_id: event.id });
    if (error) return setMessage(error.message);
    const access = data?.[0];
    setDisplayLink({ url: `${window.location.origin}/?display=${access.access_token}` });
  }

  function downloadDisplayQr() {
    const canvas = document.getElementById("event-display-qr");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-match-board-qr.png`;
    link.href = canvas.toDataURL("image/png"); link.click();
  }

  async function copyDisplayLink() {
    try { await navigator.clipboard.writeText(displayLink.url); setMessage("Match Board link copied."); }
    catch { setMessage("Copy the Match Board link from the field below."); }
  }

  async function addToQueue(playerId) {
    const playerGames = playerGameCounts.get(playerId) || 0;
    const otherCheckedIn = checkedIn.filter((player) => player.id !== playerId);
    const prioritizeNewPlayer =
      event.game_format === "open_play" &&
      playerGames === 0 &&
      otherCheckedIn.length > 0 &&
      otherCheckedIn.every(
        (player) => (playerGameCounts.get(player.id) || 0) > 0,
      );
    const position = waiting.length
      ? prioritizeNewPlayer
        ? Math.min(...waiting.map((item) => item.position)) - 1
        : Math.max(...waiting.map((item) => item.position)) + 1
      : 1;
    const { data, error } = await supabase
      .from("game_queue")
      .upsert(
        {
          event_id: event.id,
          player_registration_id: playerId,
          position,
          status: "waiting",
          joined_at: new Date().toISOString(),
        },
        { onConflict: "event_id,player_registration_id" },
      )
      .select()
      .single();
    if (error) {
      setMessage(error.message);
      return false;
    } else {
      setQueue([
        ...queue.filter((item) => item.player_registration_id !== playerId),
        data,
      ]);
      return true;
    }
  }

  async function addNewPlayer(e) {
    e.preventDefault();
    if (addingPlayer || !newPlayer.full_name.trim()) return;
    setAddingPlayer(true);
    setMessage("");
    const checked_in_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("player_registrations")
      .insert({
        event_id: event.id,
        full_name: newPlayer.full_name.trim(),
        skill_level: newPlayer.skill_level,
        email: null,
        phone: null,
        status: "confirmed",
        checked_in_at,
      })
      .select()
      .single();
    if (error) {
      const duplicateName =
        error.code === "23505" &&
        (error.message || "").toLowerCase().includes("name");
      setMessage(
        duplicateName
          ? "A player with this name is already registered for this event."
          : error.message,
      );
      setAddingPlayer(false);
      return;
    }
    setPlayers((current) => [...current, data]);
    const queued = await addToQueue(data.id);
    if (queued) {
      setNewPlayer({ full_name: "", skill_level: "beginner" });
      setMessage(`${data.full_name} added, checked in, and joined the queue.`);
    }
    setAddingPlayer(false);
  }

  async function removeFromQueue(playerId) {
    const existing = queue.find(
      (item) => item.player_registration_id === playerId,
    );
    if (!existing) return;
    const { error } = await supabase
      .from("game_queue")
      .update({ status: "removed" })
      .eq("id", existing.id);
    if (!error)
      setQueue(
        queue.map((item) =>
          item.id === existing.id ? { ...item, status: "removed" } : item,
        ),
      );
  }

  function toggleSelected(playerId) {
    setSelectedPlayers(
      selectedPlayers.includes(playerId)
        ? selectedPlayers.filter((id) => id !== playerId)
        : selectedPlayers.length < playersNeeded
          ? [...selectedPlayers, playerId]
          : selectedPlayers,
    );
  }

  function selectNextPlayers() {
    setSelectedPlayers(fairNextPlayerIds());
  }

  async function assignMatchToCourt(game, court) {
    if (
      activeGames.some(
        (item) => item.id !== game.id && item.court_id === court.id,
      )
    ) {
      setMessage(
        `${court.name} already has an active match. This game will remain court-pending.`,
      );
      return false;
    }
    if (!navigator.onLine) {
      enqueueGameDayOperation(event.id, "assign_match", {
        gameId: game.id,
        courtId: court.id,
      });
      setPendingOperationCount(pendingGameDayOperations(event.id).length);
      setGames((current) =>
        current.map((item) =>
          item.id === game.id ? { ...item, court_id: court.id } : item,
        ),
      );
      setCourts((current) =>
        current.map((item) =>
          item.id === court.id ? { ...item, status: "in_use" } : item,
        ),
      );
      setMessage(`Offline · Game ${game.game_number} assigned to ${court.name}.`);
      return true;
    }
    const { error } = await supabase
      .from("games")
      .update({ court_id: court.id })
      .eq("id", game.id)
      .is("court_id", null);
    if (error) {
      setMessage(`The next match could not be assigned: ${error.message}`);
      return false;
    }
    await supabase
      .from("event_courts")
      .update({ status: "in_use" })
      .eq("id", court.id);
    setGames((current) =>
      current.map((item) =>
        item.id === game.id ? { ...item, court_id: court.id } : item,
      ),
    );
    setCourts((current) =>
      current.map((item) =>
        item.id === court.id ? { ...item, status: "in_use" } : item,
      ),
    );
    setMessage(
      `Game ${game.game_number} is ready on ${court.name}. Start when the players are on court.`,
    );
    return true;
  }

  async function createMatchFor(playerIds, automatic = false) {
    setMessage("");
    if (eventEnded) {
      setMessage("This event has ended. New matches are disabled.");
      return false;
    }
    if (playerIds.length !== playersNeeded) {
      setMessage(`Select exactly ${playersNeeded} players.`);
      return false;
    }
    if (unassignedQueuedGames.length) {
      setMessage("A next match is already paired and waiting for a court.");
      return false;
    }
    const gameNumber = games.length
      ? Math.max(...games.map((game) => game.game_number)) + 1
      : 1;
    const orderedPlayerIds = arrangeOpenPlayPartners(playerIds);
    if (!navigator.onLine) {
      const game = {
        id: crypto.randomUUID(),
        event_id: event.id,
        court_id: null,
        game_number: gameNumber,
        format: event.game_format,
        points_to_win: event.points_to_win,
        status: "queued",
        team_one_score: 0,
        team_two_score: 0,
        winner_team: null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
      };
      const participants = orderedPlayerIds.map((playerId, index) => ({
        id: crypto.randomUUID(),
        game_id: game.id,
        player_registration_id: playerId,
        team_number: index < teamSize ? 1 : 2,
      }));
      enqueueGameDayOperation(event.id, "create_match", {
        game,
        participants,
        playerIds: orderedPlayerIds,
      });
      setPendingOperationCount(pendingGameDayOperations(event.id).length);
      setGames((current) => [game, ...current]);
      setGamePlayers((current) => [...current, ...participants]);
      setQueue((current) =>
        current.map((entry) =>
          orderedPlayerIds.includes(entry.player_registration_id)
            ? { ...entry, status: "assigned" }
            : entry,
        ),
      );
      setSelectedPlayers([]);
      setMessage(`Offline · Game ${gameNumber} paired and saved on this browser.`);
      return true;
    }
    const { data: game, error } = await supabase
      .from("games")
      .insert({
        event_id: event.id,
        court_id: null,
        game_number: gameNumber,
        format: event.game_format,
        points_to_win: event.points_to_win,
      })
      .select()
      .single();
    if (error) {
      setMessage(error.message);
      return false;
    }
    const participants = orderedPlayerIds.map((playerId, index) => ({
      game_id: game.id,
      player_registration_id: playerId,
      team_number: index < teamSize ? 1 : 2,
    }));
    const { data: inserted, error: playerError } = await supabase
      .from("game_players")
      .insert(participants)
      .select();
    if (playerError) {
      setMessage(playerError.message);
      return false;
    }
    await Promise.all([
      supabase
        .from("game_queue")
        .update({ status: "assigned" })
        .eq("event_id", event.id)
        .in("player_registration_id", orderedPlayerIds),
    ]);
    setGames([game, ...games]);
    setGamePlayers([...gamePlayers, ...(inserted || [])]);
    setQueue(
      queue.map((entry) =>
        orderedPlayerIds.includes(entry.player_registration_id)
          ? { ...entry, status: "assigned" }
          : entry,
      ),
    );
    setSelectedPlayers([]);
    if (automatic)
      setMessage(
        `Game ${gameNumber} was paired and added to Next Match. It will be assigned when a court is available.`,
      );
    else
      setMessage(
        `Game ${gameNumber} was paired and added to Next Match.`,
      );
    return true;
  }

  async function createMatch() {
    await createMatchFor(selectedPlayers);
  }

  async function endEvent() {
    if (endingEvent) return;
    setEndingEvent(true);
    setMessage("");
    const unfinishedIds = games
      .filter((game) => ["queued", "playing"].includes(game.status))
      .map((game) => game.id);
    if (unfinishedIds.length) {
      const { error: gameError } = await supabase
        .from("games")
        .update({ status: "cancelled" })
        .in("id", unfinishedIds);
      if (gameError) {
        setMessage(`The event could not be ended: ${gameError.message}`);
        setEndingEvent(false);
        return;
      }
    }
    await supabase
      .from("event_courts")
      .update({ status: "available" })
      .eq("event_id", event.id)
      .neq("status", "disabled");
    const { data: updatedEvent, error } = await supabase
      .from("events")
      .update({ status: "completed" })
      .eq("id", event.id)
      .select()
      .single();
    if (error) {
      setMessage(`The event could not be ended: ${error.message}`);
      setEndingEvent(false);
      return;
    }
    setGames((current) =>
      current.map((game) =>
        unfinishedIds.includes(game.id) ? { ...game, status: "cancelled" } : game,
      ),
    );
    setCourts((current) =>
      current.map((court) =>
        court.status === "disabled" ? court : { ...court, status: "available" },
      ),
    );
    onEventUpdated?.(updatedEvent);
    setShowEndPrompt(false);
    setEndingEvent(false);
    setMessage("Event completed. Game controls are now disabled and final leaderboards are ready.");
  }

  function downloadLeaderboard(type) {
    const isChampion = type === "champion";
    const isWins = type === "wins";
    const leaders = isChampion
      ? championship.champions
      : isWins
        ? topWinPercentage
        : topAccumulatedScore;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 1200, 1200);
    gradient.addColorStop(0, "#0c3158");
    gradient.addColorStop(0.58, "#14518a");
    gradient.addColorStop(1, "#75a925");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 1200);
    context.fillStyle = "rgba(255,255,255,.08)";
    context.beginPath();
    context.arc(1100, 80, 330, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#a9e72f";
    context.font = "800 34px Manrope, Arial, sans-serif";
    context.fillText("PICKLEFLOW", 80, 90);
    context.fillStyle = "#ffffff";
    context.font = "800 68px Manrope, Arial, sans-serif";
    context.fillText(
      isChampion
        ? leaders.length > 1
          ? "OPEN PLAY CO-CHAMPIONS"
          : "OPEN PLAY CHAMPION"
        : isWins
          ? "TOP 5 · WINNING %"
          : "TOP 5 · TOTAL SCORE",
      80,
      195,
    );
    context.fillStyle = "#dceaf6";
    context.font = "600 31px Manrope, Arial, sans-serif";
    const eventTitle = event.name.length > 48 ? `${event.name.slice(0, 45)}…` : event.name;
    context.fillText(eventTitle, 80, 250);
    context.font = "600 23px Manrope, Arial, sans-serif";
    context.fillText("Final standings · Generated by PickleFlow", 80, 292);
    leaders.forEach((player, index) => {
      const y = 355 + index * (isChampion ? 205 : 145);
      context.fillStyle = index === 0 ? "rgba(169,231,47,.22)" : "rgba(255,255,255,.11)";
      context.beginPath();
      context.roundRect(70, y, 1060, isChampion ? 170 : 112, 24);
      context.fill();
      context.fillStyle = index === 0 ? "#a9e72f" : "#ffffff";
      context.font = "800 45px Manrope, Arial, sans-serif";
      context.fillText(String(index + 1), 105, y + 70);
      context.fillStyle = "#ffffff";
      context.font = "800 34px Manrope, Arial, sans-serif";
      const name = player.full_name.length > 28 ? `${player.full_name.slice(0, 25)}…` : player.full_name;
      context.fillText(name, 180, y + 49);
      context.fillStyle = "#c9dbea";
      context.font = "600 22px Manrope, Arial, sans-serif";
      context.fillText(`${player.wins} wins · ${player.played} games · ${player.accumulatedScore} points`, 180, y + 82);
      if (isChampion)
        context.fillText(`Point differential ${player.pointDifferential >= 0 ? "+" : ""}${player.pointDifferential} · ${player.pointsAllowed} allowed`, 180, y + 119);
      context.fillStyle = "#ffffff";
      context.textAlign = "right";
      context.font = "800 42px Manrope, Arial, sans-serif";
      context.fillText(isChampion || isWins ? `${player.winRate.toFixed(1)}%` : String(player.accumulatedScore), 1080, y + 70);
      context.textAlign = "left";
    });
    if (!leaders.length) {
      context.fillStyle = "#ffffff";
      context.font = "700 34px Manrope, Arial, sans-serif";
      context.fillText("Complete a game to generate the leaderboard.", 80, 430);
    }
    context.fillStyle = "#dceaf6";
    context.font = "600 22px Manrope, Arial, sans-serif";
    context.fillText("pickleflow.paotechs.com", 80, 1120);
    const link = document.createElement("a");
    const safeName = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.download = `${safeName || "pickleflow-event"}-${isChampion ? "open-play-champion" : isWins ? "top-winning-percentage" : "top-total-score"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function startGame(game) {
    if (eventEnded) return setMessage("This event has ended. Games are disabled.");
    if (
      games.some(
        (item) =>
          item.id !== game.id &&
          item.court_id === game.court_id &&
          item.status === "playing",
      )
    )
      return setMessage(
        "Complete the current match on this court before starting the next match.",
      );
    const started_at = new Date().toISOString();
    if (!navigator.onLine) {
      enqueueGameDayOperation(event.id, "start_game", {
        gameId: game.id,
        startedAt: started_at,
      });
      setPendingOperationCount(pendingGameDayOperations(event.id).length);
      setGames((current) =>
        current.map((item) =>
          item.id === game.id
            ? { ...item, status: "playing", started_at }
            : item,
        ),
      );
      setMessage(`Offline · Game ${game.game_number} started locally.`);
      return;
    }
    const { error } = await supabase
      .from("games")
      .update({ status: "playing", started_at })
      .eq("id", game.id);
    if (error) setMessage(error.message);
    else
      setGames(
        games.map((item) =>
          item.id === game.id
            ? { ...item, status: "playing", started_at }
            : item,
        ),
      );
  }

  function availableSubstitutes(game) {
    const activePlayerIds = new Set(
      gamePlayers
        .filter((entry) =>
          activeGames.some((item) => item.id === entry.game_id),
        )
        .map((entry) => entry.player_registration_id),
    );
    return checkedIn.filter(
      (player) =>
        !activePlayerIds.has(player.id) &&
        !gamePlayers.some(
          (entry) =>
            entry.game_id === game.id &&
            entry.player_registration_id === player.id,
        ),
    );
  }

  function openSubstitution(game, slot) {
    setSubstitutePlayerId("");
    setSubstitutionPrompt({ game, slot });
  }

  async function confirmSubstitution() {
    if (!substitutionPrompt || !substitutePlayerId || substituting) return;
    setSubstituting(true);
    setMessage("");
    const { game, slot } = substitutionPrompt;
    const { error } = await supabase.rpc("substitute_game_player", {
      target_game_id: game.id,
      outgoing_player_id: slot.player_registration_id,
      incoming_player_id: substitutePlayerId,
    });
    if (error) {
      setMessage(error.message);
      setSubstituting(false);
      return;
    }
    const incomingName = playerName(players, substitutePlayerId);
    const outgoingName = playerName(players, slot.player_registration_id);
    await load();
    setMessage(
      `${incomingName} replaced ${outgoingName} in Game ${game.game_number}. ${outgoingName} is first in queue for the next available match.`,
    );
    setSubstituting(false);
    setSubstitutionPrompt(null);
    setSubstitutePlayerId("");
  }

  async function syncPendingScore(entry) {
    if (!navigator.onLine) return false;
    setSyncState("syncing");
    const { error } = await supabase
      .from("games")
      .update({
        team_one_score: Number(entry.one || 0),
        team_two_score: Number(entry.two || 0),
      })
      .eq("id", entry.gameId)
      .eq("event_id", event.id)
      .eq("status", "playing");
    if (error) {
      setSyncState("error");
      setMessage(`Score saved on this device and will retry: ${error.message}`);
      return false;
    }
    acknowledgePendingScore(entry);
    const remaining = pendingScoresForEvent(event.id).length;
    setPendingScoreCount(remaining);
    setSyncState(remaining ? "syncing" : "synced");
    return true;
  }

  function handleDirectScore(message) {
    const game = gamesRef.current.find((item) => item.id === message.gameId);
    if (!game || game.status !== "playing") return;
    const next = {
      one: Math.max(0, Number(message.one || 0)),
      two: Math.max(0, Number(message.two || 0)),
    };
    setScores((current) => ({ ...current, [game.id]: next }));
    const entry = savePendingScore({
      mode: "organizer",
      eventId: event.id,
      gameId: game.id,
      one: next.one,
      two: next.two,
    });
    setPendingScoreCount(pendingScoresForEvent(event.id).length);
    setSyncState(navigator.onLine ? "syncing" : "offline");
    if (navigator.onLine) {
      scoreSaveChains.current[game.id] = (
        scoreSaveChains.current[game.id] || Promise.resolve()
      ).then(() => syncPendingScore(entry));
    }
    if (
      Math.max(next.one, next.two) >= game.points_to_win &&
      next.one !== next.two
    )
      setCompletionPrompt({ game, score: next });
  }

  async function syncOfflineGameDay() {
    if (!navigator.onLine) return false;
    const operations = pendingGameDayOperations(event.id);
    setPendingOperationCount(operations.length);
    setSyncState(operations.length ? "syncing" : "synced");
    for (const operation of operations) {
      const { type, payload } = operation;
      let error = null;
      if (type === "create_match") {
        ({ error } = await supabase.from("games").upsert(payload.game));
        if (!error)
          ({ error } = await supabase
            .from("game_players")
            .upsert(payload.participants));
        if (!error)
          ({ error } = await supabase
            .from("game_queue")
            .update({ status: "assigned" })
            .eq("event_id", event.id)
            .in("player_registration_id", payload.playerIds));
      } else if (type === "assign_match") {
        ({ error } = await supabase
          .from("games")
          .update({ court_id: payload.courtId })
          .eq("id", payload.gameId));
        if (!error)
          ({ error } = await supabase
            .from("event_courts")
            .update({ status: "in_use" })
            .eq("id", payload.courtId));
      } else if (type === "start_game") {
        ({ error } = await supabase
          .from("games")
          .update({ status: "playing", started_at: payload.startedAt })
          .eq("id", payload.gameId));
      } else if (type === "complete_game") {
        ({ error } = await supabase
          .from("games")
          .update({
            status: "completed",
            team_one_score: payload.one,
            team_two_score: payload.two,
            winner_team: payload.winnerTeam,
            completed_at: payload.completedAt,
          })
          .eq("id", payload.gameId));
        if (!error && payload.courtId)
          ({ error } = await supabase
            .from("event_courts")
            .update({ status: "available" })
            .eq("id", payload.courtId));
        if (!error && payload.queueUpdates?.length) {
          for (const update of payload.queueUpdates) {
            const result = await supabase
              .from("game_queue")
              .update({
                status: "waiting",
                position: update.position,
                joined_at: update.joinedAt,
              })
              .eq("event_id", event.id)
              .eq("player_registration_id", update.playerId);
            if (result.error) {
              error = result.error;
              break;
            }
          }
        }
      }
      if (error) {
        setSyncState("error");
        setMessage(`Offline changes are safe on this browser and will retry: ${error.message}`);
        return false;
      }
      acknowledgeGameDayOperation(operation.id);
      setPendingOperationCount(pendingGameDayOperations(event.id).length);
      if (type === "complete_game") {
        pendingScoresForEvent(event.id)
          .filter((entry) => entry.gameId === payload.gameId)
          .forEach(acknowledgePendingScore);
      }
    }
    const scoresSynced = await flushPendingScores();
    if (!scoresSynced) return false;
    setPendingOperationCount(0);
    setSyncState("synced");
    await load();
    setMessage("Offline Game Day changes synced successfully.");
    return true;
  }

  async function flushPendingScores() {
    if (!navigator.onLine) return false;
    const pending = pendingScoresForEvent(event.id);
    if (!pending.length) {
      setPendingScoreCount(0);
      setSyncState("synced");
      return true;
    }
    setSyncState("syncing");
    for (const entry of pending) {
      const synced = await syncPendingScore(entry);
      if (!synced) return false;
    }
    return true;
  }

  async function completeGame(game, scoreOverride) {
    if (navigator.onLine)
      await (scoreSaveChains.current[game.id] || Promise.resolve());
    if (
      navigator.onLine &&
      pendingScoresForEvent(event.id).some((entry) => entry.gameId === game.id)
    ) {
      const synced = await flushPendingScores();
      if (!synced) {
        setMessage("Please wait for the final score to sync before completing the game.");
        return false;
      }
    }
    const score = scoreOverride || scores[game.id] || { one: 0, two: 0 };
    const one = Number(score.one),
      two = Number(score.two);
    if (Math.max(one, two) < game.points_to_win) {
      setMessage(
        `A result cannot be recorded until one team reaches ${game.points_to_win} points.`,
      );
      return false;
    }
    if (one === two) {
      setMessage("The game cannot finish with a tied score.");
      return false;
    }
    const winner_team = one > two ? 1 : 2;
    const completed_at = new Date().toISOString();
    const participantIds = gamePlayers
      .filter((entry) => entry.game_id === game.id)
      .map((entry) => entry.player_registration_id);
    const queueEnd = waiting.length
      ? Math.max(...waiting.map((entry) => entry.position))
      : 0;
    const returnedAt = new Date().toISOString();
    const queueUpdates =
      game.format === "open_play"
        ? participantIds.map((playerId, index) => ({
            playerId,
            position: queueEnd + index + 1,
            joinedAt: returnedAt,
          }))
        : [];
    if (!navigator.onLine) {
      enqueueGameDayOperation(event.id, "complete_game", {
        gameId: game.id,
        courtId: game.court_id,
        one,
        two,
        winnerTeam: winner_team,
        completedAt: completed_at,
        queueUpdates,
      });
      setPendingOperationCount(pendingGameDayOperations(event.id).length);
      if (queueUpdates.length)
        setQueue((current) =>
          current.map((entry) => {
            const update = queueUpdates.find(
              (item) => item.playerId === entry.player_registration_id,
            );
            return update
              ? {
                  ...entry,
                  status: "waiting",
                  position: update.position,
                  joined_at: update.joinedAt,
                }
              : entry;
          }),
        );
      setGames((current) =>
        current.map((item) =>
          item.id === game.id
            ? {
                ...item,
                status: "completed",
                team_one_score: one,
                team_two_score: two,
                winner_team,
                completed_at,
              }
            : item,
        ),
      );
      setCourts((current) =>
        current.map((court) =>
          court.id === game.court_id
            ? { ...court, status: "available" }
            : court,
        ),
      );
      setMessage(
        `Offline · Game ${game.game_number} completed. The next match can continue now.`,
      );
      return true;
    }
    const { error } = await supabase
      .from("games")
      .update({
        status: "completed",
        team_one_score: one,
        team_two_score: two,
        winner_team,
        completed_at,
      })
      .eq("id", game.id);
    if (error) {
      setMessage(error.message);
      return false;
    }
    const nextCourtStatus = "available";
    await supabase
      .from("event_courts")
      .update({ status: nextCourtStatus })
      .eq("id", game.court_id);
    if (game.format === "open_play") {
      await Promise.all(
        participantIds.map((playerId, index) =>
          supabase
            .from("game_queue")
            .update({
              status: "waiting",
              position: queueEnd + index + 1,
              joined_at: returnedAt,
            })
            .eq("event_id", event.id)
            .eq("player_registration_id", playerId),
        ),
      );
      setQueue(
        queue.map((entry) => {
          const index = participantIds.indexOf(entry.player_registration_id);
          return index >= 0
            ? {
                ...entry,
                status: "waiting",
                position: queueEnd + index + 1,
                joined_at: returnedAt,
              }
            : entry;
        }),
      );
    }
    setGames(
      games.map((item) =>
        item.id === game.id
          ? {
              ...item,
              status: "completed",
              team_one_score: one,
              team_two_score: two,
              winner_team,
              completed_at,
            }
          : item,
      ),
    );
    setCourts(
      courts.map((court) =>
        court.id === game.court_id
          ? { ...court, status: nextCourtStatus }
          : court,
      ),
    );
    setMessage(
      game.format === "open_play"
          ? `Game ${game.game_number} recorded. All four players returned to the back of the queue.`
          : `Game ${game.game_number} recorded. Players can be added back to the queue.`,
    );
    return true;
  }

  async function confirmGameCompletion() {
    if (!completionPrompt || completingGame) return;
    setCompletingGame(true);
    const completed = await completeGame(
      completionPrompt.game,
      completionPrompt.score,
    );
    setCompletingGame(false);
    if (completed) setCompletionPrompt(null);
  }

  function changeLiveScore(game, team, change) {
    if (eventEnded) return;
    const key = team === 1 ? "one" : "two";
    setScores((currentScores) => {
      const current = currentScores[game.id] || { one: 0, two: 0 };
      const next = {
        ...current,
        [key]: Math.max(0, Number(current[key] || 0) + change),
      };
      const entry = savePendingScore({
        mode: "organizer",
        eventId: event.id,
        gameId: game.id,
        one: next.one,
        two: next.two,
      });
      setPendingScoreCount(pendingScoresForEvent(event.id).length);
      setSyncState(navigator.onLine ? "syncing" : "offline");
      setIsOnline(navigator.onLine);
      scoreSaveChains.current[game.id] = (
        scoreSaveChains.current[game.id] || Promise.resolve()
      ).then(() => syncPendingScore(entry));
      const one = Number(next.one || 0),
        two = Number(next.two || 0);
      if (Math.max(one, two) >= game.points_to_win && one !== two)
        setCompletionPrompt({ game, score: next });
      return { ...currentScores, [game.id]: next };
    });
  }

  function participants(game, team) {
    return gamePlayers
      .filter(
        (entry) => entry.game_id === game.id && entry.team_number === team,
      )
      .map((entry) => playerName(players, entry.player_registration_id))
      .join(" & ");
  }

  if (loading)
    return (
      <section className="profile-card">
        <p>Loading game day…</p>
      </section>
    );
  return (
    <section className="game-day-page">
      {displayLink && createPortal(<div className="modal-backdrop viewport-top-backdrop"><section className="game-complete-dialog scorer-link-dialog" role="dialog" aria-modal="true">
        <span className="dialog-icon"><MonitorUp size={25} /></span><span className="eyebrow">Smart TV display</span>
        <h2>Event Match Board</h2><p className="muted">Open this link on the club TV. It updates automatically and remains valid for 7 days.</p>
        <div className="scorer-qr-wrap"><QRCodeCanvas id="event-display-qr" value={displayLink.url} size={220} level="H" marginSize={2} title="Match Board QR code" /><strong>Scan to open Match Board</strong><span>Valid for 7 days</span></div>
        <input readOnly value={displayLink.url} onFocus={(e) => e.target.select()} />
        <div className="dialog-actions"><button className="button button-secondary" onClick={() => setDisplayLink(null)}>Close</button><button className="button button-secondary" onClick={downloadDisplayQr}><Download size={17} /> QR code</button><button className="button button-secondary" onClick={() => window.open(displayLink.url, "_blank", "noopener,noreferrer")}><ExternalLink size={17} /> Open board</button><button className="button button-primary" onClick={copyDisplayLink}><Copy size={17} /> Copy link</button></div>
      </section></div>, document.body)}
      {scoringLink && createPortal(
        <div className="modal-backdrop viewport-top-backdrop">
          <section className="game-complete-dialog scorer-link-dialog" role="dialog" aria-modal="true" aria-labelledby="scorer-link-title">
            <span className="dialog-icon"><Link size={25} /></span>
            <span className="eyebrow">Temporary umpire access</span>
            <h2 id="scorer-link-title">{scoringLink.court.name} scoring link</h2>
            <p className="muted">Anyone with this link can update this court’s live score for 24 hours. Only the organizer can confirm the result.</p>
            <div className={`direct-sync-callout ${directConnections[scoringLink.court.id] || "waiting"}`}>
              <Radio size={18} />
              <span><strong>Direct device sync</strong>{directConnections[scoringLink.court.id] === "connected" ? "Connected to scoring device" : directConnections[scoringLink.court.id] === "error" ? "Pairing unavailable · online scoring still works" : "Waiting for the scoring device to scan this QR"}</span>
            </div>
            <div className="offline-pairing-box">
              <div><strong>Pair with no internet</strong><span>Both devices must be on the same Wi-Fi or hotspot.</span></div>
              {!offlinePairing || offlinePairing.court.id !== scoringLink.court.id ? (
                <button className="button button-secondary" type="button" onClick={beginOfflinePairing}><Radio size={17} /> Pair offline</button>
              ) : offlinePairing.status === "creating" ? <p>Preparing secure local pairing…</p>
                : offlinePairing.offerUrl ? <>
                  <div className="offline-offer-qr"><QRCodeCanvas value={offlinePairing.offerUrl} size={260} level="L" marginSize={2} /><strong>1. Scan this on the scoring device</strong><span>It will display a response QR.</span></div>
                  <details className="offline-code-fallback"><summary>Scorer cannot scan? Copy organizer offer code</summary><textarea readOnly value={offlinePairing.offerCode || ""} onFocus={(event) => event.target.select()} /></details>
                  <div className="offline-answer-actions"><strong>2. Scan the response QR</strong><button className="button button-primary" type="button" onClick={() => setShowOfflineScanner(true)}><Camera size={17} /> Scan response</button></div>
                  {showOfflineScanner && <QrScanner title="Scan scorer response" onClose={() => setShowOfflineScanner(false)} onResult={acceptOfflineAnswer} />}
                  <label>Or paste the response code from the scoring device<textarea value={offlineAnswer} onChange={(event) => setOfflineAnswer(event.target.value)} placeholder="pickleflow-answer:…" /></label>
                  <button className="button button-secondary" type="button" disabled={!offlineAnswer.trim()} onClick={() => acceptOfflineAnswer()}>Use response code</button>
                </> : <button className="button button-secondary" type="button" onClick={beginOfflinePairing}>Try again</button>}
              {offlinePairing?.court.id === scoringLink.court.id && offlinePairing.status === "connected" && <p className="offline-connected"><Check size={16} /> Fully offline connection established.</p>}
              {offlinePairing?.court.id === scoringLink.court.id && offlinePairing.status === "blocked" && <p className="offline-blocked">The response code was accepted, but the devices could not make a direct connection. Put both devices on the same Wi-Fi or phone hotspot, turn off VPN and iCloud Private Relay, and make sure the Wi-Fi does not isolate connected devices. Then pair again.</p>}
            </div>
            <div className="scorer-qr-wrap">
              <QRCodeCanvas
                id="court-scoring-qr"
                value={scoringLink.url}
                size={220}
                level="H"
                marginSize={2}
                title={`${scoringLink.court.name} scoring QR code`}
              />
              <strong>Scan to score {scoringLink.court.name}</strong>
              <span>Valid for 24 hours</span>
            </div>
            <input readOnly value={scoringLink.url} onFocus={(event) => event.target.select()} />
            <div className="dialog-actions">
              <button className="button button-secondary" onClick={() => setScoringLink(null)}>Close</button>
              <button className="button button-secondary" onClick={downloadScoringQr}><Download size={17} /> QR code</button>
              <button className="button button-secondary" onClick={() => window.open(scoringLink.url, "_blank", "noopener,noreferrer")}><ExternalLink size={17} /> Open</button>
              <button className="button button-primary" onClick={copyScoringLink}><Copy size={17} /> Copy link</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {completionPrompt && createPortal(
        <div className="modal-backdrop viewport-top-backdrop">
          <section
            className="game-complete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-game-title"
          >
            <span className="dialog-icon">
              <Trophy size={25} />
            </span>
            <span className="eyebrow">Points to win reached</span>
            <h2 id="complete-game-title">
              Complete Game {completionPrompt.game.game_number}?
            </h2>
            <p className="muted">
              Please confirm the final score before closing the game.
            </p>
            <div className="completion-score">
              <div>
                <span>Team 1</span>
                <strong>{completionPrompt.score.one}</strong>
                <small>{participants(completionPrompt.game, 1)}</small>
              </div>
              <b>–</b>
              <div>
                <span>Team 2</span>
                <strong>{completionPrompt.score.two}</strong>
                <small>{participants(completionPrompt.game, 2)}</small>
              </div>
            </div>
            <p className="completion-winner">
              <Trophy size={17} /> Team{" "}
              {Number(completionPrompt.score.one) >
              Number(completionPrompt.score.two)
                ? "1"
                : "2"}{" "}
              will be recorded as the winner.
            </p>
            <div className="dialog-actions">
              <button
                className="button button-secondary"
                onClick={() => setCompletionPrompt(null)}
                disabled={completingGame}
              >
                Keep playing
              </button>
              <button
                className="button button-primary"
                onClick={confirmGameCompletion}
                disabled={completingGame}
              >
                <Check size={17} />{" "}
                {completingGame ? "Completing…" : "Confirm result"}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {showEndPrompt && createPortal(
        <div className="modal-backdrop viewport-top-backdrop" role="presentation" onMouseDown={() => !endingEvent && setShowEndPrompt(false)}>
          <section className="game-complete-dialog end-event-dialog" role="dialog" aria-modal="true" aria-labelledby="end-event-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="dialog-icon"><Flag size={25} /></span>
            <span className="eyebrow">Finish Game Day</span>
            <h2 id="end-event-title">End this event?</h2>
            <p className="muted">This marks the event as completed, cancels unfinished matches, frees all active courts, and disables further game actions. Completed results and leaderboards will remain available.</p>
            {activeGames.length > 0 && <p className="end-event-warning"><strong>{activeGames.length} unfinished {activeGames.length === 1 ? "match" : "matches"}</strong> will be cancelled.</p>}
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setShowEndPrompt(false)} disabled={endingEvent}>Keep event open</button>
              <button className="button button-danger" type="button" onClick={endEvent} disabled={endingEvent}><Flag size={17} /> {endingEvent ? "Ending event…" : "End event"}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {substitutionPrompt && (
        <div className="modal-backdrop">
          <section
            className="game-complete-dialog substitute-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="substitute-player-title"
          >
            <span className="dialog-icon">
              <RefreshCw size={25} />
            </span>
            <span className="eyebrow">Player substitution</span>
            <h2 id="substitute-player-title">
              Replace{" "}
              {playerName(
                players,
                substitutionPrompt.slot.player_registration_id,
              )}
              ?
            </h2>
            <p className="muted">
              The substitute takes the same team position. The current score
              will not change.
            </p>
            <label>
              Substitute player
              <select
                value={substitutePlayerId}
                onChange={(e) => setSubstitutePlayerId(e.target.value)}
              >
                <option value="">Select a checked-in player</option>
                {availableSubstitutes(substitutionPrompt.game).map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.full_name}
                  </option>
                ))}
              </select>
            </label>
            {!availableSubstitutes(substitutionPrompt.game).length && (
              <p className="form-message">
                No checked-in players are currently available.
              </p>
            )}
            <div className="dialog-actions">
              <button
                className="button button-secondary"
                onClick={() => setSubstitutionPrompt(null)}
                disabled={substituting}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={confirmSubstitution}
                disabled={!substitutePlayerId || substituting}
              >
                <RefreshCw size={17} />{" "}
                {substituting ? "Substituting…" : "Confirm substitution"}
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="section-title">
        <div>
          <span className="eyebrow">
            <Swords size={15} /> Game-day management
          </span>
          <h2>{event.name}</h2>
        </div>
        <div className="game-day-title-actions"><button className="page-guide-button" type="button" onClick={() => setShowPageTour(true)}><HelpCircle size={17} /> Guide</button><button className="button button-secondary" data-tour="game-settings" onClick={() => setShowSettings(true)} disabled={eventEnded}><Settings2 size={16} /> Game Settings</button><button className="button button-secondary" data-tour="match-board" onClick={openDisplayLink}><MonitorUp size={16} /> Match Board</button><button className={`button ${eventEnded ? "button-secondary" : "button-danger"}`} type="button" onClick={() => setShowEndPrompt(true)} disabled={eventEnded}><Flag size={16} /> {eventEnded ? "Event ended" : "End event"}</button><button className="button button-secondary" onClick={onBack}><ArrowLeft size={16} /> Event roster</button></div>
      </div>
      {eventEnded && <div className="event-ended-banner"><Flag size={18} /><span><strong>Event completed</strong> Game controls are disabled. Final standings and leaderboard downloads remain available below.</span></div>}
      <div className={`score-sync-status ${!isOnline ? "offline" : syncState}`} role="status">
        {!isOnline ? <WifiOff size={17} /> : <Wifi size={17} />}
        <span>
          {!isOnline
            ? `Offline Game Day · ${pendingChangeCount} ${pendingChangeCount === 1 ? "change" : "changes"} waiting to sync`
            : syncState === "syncing"
              ? `Syncing ${pendingChangeCount} ${pendingChangeCount === 1 ? "change" : "changes"}…`
              : syncState === "error"
                ? `${pendingChangeCount} ${pendingChangeCount === 1 ? "change" : "changes"} saved on this device`
                : "Online · Scores synced"}
        </span>
      </div>
      {message && <div className="form-message game-message">{message}</div>}
      <div className="game-day-summary">
        <div>
          <strong>{checkedIn.length}</strong>
          <span>Checked in</span>
        </div>
        <div>
          <strong>{waiting.length}</strong>
          <span>Waiting</span>
        </div>
        <div>
          <strong>{activeGames.length}</strong>
          <span>Active games</span>
        </div>
        <div>
          <strong>{completedGames.length}</strong>
          <span>Completed</span>
        </div>
      </div>
      {courts.length > 0 && <section className="court-overview" data-tour="court-overview" aria-label="Court overview">
        <div className="court-overview-heading"><strong>Court overview</strong><button type="button" onClick={() => setMonitoredCourt("")} className={!monitoredCourt ? "selected" : ""}>View all matches</button></div>
        <div className="court-overview-list">
          {courts.filter((court) => court.status !== "disabled").map((court) => {
            const liveGame = playingGameForCourt(court.id);
            const readyGame = activeGames.find((game) => game.court_id === court.id && game.status === "queued");
            const liveScore = liveGame ? scores[liveGame.id] || { one: liveGame.team_one_score || 0, two: liveGame.team_two_score || 0 } : null;
            return <button type="button" key={court.id} className={`court-overview-card ${monitoredCourt === court.id ? "selected" : ""} ${liveGame ? "playing" : readyGame ? "ready" : "available"}`} onClick={() => setMonitoredCourt(court.id)}>
              <span>{court.name}</span>
              {liveGame ? <><strong>{liveScore.one} <small>–</small> {liveScore.two}</strong><em>Game {liveGame.game_number} · Playing</em>{liveGame.service_tracking_active && <em className="court-serving">Team {liveGame.serving_team || 1} serving · Serve {liveGame.serve_number || 1}</em>}</>
                : readyGame ? <><strong>Game {readyGame.game_number}</strong><em>Ready to start</em></>
                  : <><strong>Available</strong><em>Waiting for match</em></>}
            </button>;
          })}
        </div>
      </section>}
      <div className="game-day-workspace">
        <div className="game-day-grid game-day-main">
        <section className="profile-card" data-tour="waiting-queue">
          <h3>
            <Clock3 size={19} /> Waiting queue
          </h3>
          {!waiting.length ? (
            <p className="muted">
              Checked-in players can be added to the queue.
            </p>
          ) : (
            <div className="queue-list">
              {waiting.map((entry, index) => (
                <label
                  className={`queue-row ${selectedPlayers.includes(entry.player_registration_id) ? "selected" : ""}`}
                  key={entry.id}
                >
                  <input
                    type="checkbox"
                    disabled={eventEnded}
                    checked={selectedPlayers.includes(
                      entry.player_registration_id,
                    )}
                    onChange={() =>
                      toggleSelected(entry.player_registration_id)
                    }
                  />
                  <span className="queue-number">{index + 1}</span>
                  <div>
                    <strong>
                      {playerName(players, entry.player_registration_id)}
                    </strong>
                    <span>
                      Waiting{" "}
                      {Math.max(
                        0,
                        Math.floor(
                          (Date.now() - new Date(entry.joined_at)) / 60000,
                        ),
                      )}{" "}
                      min
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={eventEnded}
                    onClick={(e) => {
                      e.preventDefault();
                      removeFromQueue(entry.player_registration_id);
                    }}
                  >
                    <X size={15} />
                  </button>
                </label>
              ))}
            </div>
          )}
          <div className="match-builder">
            {event.game_format === "open_play" && (
              <button
                className="button button-secondary"
                onClick={selectNextPlayers}
                disabled={eventEnded || waiting.length < 4}
              >
                Select next four players
              </button>
            )}
            <button
              className="button button-primary"
              onClick={createMatch}
              disabled={eventEnded || selectedPlayers.length !== playersNeeded}
            >
              <Swords size={16} /> Create match ({selectedPlayers.length}/
              {playersNeeded})
            </button>
            <small>
              {event.game_format === "open_play"
                ? "Queue order assigns the first two to Team 1 and the next two to Team 2. The pairing waits in Next Match until a court opens."
                : "Selection order assigns Team 1, then Team 2. The pairing waits in Next Match until a court opens."}
            </small>
          </div>
        </section>
        <section className="profile-card">
          <div className="match-panel-heading">
            <h3>
              <Play size={19} /> Matches
            </h3>
            <select
              aria-label="Monitor a court"
              value={monitoredCourt}
              onChange={(e) => setMonitoredCourt(e.target.value)}
            >
              <option value="">All courts</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </div>
          <div className="match-list">
            {monitoredGames.map((game) => (
              <article
                className={`match-card ${game.status} ${isNextMatch(game) ? "next-match" : ""}`}
                key={game.id}
              >
                <div className="match-card-title">
                  <strong>
                    Game {game.game_number} ·{" "}
                    {courts.find((court) => court.id === game.court_id)?.name ||
                      "Waiting for a court"}
                  </strong>
                  <span
                    className={`status-badge ${isNextMatch(game) ? "next-match" : game.status}`}
                  >
                    {isNextMatch(game) ? "Next match · Unassigned" : game.status}
                  </span>
                </div>
                <div className="teams">
                  <div className="team-with-subs">
                    <span>Team 1</span>
                    {gamePlayers
                      .filter(
                        (entry) =>
                          entry.game_id === game.id && entry.team_number === 1,
                      )
                      .map((slot) => (
                        <div className="participant-row" key={slot.id}>
                          <strong>
                            {playerName(players, slot.player_registration_id)}
                          </strong>
                          <button
                            type="button"
                            onClick={() => openSubstitution(game, slot)}
                            disabled={eventEnded}
                            aria-label={`Substitute ${playerName(players, slot.player_registration_id)}`}
                            title="Substitute player"
                          >
                            <RefreshCw size={14} /> Sub
                          </button>
                        </div>
                      ))}
                  </div>
                  <span>vs</span>
                  <div className="team-with-subs">
                    <span>Team 2</span>
                    {gamePlayers
                      .filter(
                        (entry) =>
                          entry.game_id === game.id && entry.team_number === 2,
                      )
                      .map((slot) => (
                        <div className="participant-row" key={slot.id}>
                          <strong>
                            {playerName(players, slot.player_registration_id)}
                          </strong>
                          <button
                            type="button"
                            onClick={() => openSubstitution(game, slot)}
                            disabled={eventEnded}
                            aria-label={`Substitute ${playerName(players, slot.player_registration_id)}`}
                            title="Substitute player"
                          >
                            <RefreshCw size={14} /> Sub
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
                {game.status === "queued" ? (
                  <button
                    className="button button-primary button-full"
                    onClick={() => startGame(game)}
                    disabled={eventEnded || !game.court_id}
                  >
                    <Play size={16} />
                    {!game.court_id ? "Waiting for an available court" : "Start game"}
                  </button>
                ) : (
                  <div className="live-score">
                    <div>
                      <span>Team 1</span>
                      <div className="score-control">
                        <button
                          disabled={eventEnded}
                          onClick={() => changeLiveScore(game, 1, -1)}
                          aria-label="Subtract Team 1 point"
                        >
                          −
                        </button>
                        <strong>{scores[game.id]?.one || 0}</strong>
                        <button
                          disabled={eventEnded}
                          onClick={() => changeLiveScore(game, 1, 1)}
                          aria-label="Add Team 1 point"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <b>First to {game.points_to_win}</b>
                    <div>
                      <span>Team 2</span>
                      <div className="score-control">
                        <button
                          disabled={eventEnded}
                          onClick={() => changeLiveScore(game, 2, -1)}
                          aria-label="Subtract Team 2 point"
                        >
                          −
                        </button>
                        <strong>{scores[game.id]?.two || 0}</strong>
                        <button
                          disabled={eventEnded}
                          onClick={() => changeLiveScore(game, 2, 1)}
                          aria-label="Add Team 2 point"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            ))}
            {!monitoredGames.length && (
              <p className="muted">No queued or active matches.</p>
            )}
          </div>
        </section>
        </div>
        <div className="game-day-grid game-day-management">
          {showSettings && createPortal(<div className="modal-backdrop viewport-top-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section className="game-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="game-settings-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span className="eyebrow">Game Day setup</span><h2 id="game-settings-title"><Settings2 size={21} /> Game settings & courts</h2></div><button type="button" onClick={() => setShowSettings(false)} aria-label="Close game settings"><X /></button></header>
          <div className="settings-content">
            <div className="form-row">
              <label>
                Format
                <select
                  value={event.game_format || "doubles"}
                  onChange={(e) =>
                    updateEventSettings("game_format", e.target.value)
                  }
                >
                  <option value="open_play">Open Play</option>
                  <option value="singles">Singles</option>
                  <option value="doubles">Doubles</option>
                  <option value="mixed_doubles">Mixed doubles</option>
                </select>
              </label>
              <label>
                Points to win
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={event.points_to_win || 11}
                  onChange={(e) =>
                    updateEventSettings("points_to_win", e.target.value)
                  }
                />
              </label>
            </div>
            <label className="auto-assign-toggle" data-tour="auto-assign">
              <input
                type="checkbox"
                checked={Boolean(event.auto_assign_next_players)}
                onChange={(e) =>
                  updateEventSettings(
                    "auto_assign_next_players",
                    e.target.checked,
                  )
                }
              />
              <span>
                <strong>Auto-assign next players</strong>
                <small>
                  Pair the next waiting players first, then assign them when a
                  court becomes available.
                </small>
              </span>
            </label>
            {event.game_format === "open_play" && (
              <div className="open-play-note">
                <strong>Four on, four off</strong>
                <span>
                  The next four waiting players take the court. After the
                  result, all four return to the back of the queue.
                </span>
              </div>
            )}
            <h3 className="subheading">Courts</h3>
            <form className="court-form" data-tour="add-court" onSubmit={addCourt}>
              <input
                required
                placeholder="Court name or number"
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
              />
              <button className="button button-primary">
                <Plus size={16} /> Add
              </button>
            </form>
            <div className="court-list">
              {courts.map((court) => (
                <div className="court-access-item" key={court.id}>
                  {editingCourtId === court.id ? <form className="court-rename-form" onSubmit={(e) => renameCourt(e, court)}>
                    <input autoFocus required aria-label={`Rename ${court.name}`} value={editingCourtName} onChange={(e) => setEditingCourtName(e.target.value)} maxLength="80" />
                    <button type="submit" className="court-icon-button save" disabled={savingCourtName || !editingCourtName.trim()} aria-label="Save court name" title="Save"><Check size={17} /></button>
                    <button type="button" className="court-icon-button" onClick={cancelCourtRename} disabled={savingCourtName} aria-label="Cancel court rename" title="Cancel"><X size={17} /></button>
                  </form> : <>
                    <button className={`court-chip ${court.status}`} disabled={court.status === "in_use"} onClick={() => toggleCourt(court)}>
                      {court.name}<span>{court.status.replace("_", " ")}</span>
                    </button>
                    <button className="court-icon-button" onClick={() => beginCourtRename(court)} aria-label={`Edit ${court.name} name`} title="Edit court name"><Edit3 size={17} /></button>
                    <button className="court-link-button" data-tour="scoring-link" onClick={() => openScoringLink(court)} aria-label={`Create ${court.name} scoring link`} title="Umpire scoring link"><Link size={17} /></button>
                    {directConnections[court.id] && <span className={`direct-court-status ${directConnections[court.id]}`} title="Direct device sync"><Radio size={13} />{directConnections[court.id] === "connected" ? "Direct" : "Pairing"}</span>}
                  </>}
                </div>
              ))}
              {!courts.length && (
                <p className="muted">
                  Add at least one court to create matches.
                </p>
              )}
            </div>
          </div>
          <footer><button className="button button-primary" type="button" onClick={() => setShowSettings(false)}><Check size={17} /> Done</button></footer>
          </section></div>, document.body)}
        <section className="profile-card" data-tour="player-checkin">
          <h3>
            <UserCheck size={19} /> Player check-in
          </h3>
          <form className="game-day-player-form" onSubmit={addNewPlayer}>
            <input
              required
              aria-label="New player name"
              placeholder="New player name"
              value={newPlayer.full_name}
              onChange={(e) =>
                setNewPlayer({ ...newPlayer, full_name: e.target.value })
              }
            />
            <select
              aria-label="New player skill level"
              value={newPlayer.skill_level}
              onChange={(e) =>
                setNewPlayer({ ...newPlayer, skill_level: e.target.value })
              }
            >
              <option value="novice">Novice</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="competitive">Competitive</option>
            </select>
            <button className="button button-primary" disabled={addingPlayer}>
              <Plus size={16} />
              {addingPlayer ? "Adding…" : "Add new player"}
            </button>
          </form>
          <small className="game-day-player-help">
            New players are automatically checked in and added to the queue.
          </small>
          <div className="checkin-list">
            {players.map((player) => {
              const queued =
                queue.find(
                  (entry) => entry.player_registration_id === player.id,
                )?.status === "waiting";
              const inGame = activePlayerIds.has(player.id);
              return (
                <div className="checkin-row" key={player.id}>
                  <div>
                    <strong>{player.full_name}</strong>
                    <span className="capitalize">{player.skill_level}</span>
                  </div>
                  <div className="checkin-actions">
                    <button
                      className={`small-action ${player.checked_in_at ? "checked" : ""}`}
                      disabled={Boolean(player.checked_in_at)}
                      onClick={() => checkInPlayer(player)}
                    >
                      {player.checked_in_at ? (
                        <>
                          <Check size={15} /> Checked In
                        </>
                      ) : (
                        "Check in"
                      )}
                    </button>
                    {player.checked_in_at && (
                      <button
                        className={`small-action ${inGame ? "checked" : ""}`}
                        disabled={inGame}
                        onClick={() =>
                          !queued && !inGame ? addToQueue(player.id) : undefined
                        }
                      >
                        {inGame ? "In-Game" : queued ? "Waiting" : "Join queue"}
                      </button>
                    )}
                    <button
                      className="small-action player-out-action"
                      disabled={!player.checked_in_at || inGame}
                      onClick={() => markPlayerOut(player)}
                      title={
                        inGame
                          ? "Substitute this player before marking them out"
                          : "Remove from Game Day participation"
                      }
                    >
                      Out
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </section>
        </div>
      <ContextualTour open={showPageTour} onClose={() => setShowPageTour(false)} storageKey="pickleflow-tour-game-day" steps={[
        { selector: '[data-tour="game-settings"]', title: "Adjust Game Settings", text: "Open this when you need to change the format, points to win, automatic matching, or court names and scoring links." },
        { selector: '[data-tour="court-overview"]', title: "See every court", text: "Court cards show which games are playing, their live scores, and which team is serving." },
        { selector: '[data-tour="player-checkin"]', title: "Check players in", text: "When someone arrives, tap Check In. Tap Join Queue when that player is ready for a match." },
        { selector: '[data-tour="waiting-queue"]', title: "Watch the waiting queue", text: "Players wait here in order. PickleFlow uses this list when building the next match." },
        { selector: '[data-tour="match-board"]', title: "Open the venue display", text: "Use Match Board on a TV or large monitor so players can follow scores, queues, and upcoming games." },
      ]} />
      <div className="game-day-grid game-day-results">
        <section className="profile-card">
          <h3>
            <Trophy size={19} /> Event standings
          </h3>
          <div className="player-table-wrap">
            <table className="player-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Played</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win %</th>
                  <th>Total score</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((player, index) => (
                  <tr key={player.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{player.full_name}</strong>
                    </td>
                    <td>{player.played}</td>
                    <td>{player.wins}</td>
                    <td>{player.losses}</td>
                    <td>{player.played ? `${player.winRate.toFixed(1)}%` : "—"}</td>
                    <td><strong>{player.accumulatedScore}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="profile-card">
          <h3>
            <RotateCcw size={19} /> Recent results
          </h3>
          <div className="result-list">
            {completedGames.slice(0, 8).map((game) => (
              <div key={game.id}>
                <strong>
                  Game {game.game_number}: {game.team_one_score}–
                  {game.team_two_score}
                </strong>
                <span>
                  {game.winner_team === 1
                    ? participants(game, 1)
                    : participants(game, 2)}{" "}
                  won
                </span>
              </div>
            ))}
            {!completedGames.length && (
              <p className="muted">
                Results will appear after the first completed game.
              </p>
            )}
          </div>
        </section>
      <section className="leaderboard-section">
        <div className="leaderboard-heading"><div><span className="eyebrow"><Trophy size={15} /> Player highlights</span><h2>Champion & Top 5 leaderboards</h2></div><p>Updated from completed game results.</p></div>
        <article className={`overall-champion-card ${championship.champions.length > 1 ? "tied" : ""}`}>
          <div className="champion-crown"><Crown /></div>
          <div className="champion-copy">
            <span>{championship.champions.length > 1 ? "Open Play Co-Champions" : "Open Play Overall Champion"}</span>
            {championship.champions.length ? <>
              <h3>{championship.champions.map((player) => player.full_name).join(" & ")}</h3>
              <p>{championship.champions[0].winRate.toFixed(1)}% winning percentage · {championship.champions[0].wins} wins · {championship.champions[0].pointDifferential >= 0 ? "+" : ""}{championship.champions[0].pointDifferential} point differential</p>
              <small>Eligibility: at least {championship.minimumGames} {championship.minimumGames === 1 ? "game" : "games"} played · Tie-breakers: wins, point differential, total score, then fewest points allowed.</small>
            </> : <><h3>Complete games to determine the champion</h3><p>The champion will appear as results are recorded.</p></>}
          </div>
          <button className="button champion-download" type="button" onClick={() => downloadLeaderboard("champion")} disabled={!championship.champions.length}><Download size={17} /> Champion image</button>
        </article>
        <div className="leaderboard-grid">
          <article className="leaderboard-card winning">
            <header><div><span>Top performers</span><h3>Winning percentage</h3></div><button className="button button-secondary" type="button" onClick={() => downloadLeaderboard("wins")} disabled={!topWinPercentage.length}><Download size={16} /> Image</button></header>
            <ol>{topWinPercentage.map((player) => <li key={player.id}><b>{player.full_name}</b><span>{player.wins} wins · {player.played} games</span><strong>{player.winRate.toFixed(1)}%</strong></li>)}</ol>
            {!topWinPercentage.length && <p className="muted">Complete a game to see the leaders.</p>}
          </article>
          <article className="leaderboard-card scoring">
            <header><div><span>Point leaders</span><h3>Total accumulated score</h3></div><button className="button button-secondary" type="button" onClick={() => downloadLeaderboard("scores")} disabled={!topAccumulatedScore.length}><Download size={16} /> Image</button></header>
            <ol>{topAccumulatedScore.map((player) => <li key={player.id}><b>{player.full_name}</b><span>{player.wins} wins · {player.played} games</span><strong>{player.accumulatedScore}</strong></li>)}</ol>
            {!topAccumulatedScore.length && <p className="muted">Complete a game to see the leaders.</p>}
          </article>
        </div>
      </section>
      </div>
      </div>
    </section>
  );
}

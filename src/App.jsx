import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Heart,
  HelpCircle,
  FileUp,
  LogOut,
  LocateFixed,
  MapPin,
  MonitorUp,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  MessageSquarePlus,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  Users,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import GameDay from "./GameDay";
import CourtScoring from "./CourtScoring";
import MatchBoard from "./MatchBoard";
import ContextualTour from "./ContextualTour";

const emptyProfile = {
  full_name: "",
  organization_name: "",
  phone: "",
  city: "",
  country: "Philippines",
};
const emptyEvent = {
  name: "",
  description: "",
  venue: "",
  city: "",
  event_date: "",
  start_time: "",
  play_end_time: "",
  registration_limit: 32,
  organizer_contact_phone: "",
  location_lat: null,
  location_lng: null,
  status: "open",
  game_format: "open_play",
  points_to_win: 11,
  skill_matching_mode: "balanced",
  auto_assign_next_players: true,
};
const emptyPlayer = {
  full_name: "",
  email: "",
  phone: "",
  skill_level: "beginner",
};

async function sendNotification(type, payload) {
  try {
    await supabase.functions.invoke("send-notification", { body: { type, ...payload } });
  } catch {
    // Notifications never block the organizer's primary action.
  }
}

function playerRegistrationError(error) {
  if (error.code !== "23505") return error.message;
  if ((error.message || "").toLowerCase().includes("name"))
    return "A player with this name is already registered for this event.";
  return "That email address or phone number is already registered for this event.";
}

function registrationClientId() {
  const key = "pickleflow-registration-client";
  try {
    let value = window.localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      window.localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

const formatDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString();
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

const PUBLIC_PAGES = {
  "/how-it-works": {
    path: "/how-it-works",
    eyebrow: "From signup to final score",
    title: "How PickleFlow Keeps Game Day Moving",
    seoTitle: "How PickleFlow Works | Pickleball Event Workflow",
    description: "See how organizers use PickleFlow to create an event, register players, run fair open play, score matches, and share live court updates.",
    intro: "PickleFlow connects registration, player check-in, court assignments, scoring, standings, and venue displays in one mobile-friendly organizer workflow.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow Game Day organizer dashboard showing courts and player queue",
    updated: "October 21, 2026",
    steps: [
      ["Create the event", "Set the schedule, venue, player limit, courts, game format, and points to win."],
      ["Share registration", "Send one registration link or QR code so players can join from any phone."],
      ["Check in players", "Confirm arrivals, add walk-ins, import a list, and place available players in the queue."],
      ["Run every court", "Prepare the next matches, score from court-side phones, and handle substitutions."],
      ["Display live updates", "Show current scores, next matches, waiting players, and winners on a shared Match Board."],
    ],
    related: ["/open-play-management", "/offline-scoring", "/court-management"],
  },
  "/pickleball-event-management": {
    path: "/pickleball-event-management",
    eyebrow: "Pickleball event management",
    title: "One Organized Home for Your Pickleball Event",
    seoTitle: "Pickleball Event Management Software | PickleFlow",
    description: "Free pickleball event management software for organizer registration, player lists, check-ins, court assignments, queues, and event reports.",
    intro: "Replace scattered spreadsheets, paper lists, and group-chat updates with an organizer workspace designed for community events and club game days.",
    image: "/product-previews/event-roster.svg",
    imageAlt: "PickleFlow event roster and player management screen",
    updated: "October 21, 2026",
    steps: [
      ["Simple player registration", "Share a link or QR code and collect player names, skill levels, and optional contact details."],
      ["Flexible roster tools", "Add walk-ins, import CSV lists, prevent duplicate names, substitute players, and export event details."],
      ["Mobile check-in", "See who has arrived and move players from check-in to the waiting queue with clear statuses."],
      ["Multiple courts", "Monitor active and next matches per court without losing sight of the full event."],
    ],
    limitations: "PickleFlow currently focuses on event and open-play operations. Club membership billing and recurring subscriptions are not part of the current organizer workflow.",
    related: ["/how-it-works", "/court-management", "/player-standings"],
  },
  "/open-play-management": {
    path: "/open-play-management",
    eyebrow: "Fair player rotation and live scoring",
    title: "Pickleball Open Play Management Made Simple",
    seoTitle: "Pickleball Open Play Organizer & Scoring App | PickleFlow",
    description: "Organize pickleball open play with fair player rotation, court assignments, live scoring, standings, and offline support. Explore PickleFlow.",
    intro: "Pickleball open play management software helps organizers coordinate player registration, check-ins, court assignments, partner rotations, scoring, and event standings. PickleFlow brings those activities into one web-based workspace.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow open play organizer dashboard with multiple courts and waiting queue",
    updated: "October 21, 2026",
    definition: "PickleFlow is designed for small clubs, community organizers, and private game days that need a transparent player queue, multi-court match flow, live scoring, and results without maintaining separate spreadsheets.",
    sections: [
      {
        title: "What Is Pickleball Open Play Management Software?",
        copy: "It is a tool for coordinating who is ready to play, who is already on court, which match is next, and how completed games affect standings. PickleFlow keeps these states connected so organizers do not have to update several lists."
      },
      {
        title: "Common Challenges for Pickleball Organizers",
        copy: "Typical problems include unequal game counts, repeated partners, late arrivals, idle courts, hard-to-follow scores, and disputed standings. PickleFlow provides visible statuses and consistent assignment rules, but does not claim mathematically perfect fairness in every player and court combination."
      },
      {
        title: "How Fair Player Rotation Works",
        copy: "When automatic assignment is enabled, PickleFlow prioritizes waiting players with fewer completed games. For four-player Open Play matches, it evaluates available team combinations and chooses the arrangement with the fewest previous teammate pairings. Partner repetition can still occur when no unused pairing is available."
      },
      {
        title: "Managing Multiple Courts and Player Queues",
        copy: "The organizer sees checked-in, waiting, in-game, and out players alongside every court. A match may be paired before a court is free and remain court-pending until an available court can accept it. Only one active or queued match can occupy a court."
      },
      {
        title: "How Offline Scoring and Recovery Work",
        copy: "After the event has been loaded in the same browser, the organizer can continue adding and checking in players, changing queue status, pairing and assigning matches, and recording scores during a temporary interruption. Changes are stored locally and replayed in order when connectivity returns."
      },
      {
        title: "Understanding Standings and Overall Champions",
        copy: "Completed games feed games played, wins, losses, winning percentage, accumulated score, points allowed, and point differential. Overall Champion eligibility and tie-breakers are published on the standings guide so players can see how the result is determined."
      },
      {
        title: "PickleFlow and Other Pickleball Management Apps",
        copy: "PickleFlow emphasizes organizer-controlled Open Play, browser-based access, games-played-aware rotation, partner variety, offline continuity, and a large-screen Match Board. Evidence-based competitor comparisons will be published only after each capability and price is verified from dated sources."
      }
    ],
    faq: [
      ["Does PickleFlow guarantee every player the same number of games?", "No. It prioritizes players with fewer completed games, which is intended to reduce differences, but player arrivals, departures, substitutions, court availability, and event ending time can affect the final count."],
      ["Can a new player join after games have started?", "Yes. A newly checked-in player with no completed games can be prioritized when the other checked-in players have already played."],
      ["Does PickleFlow prevent repeated partners?", "It minimizes repeated teammate pairings when alternative combinations are available. Repeats may be necessary when the available player pool has no unused pairing."],
      ["Can organizers keep working without internet?", "Yes, for a previously loaded event in the same browser. Local changes synchronize after the connection returns. A browser that has never loaded the event cannot start a cold offline session."]
    ],
    limitations: "Offline Game Day depends on the event having been loaded previously in that browser and on local browser storage remaining available. Cross-device offline synchronization is not currently guaranteed.",
    related: ["/fair-player-rotation", "/offline-scoring", "/court-management", "/player-standings", "/faq"],
  },
  "/fair-player-rotation": {
    path: "/fair-player-rotation",
    eyebrow: "Transparent Open Play methodology",
    title: "How PickleFlow Rotates Players and Partners Fairly",
    seoTitle: "Fair Pickleball Player Rotation for Open Play | PickleFlow",
    description: "Learn how PickleFlow prioritizes fewer games played and reduces repeated doubles partnerships during pickleball open play.",
    intro: "Fair rotation is not simply first in, first out. PickleFlow considers completed game counts first, preserves queue order as a tie-breaker, and then arranges selected players to reduce repeated partnerships.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow waiting queue used for fair Open Play player rotation",
    updated: "October 21, 2026",
    article: true,
    sections: [
      { title: "Step 1: Prioritize Fewer Games Played", copy: "Waiting players are ranked by completed games. Players with fewer games are considered first, while queue position breaks ties between players with the same game count." },
      { title: "Step 2: Support Late Check-ins", copy: "When a newly checked-in player has zero games and every other checked-in player has already played, that player can be moved toward the front of the upcoming rotation." },
      { title: "Step 3: Reduce Repeated Partnerships", copy: "For a four-player Open Play match, PickleFlow compares the three possible doubles team arrangements and selects the arrangement with the lowest combined count of previous teammate pairings." },
      { title: "What the Method Does Not Guarantee", copy: "It does not guarantee identical waiting times, opponents, or final game totals. Departures, substitutions, odd player counts, disabled courts, and ending the event early can change the outcome." },
      { title: "Planned Evidence", copy: "A reproducible simulation for 12, 16, and 20 players across three to five courts is planned. Games-played spread, partner repetitions, waiting intervals, and court utilization will be published only after the test dataset is produced and reviewed." }
    ],
    faq: [
      ["What happens when all partnerships have already occurred?", "The system selects the available arrangement with the lowest recorded partnership repetition count."],
      ["Is queue position ignored?", "No. Queue position remains the tie-breaker when players have completed the same number of games."]
    ],
    related: ["/open-play-management", "/court-management", "/player-standings"],
  },
  "/offline-scoring": {
    path: "/offline-scoring",
    eyebrow: "Temporary connection-loss support",
    title: "Pickleball Scoring and Game Day Operations Without Internet",
    seoTitle: "Offline Pickleball Scoring & Game Day Operations | PickleFlow",
    description: "See which PickleFlow scoring, player, queue, and match actions continue during a temporary internet interruption and how reconnection sync works.",
    intro: "PickleFlow can continue selected Game Day operations in a browser that loaded the event while online. It saves changes locally, shows the pending-change count, and synchronizes them in order after reconnection.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow Offline Game Day controls and pending synchronization status",
    updated: "October 21, 2026",
    article: true,
    sections: [
      { title: "What Works During a Temporary Interruption", copy: "In the organizer browser, locally supported actions include adding a player, checking a player in, joining or leaving the queue, marking a player out, creating and assigning matches, starting games, recording scores, completing games, and returning Open Play participants to the queue." },
      { title: "How Local Recovery Works", copy: "The latest event state is cached in browser storage. Each change is added to an ordered outbox with a browser device identifier. When connectivity returns, PickleFlow replays pending operations before refreshing the server state." },
      { title: "Previously Loaded Browser Required", copy: "The organizer must load the event online at least once in the same browser. A new device or cleared browser cannot retrieve event data without a connection." },
      { title: "Current Limits", copy: "Local data can be lost if site storage is cleared. Fully offline synchronization between separate devices is not guaranteed. Court-scoring devices and the organizer browser may require reconnection before all screens show the same final state." },
      { title: "Recommended Organizer Practice", copy: "Open Game Day and confirm the event, players, and courts before arriving at a venue with unreliable signal. Keep the organizer tab open, avoid clearing browser data, and reconnect before closing the event." }
    ],
    faq: [
      ["Will offline changes overwrite online changes?", "Pending organizer-browser changes are replayed in their recorded order. Avoid using a second organizer device during the interruption because cross-device conflict merging is limited."],
      ["Can I open the event for the first time while fully offline?", "No. The browser needs a previously cached copy of that event."],
      ["How do I know changes are waiting?", "Game Day displays offline or syncing status together with the number of pending local changes."]
    ],
    limitations: "Offline support is intended for temporary signal loss in a previously loaded organizer browser. It is not a substitute for a server connection across multiple independent devices.",
    related: ["/open-play-management", "/how-it-works", "/court-management"],
  },
  "/court-management": {
    path: "/court-management",
    eyebrow: "Multi-court Game Day control",
    title: "Manage Pickleball Courts, Queues, and Upcoming Matches",
    seoTitle: "Pickleball Court & Queue Management | PickleFlow",
    description: "Manage multiple pickleball courts, waiting players, court-pending matches, mobile scoring links, and live venue updates with PickleFlow.",
    intro: "PickleFlow gives the organizer one view of court availability, active matches, the waiting queue, and the next paired match.",
    image: "/product-previews/match-board.svg",
    imageAlt: "PickleFlow multi-court Match Board with active and upcoming matches",
    updated: "October 21, 2026",
    sections: [
      { title: "Pair Before a Court Is Available", copy: "Automatic assignment can create the next fair match while all courts are busy. The match remains marked court-pending until a court becomes available." },
      { title: "Protect Each Court from Duplicate Assignments", copy: "PickleFlow prevents a second active or queued match from being assigned to a court that already has one. If older data contains a collision, the extra queued match is returned to the pending position." },
      { title: "Court-specific Mobile Scoring", copy: "An organizer can provide a court scoring link or QR code. The scorer sees the assigned game, serving team and service number, while scores synchronize to the organizer and Match Board when online." },
      { title: "Large-screen Match Board", copy: "A smart TV display can show court activity, scores, serving side, waiting players, court-pending matches, recent results, and standings." }
    ],
    related: ["/open-play-management", "/live-pickleball-scoring", "/offline-scoring"],
  },
  "/player-standings": {
    path: "/player-standings",
    eyebrow: "Explainable results",
    title: "Pickleball Open Play Standings and Overall Champion",
    seoTitle: "Open Play Standings & Champion Methodology | PickleFlow",
    description: "Understand PickleFlow player standings, winning percentage, accumulated score, eligibility, and Overall Champion tie-breakers.",
    intro: "PickleFlow derives standings from completed games and displays the ranking inputs so organizers and players can understand the results.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow player standings and champion highlights",
    updated: "October 21, 2026",
    article: true,
    sections: [
      { title: "Statistics from Completed Games", copy: "For each checked-in player, PickleFlow calculates games played, wins, losses, winning percentage, accumulated team score, points allowed, and point differential." },
      { title: "Champion Eligibility", copy: "The eligible group includes players who completed at least one fewer game than the event maximum, with a minimum requirement of one completed game." },
      { title: "Ranking and Tie-breakers", copy: "Eligible players are ordered by winning percentage, then wins, point differential, accumulated score, and finally the fewest points allowed. An exact tie across those inputs produces co-champions." },
      { title: "Top 5 Player Highlights", copy: "Separate Top 5 lists show winning percentage leaders and accumulated-score leaders. Organizers can download the champion and leaderboard cards as shareable images." },
      { title: "Product-specific Methodology", copy: "This is PickleFlow's event-ranking method, not an official tournament rule. Organizers should publish their chosen event rules before play begins." }
    ],
    faq: [
      ["Why is the highest total score not automatically the champion?", "Accumulated score rewards total scoring but also increases with games played. PickleFlow therefore uses winning percentage first for the Overall Champion calculation."],
      ["Can two players be champions?", "Yes. Players are shown as co-champions when all published ranking and tie-breaker values are exactly equal."]
    ],
    related: ["/open-play-management", "/fair-player-rotation", "/faq"],
  },
  "/live-pickleball-scoring": {
    path: "/live-pickleball-scoring",
    eyebrow: "Live pickleball scoring",
    title: "Score Each Court from a Phone and Update the Match Board Live",
    seoTitle: "Live Mobile Pickleball Scoring & Match Board | PickleFlow",
    description: "Mobile pickleball scoring with real-time smart TV Match Board updates, serving indicators, next matches, player queues, and standings.",
    intro: "Give an umpire or scorer access to one court. Online score changes synchronize to the organizer and large-screen display, keeping the venue informed.",
    image: "/product-previews/match-board.svg",
    imageAlt: "PickleFlow live pickleball Match Board",
    updated: "October 21, 2026",
    steps: [
      ["Court-specific scorer links", "Share a QR code for a scorer to open the assigned court directly on a mobile device."],
      ["Real-time synchronization", "Scores update across connected organizer, scorer, and Match Board devices."],
      ["Serving controls", "Display the serving team and first or second service while disabling the non-serving team's score button."],
      ["Confirmed completion", "When the winning score is reached, confirm the result before PickleFlow completes the game."],
      ["Venue-ready display", "Present courts, scores, upcoming matches, the queue, winners, and standings on a smart TV."],
    ],
    limitations: "PickleFlow's serving control supports the app's current Open Play workflow. Organizers remain responsible for applying the rules selected for their event.",
    related: ["/court-management", "/offline-scoring", "/player-standings"],
  },
  "/faq": {
    path: "/faq",
    eyebrow: "Organizer questions",
    title: "PickleFlow Frequently Asked Questions",
    seoTitle: "PickleFlow FAQ | Open Play, Offline Scoring & Courts",
    description: "Answers about PickleFlow registration, fair player rotation, offline Game Day, court scoring, standings, data retention, and organizer limits.",
    intro: "These answers describe the current PickleFlow application and its practical limits as of October 21, 2026.",
    image: "/product-previews/event-roster.svg",
    imageAlt: "PickleFlow organizer workspace",
    updated: "October 21, 2026",
    faq: [
      ["Is PickleFlow free?", "Organizer registration and the current core event workflow are free. Donations are optional. Active-event limits apply, and approved donation packages can increase an organizer's limit."],
      ["What player statuses are available?", "Players move through Check In, Join Queue, Waiting, In-Game, and Out states during Game Day."],
      ["How does automatic match creation work?", "When enabled and enough eligible players are waiting, PickleFlow prepares the next pairing using games played and queue position, then assigns it when a court is available."],
      ["Can PickleFlow work without internet?", "Selected organizer operations continue for a previously loaded event in the same browser. The app synchronizes pending local changes after connectivity returns."],
      ["How long is detailed event data retained?", "The current policy schedules detailed event data for deletion 72 hours after event completion. The retained event summary may include the event name and aggregate player and game counts."],
      ["Can players score games from their phones?", "Yes. The organizer can share a court-specific scoring link or QR code. Online changes update the organizer dashboard and Match Board."],
      ["How is the Open Play champion selected?", "Eligible players are ranked by winning percentage, wins, point differential, accumulated score, and fewest points allowed. Exact ties produce co-champions."],
      ["Does PickleFlow guarantee perfect fairness?", "No. It prioritizes fewer games and minimizes repeated partnerships where possible, but attendance changes, court availability, and event duration affect outcomes."]
    ],
    related: ["/how-it-works", "/open-play-management", "/offline-scoring", "/player-standings"],
  },
};

function setDocumentMeta({ title, description, canonical, noindex = false }) {
  document.title = title;
  const setMeta = (selector, attribute, value) => {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      if (selector.includes("property=")) element.setAttribute("property", selector.match(/property="([^"]+)/)[1]);
      else element.setAttribute("name", selector.match(/name="([^"]+)/)[1]);
      document.head.appendChild(element);
    }
    element.setAttribute(attribute, value);
  };
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[name="robots"]', "content", noindex ? "noindex, nofollow" : "index, follow");
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:url"]', "content", canonical);
  setMeta('meta[name="twitter:title"]', "content", title);
  setMeta('meta[name="twitter:description"]', "content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
}

function MarketingPage({ page, onStart }) {
  useEffect(() => {
    const id = "pickleflow-page-schema";
    document.getElementById(id)?.remove();
    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    const origin = "https://pickleflow.paotechs.com";
    const graph = [
      {
        "@type": "Organization",
        "@id": "https://paotechs.com/#organization",
        name: "PAOTECHS",
        url: "https://paotechs.com/",
      },
      {
        "@type": "SoftwareApplication",
        "@id": origin + "/#software",
        name: "PickleFlow",
        url: origin + "/",
        applicationCategory: "SportsApplication",
        operatingSystem: "Web",
        description: "Web-based pickleball event management software for open play, player rotation, court assignments, scoring and standings.",
        publisher: { "@id": "https://paotechs.com/#organization" },
      },
      {
        "@type": "WebPage",
        "@id": origin + page.path + "#webpage",
        url: origin + page.path,
        name: page.seoTitle || page.title,
        description: page.description,
        dateModified: "2026-10-21",
        about: { "@id": origin + "/#software" },
        publisher: { "@id": "https://paotechs.com/#organization" },
      },
    ];
    if (page.article) {
      graph.push({
        "@type": "Article",
        "@id": origin + page.path + "#article",
        headline: page.title,
        description: page.description,
        mainEntityOfPage: origin + page.path,
        dateModified: "2026-10-21",
        publisher: { "@id": "https://paotechs.com/#organization" },
      });
    }
    script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
    document.head.appendChild(script);
    return () => script.remove();
  }, [page]);

  const relatedLabels = {
    "/how-it-works": "How PickleFlow works",
    "/pickleball-event-management": "Event management",
    "/open-play-management": "Open Play management",
    "/fair-player-rotation": "Fair player rotation",
    "/offline-scoring": "Offline scoring and recovery",
    "/court-management": "Court and queue management",
    "/player-standings": "Standings and champion method",
    "/live-pickleball-scoring": "Live mobile scoring",
    "/faq": "Organizer FAQ",
  };

  return (
    <main className="seo-page">
      <section className="seo-hero">
        <div>
          <span className="eyebrow"><Sparkles size={15} /> {page.eyebrow}</span>
          <h1>{page.title}</h1>
          <p>{page.intro}</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={onStart}>Create your free event</button>
            {page.path !== "/how-it-works" && <a className="button button-secondary" href="/how-it-works">See how it works</a>}
          </div>
          <small className="seo-updated">Published by PAOTECHS · Last updated {page.updated}</small>
        </div>
        <figure>
          <img src={page.image} alt={page.imageAlt} />
          <figcaption>{page.imageAlt}</figcaption>
        </figure>
      </section>

      {page.definition && <aside className="seo-definition"><strong>In brief</strong><p>{page.definition}</p></aside>}

      {page.sections?.length > 0 && (
        <section className="seo-content" aria-label={page.title + " guide"}>
          {page.sections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.copy}</p>
              {section.points?.length > 0 && <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>}
            </article>
          ))}
        </section>
      )}

      {page.steps?.length > 0 && (
        <section className="seo-benefits">
          <span className="eyebrow">Made for real game days</span>
          <h2>Everything stays in one flow.</h2>
          <div>
            {page.steps.map(([title, copy], index) => (
              <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p></article>
            ))}
          </div>
        </section>
      )}

      {page.limitations && (
        <section className="seo-limitations">
          <span className="eyebrow">Current scope and limitations</span>
          <h2>What organizers should know</h2>
          <p>{page.limitations}</p>
        </section>
      )}

      {page.faq?.length > 0 && (
        <section className="seo-faq">
          <span className="eyebrow">Frequently asked questions</span>
          <h2>Clear answers for organizers</h2>
          <div>
            {page.faq.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {page.related?.length > 0 && (
        <nav className="seo-related" aria-label="Related PickleFlow guides">
          <span className="eyebrow">Continue exploring</span>
          <h2>Related organizer guides</h2>
          <div>{page.related.map((path) => <a key={path} href={path}>{relatedLabels[path] || path}</a>)}</div>
        </nav>
      )}

      <section className="seo-cta">
        <h2>Spend less time managing. Keep more players on court.</h2>
        <p>PickleFlow is free for organizers and works on phones, tablets, desktops, and smart TV displays.</p>
        <button className="button button-primary" onClick={onStart}>Register as an organizer</button>
      </section>
    </main>
  );
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function Header({ session, onSignOut, dashboardNavigation }) {
  const [showDonationPrompt, setShowDonationPrompt] = useState(false);

  function finishSignOut(donate = false) {
    if (donate) window.open("/donate", "_blank", "noopener,noreferrer");
    setShowDonationPrompt(false);
    onSignOut?.();
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="PickleFlow home">
          <img src="/brand/pickleflow-logo.png" alt="PickleFlow" />
        </a>
        {dashboardNavigation && (
          <div className="topbar-dashboard-nav">{dashboardNavigation}</div>
        )}
        <div className="topbar-actions">
          <a className="button button-suggest" href="/suggest" aria-label="Suggest an app improvement"><MessageSquarePlus size={17} /> Suggest App Improvements</a>
          <a className="button button-donate" href="/donate" aria-label="Donate to PickleFlow"><Heart size={17} /> Donate</a>
          {session && (
            <button className="button button-ghost" aria-label="Sign out" onClick={() => setShowDonationPrompt(true)}>
              <LogOut size={17} /> Sign out
            </button>
          )}
        </div>
      </header>
      {showDonationPrompt && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowDonationPrompt(false)}>
          <section className="logout-donation-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-donation-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="donation-icon"><Heart /></div>
            <span className="eyebrow">Before you go</span>
            <h2 id="logout-donation-title">Would you like to support PickleFlow?</h2>
            <p>Your optional donation helps keep PickleFlow free for organizers and supports future improvements.</p>
            <div className="logout-donation-actions">
              <button className="button button-donate" onClick={() => finishSignOut(true)}><Heart size={17} /> Donate and sign out</button>
              <button className="button button-secondary" onClick={() => finishSignOut(false)}>Not now, sign out</button>
              <button className="logout-cancel" onClick={() => setShowDonationPrompt(false)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Landing({ onStart, onLogin }) {
  const [impact, setImpact] = useState({ organizers: 0, events: 0, players: 0, games: 0 });
  useEffect(() => {
    supabase.rpc("platform_impact_counts").then(({ data }) => {
      if (data?.[0]) setImpact(data[0]);
    });
  }, []);
  const impactStats = [
    { label: "Organizers", value: 50 + impact.organizers, icon: <Users /> },
    { label: "Events", value: 250 + impact.events, icon: <CalendarDays /> },
    { label: "Players", value: 1000 + impact.players, icon: <UserPlus /> },
    { label: "Games", value: 900 + impact.games, icon: <Activity /> },
  ];
  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <Sparkles size={15} /> Now with Offline Game Day
            </span>
            <h1>Run pickleball events without the spreadsheet shuffle.</h1>
            <p>
              Register players, build fair matches, score every court from a
              phone, and keep Game Day moving—even through temporary internet interruptions.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={onStart}>
                Register as an organizer
              </button>
              <button className="button button-secondary" onClick={onLogin}>
                Log in
              </button>
              <a className="button button-secondary" href="#about">
                See how it works
              </a>
            </div>
          </div>
          <img
            className="court-card hero-image"
            src="/social/pickleflow-hero.webp"
            alt="PickleFlow connects pickleball registration, player queues, live scoring, and the Match Board"
          />
          <div className="hero-impact">
            <div className="hero-impact-copy">
              <span className="eyebrow">Growing with every game day</span>
              <h2>Built for communities that would rather play than manage paperwork.</h2>
              <p>Join organizers keeping registrations simple, courts moving, and players connected—from the first signup to the final score.</p>
            </div>
            <div className="hero-impact-stats" aria-label="PickleFlow community activity">
              {impactStats.map((stat) => <article key={stat.label}><span>{stat.label}</span>{stat.icon}<strong>{stat.value.toLocaleString()}+</strong><small>and growing</small></article>)}
            </div>
          </div>
        </section>
        <section className="about-section" id="about">
          <div className="about-heading">
            <span className="eyebrow">From registration to final score</span>
            <h2>One simple flow for the whole event.</h2>
            <p>
              PickleFlow gives organizers a single place to prepare the event,
              manage players, run open play, and keep everyone informed in real time.
            </p>
          </div>
          <div className="feature-grid">
            <article>
              <span className="feature-number">01</span>
              <CalendarDays />
              <h3>Create and share</h3>
              <p>Set the schedule, venue, player limit, and share one registration link or QR code.</p>
            </article>
            <article>
              <span className="feature-number">02</span>
              <Users />
              <h3>Build the player list</h3>
              <p>Accept signups, add walk-ins, import a CSV, check players in, and manage the queue.</p>
            </article>
            <article>
              <span className="feature-number">03</span>
              <Trophy />
              <h3>Run game day live</h3>
              <p>Assign matches by court, score from a phone, and update the shared Match Board automatically.</p>
            </article>
          </div>
          <section className="new-features-section">
            <div className="new-features-heading">
              <span className="eyebrow"><Sparkles size={15} /> Latest PickleFlow additions</span>
              <h2>Game Day keeps moving—even when the internet does not.</h2>
              <p>Manage players, fair pairings, courts, scores, and results from one organizer workspace, with offline changes safely synchronized after reconnection.</p>
            </div>
            <div className="new-feature-grid">
              <article><WifiOff /><div><h3>Offline Game Day</h3><p>Add and check in players, update statuses, manage the queue, assign matches, and record scores locally. Changes sync automatically when internet returns.</p></div></article>
              <article><Swords /><div><h3>Fair Open Play rotation</h3><p>Prioritize players with fewer games and rotate partners whenever possible before repeating a pairing.</p></div></article>
              <article><Activity /><div><h3>Automatic next matches</h3><p>Prepare the next fair pairing while courts are occupied, then assign it automatically when a court becomes available.</p></div></article>
              <article><Phone /><div><h3>Live mobile scoring</h3><p>Score each court from a phone, track first and second serve, and update the organizer dashboard instantly.</p></div></article>
              <article><Trophy /><div><h3>Champion and player highlights</h3><p>Calculate the Open Play champion, winning percentage, total scores, and downloadable Top 5 images.</p></div></article>
              <article><MonitorUp /><div><h3>Live venue Match Board</h3><p>Show active scores, who is serving, the waiting queue, court-pending matches, and recent winners on a TV.</p></div></article>
            </div>
          </section>
          <div className="product-showcase">
            <article className="showcase-card">
              <img src="/product-previews/event-roster.svg" alt="PickleFlow event roster and player management screen" />
              <div>
                <span>Organizer workspace</span>
                <h3>Event and player management</h3>
                <p>Keep event details, registrations, check-ins, imports, and exports together.</p>
              </div>
            </article>
            <article className="showcase-card">
              <img src="/product-previews/game-day.svg" alt="PickleFlow Game Day court and player queue screen" />
              <div>
                <span>Mobile game control</span>
                <h3>Game Day operations</h3>
                <p>See active courts, next matches, scores, substitutes, and waiting players at a glance.</p>
              </div>
            </article>
            <article className="showcase-card">
              <img src="/product-previews/match-board.svg" alt="PickleFlow smart TV Match Board screen" />
              <div>
                <span>Large-screen display</span>
                <h3>Live Match Board</h3>
                <p>Show court activity, scores, next matches, the queue, and recent winners on a smart TV.</p>
              </div>
            </article>
          </div>
          <div className="use-cases">
            <div>
              <span className="eyebrow">Designed for real play</span>
              <h2>Use PickleFlow your way.</h2>
            </div>
            <div className="use-case-list">
              <article><strong>Club open play</strong><span>Keep rotations fair and courts moving without a paper queue.</span></article>
              <article><strong>Community events</strong><span>Collect player registrations and organize multiple courts from one phone.</span></article>
              <article><strong>Private game days</strong><span>Share scorer access per court while the organizer keeps full control.</span></article>
            </div>
          </div>
          <nav className="seo-link-grid" aria-label="Explore PickleFlow features">
            <a href="/how-it-works"><strong>How PickleFlow works</strong><span>Follow the complete organizer workflow.</span></a>
            <a href="/open-play-management"><strong>Open Play management</strong><span>Fair queues, rotations, automatic matches, and offline continuity.</span></a>
            <a href="/fair-player-rotation"><strong>Fair player rotation</strong><span>See how games played and partner history affect pairing.</span></a>
            <a href="/offline-scoring"><strong>Offline Game Day</strong><span>What continues locally and how reconnect synchronization works.</span></a>
            <a href="/court-management"><strong>Court management</strong><span>Manage courts, queues, and court-pending matches.</span></a>
            <a href="/player-standings"><strong>Standings & champion</strong><span>Understand statistics, eligibility, and tie-breakers.</span></a>
            <a href="/live-pickleball-scoring"><strong>Live scoring & Match Board</strong><span>Score by phone and update the venue live.</span></a>
            <a href="/faq"><strong>Organizer FAQ</strong><span>Answers about features, limits, retention, and offline use.</span></a>
          </nav>
        </section>
        <section className="donation-card">
          <div className="donation-icon">
            <Heart />
          </div>
          <div>
            <span className="eyebrow">Community supported</span>
            <h2>PickleFlow is free while we build it with organizers.</h2>
            <p>
              Donations are optional and help cover hosting, development, and
              future game-day features.
            </p>
          </div>
          <a className="button button-donate" href="/donate">
            Support PickleFlow
          </a>
        </section>
      </main>
      <footer>PickleFlow · A PAOTECHS-powered community project</footer>
    </>
  );
}

const organizerWalkthroughSteps = [
  { icon: CalendarDays, title: "Create your event", text: "Tap New Event. Add the event name, date, place, player limit, and points needed to win.", tip: "Start here. You can edit these details later." },
  { icon: UserPlus, title: "Invite your players", text: "Open the event and share its registration link or QR code. Players can register without creating an account.", tip: "You can also import a list or add a walk-in yourself." },
  { icon: CheckCircle2, title: "Check players in", text: "On game day, tap Check In when a player arrives. Then tap Join Queue when the player is ready to play.", tip: "Waiting means the player is ready. In-Game means the player is currently on a court." },
  { icon: Swords, title: "Let PickleFlow build matches", text: "Turn on Auto-assign next players. PickleFlow creates the next match from the waiting queue and keeps it ready for an open court.", tip: "You still control which court receives the match." },
  { icon: Phone, title: "Score from any phone", text: "Open a court’s scoring QR code on a phone. Tap the serving team’s plus button and change the serve after a side-out.", tip: "The organizer confirms the game before it is completed." },
  { icon: MonitorUp, title: "Open the Match Board", text: "Tap Match Board and open the link on a smart TV, laptop, or tablet. Everyone can see scores, serving team, queue, and winners.", tip: "The board updates automatically while online." },
  { icon: Trophy, title: "That’s it—you’re ready!", text: "Complete each game, move waiting players into the next match, and export the event when you are finished.", tip: "You cannot break anything. Take it one button at a time." },
];

function OrganizerWalkthrough({ onClose }) {
  const [step, setStep] = useState(0);
  const item = organizerWalkthroughSteps[step];
  const Icon = item.icon;
  const finish = () => onClose();
  return <div className="modal-backdrop onboarding-backdrop" role="presentation" onMouseDown={finish}>
    <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>Easy Organizer Guide</span><strong>{step + 1} of {organizerWalkthroughSteps.length}</strong></div><button type="button" onClick={finish} aria-label="Close guide"><X /></button></header>
      <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${organizerWalkthroughSteps.length}`}><span style={{ width: `${((step + 1) / organizerWalkthroughSteps.length) * 100}%` }} /></div>
      <div className="onboarding-visual"><Icon /></div>
      <div className="onboarding-copy"><span className="eyebrow">Step {step + 1}</span><h2 id="onboarding-title">{item.title}</h2><p>{item.text}</p><aside><Sparkles /> <span>{item.tip}</span></aside></div>
      <footer>
        <button className="onboarding-skip" type="button" onClick={finish}>Skip for now</button>
        <div>{step > 0 && <button className="button button-secondary" type="button" onClick={() => setStep(step - 1)}><ArrowLeft size={17} /> Back</button>}
          {step < organizerWalkthroughSteps.length - 1 ? <button className="button button-primary" type="button" onClick={() => setStep(step + 1)}>Next <ArrowRight size={17} /></button> : <button className="button button-primary" type="button" onClick={finish}><CheckCircle2 size={17} /> Start organizing</button>}
        </div>
      </footer>
    </section>
  </div>;
}

function DonationPage() {
  const [copied, setCopied] = useState("");

  async function sharePickleFlow() {
    const share = { title: "PickleFlow", text: "Run smoother pickleball events with PickleFlow.", url: "https://pickleflow.paotechs.com/" };
    if (navigator.share) return navigator.share(share).catch(() => {});
    await navigator.clipboard?.writeText(share.url);
    setCopied("share");
    window.setTimeout(() => setCopied(""), 1800);
  }

  async function copyNumber(provider, number) {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(provider);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      window.prompt(`Copy this ${provider} number:`, number);
    }
  }

  const wallets = [
    {
      id: "gcash",
      name: "GCash",
      number: "0917 671 0751",
      copyValue: "09176710751",
      image: "/donations/gcash-qr.png",
      className: "wallet-gcash",
    },
    {
      id: "maya",
      name: "Maya",
      number: "0998 537 8242",
      copyValue: "09985378242",
      image: "/donations/maya-qr.png",
      className: "wallet-maya",
    },
  ];

  return (
    <main className="donate-page">
      <a className="donate-back" href="/">
        <ArrowLeft size={17} /> Back to PickleFlow
      </a>
      <section className="donate-hero">
        <div className="donate-heart"><Heart size={28} /></div>
        <span className="eyebrow">Community supported</span>
        <h1>Help keep PickleFlow free.</h1>
        <p>
          PickleFlow is free for event organizers. Your optional donation helps
          cover hosting, maintenance, and continued development of game-day tools.
        </p>
      </section>

      <section className="donation-options" aria-label="Donation methods">
        <article className="payment-card paypal-card">
          <div className="payment-card-heading">
            <span className="payment-mark paypal-mark">P</span>
            <div><span>International</span><h2>PayPal</h2></div>
          </div>
          <PayPalDonationCheckout />
        </article>

        {wallets.map((wallet) => (
          <article className={`payment-card ${wallet.className}`} key={wallet.id}>
            <div className="payment-card-heading">
              <span className="payment-mark">{wallet.name[0]}</span>
              <div><span>Philippines</span><h2>{wallet.name}</h2></div>
            </div>
            <div className="wallet-qr-wrap">
              <img src={wallet.image} alt={`${wallet.name} QR code for PickleFlow donations`} />
            </div>
            <div className="wallet-number">
              <span>{wallet.number}</span>
              <button type="button" onClick={() => copyNumber(wallet.name, wallet.copyValue)}>
                {copied === wallet.name ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied === wallet.name ? "Copied" : "Copy"}
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="donation-note">
        <ShieldCheck size={22} />
        <p>
          Donations are optional and do not unlock additional features. Payments
          are handled directly by PayPal, GCash, or Maya.
        </p>
      </section>
      <section className="donation-promo">
        <div><span className="eyebrow">Grow the community</span><h2>Know another pickleball organizer?</h2><p>Share PickleFlow and help more clubs run registration, queues, scoring, and match boards from one place.</p></div>
        <button className="button button-primary" type="button" onClick={sharePickleFlow}>{copied === "share" ? <CheckCircle2 size={17} /> : <Sparkles size={17} />}{copied === "share" ? "Link copied" : "Share PickleFlow"}</button>
      </section>
    </main>
  );
}

const PAYPAL_CLIENT_ID = "BAA3_0wqyoINwR8UM1c_x1hiVkudPDf-8oKO2qX8gsbyHWgv6Fv1Tgijd5F281_DFOr8z7wdSqea60FEKo";

function PayPalDonationCheckout({
  minimum = 1,
  initialAmount = "5.00",
  amounts = ["1.00", "5.00", "10.00"],
  description = "Support PickleFlow development and hosting",
  onSuccess,
  fixedAmount = false,
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [customAmount, setCustomAmount] = useState("");
  const [status, setStatus] = useState("");
  const buttonRef = useRef(null);
  const selectedAmount = amount === "custom" ? Number(customAmount) : Number(amount);
  const validAmount = Number.isFinite(selectedAmount) && selectedAmount >= minimum && selectedAmount <= 1000;

  useEffect(() => {
    let cancelled = false;

    async function renderButtons() {
      setStatus("");
      if (!PAYPAL_CLIENT_ID || !validAmount || !buttonRef.current) return;
      let script = document.getElementById("paypal-pickleflow-sdk");
      if (!script) {
        script = document.createElement("script");
        script.id = "paypal-pickleflow-sdk";
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&intent=capture&components=buttons,funding-eligibility`;
        script.async = true;
        document.head.appendChild(script);
      }
      if (!window.paypal) {
        await new Promise((resolve, reject) => {
          script.addEventListener("load", resolve, { once: true });
          script.addEventListener("error", reject, { once: true });
        });
      }
      if (cancelled || !buttonRef.current || !window.paypal) return;
      buttonRef.current.replaceChildren();
      const value = selectedAmount.toFixed(2);
      window.paypal.Buttons({
        style: { layout: "vertical", shape: "rect", label: "donate", height: 45 },
        createOrder: (_data, actions) => actions.order.create({
          purchase_units: [{
            description,
            amount: { currency_code: "USD", value },
          }],
          application_context: { shipping_preference: "NO_SHIPPING" },
        }),
        onApprove: async (data, actions) => {
          const details = await actions.order.capture();
          setStatus(`Thank you for supporting PickleFlow with $${value}!`);
          onSuccess?.({
            orderId: data.orderID,
            captureId: details?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null,
            amount: selectedAmount,
          });
        },
        onCancel: () => setStatus("Payment cancelled. No charge was made."),
        onError: () => setStatus("PayPal checkout could not be loaded. Please try again."),
      }).render(buttonRef.current);
    }

    renderButtons().catch(() => setStatus("PayPal checkout could not be loaded. Please try again."));
    return () => { cancelled = true; };
  }, [description, minimum, onSuccess, selectedAmount, validAmount]);

  return (
    <div className={`paypal-checkout-layout ${fixedAmount ? "fixed-amount" : ""}`}>
      {!fixedAmount && <div className="paypal-amount-panel">
        <p>Choose an amount. PayPal will show any applicable currency conversion during checkout.</p>
        <div className="paypal-amounts" role="group" aria-label="Donation amount">
          {amounts.map((value) => (
            <button key={value} type="button" className={amount === value ? "selected" : ""} onClick={() => setAmount(value)}>${Number(value)}</button>
          ))}
          <button type="button" className={amount === "custom" ? "selected" : ""} onClick={() => setAmount("custom")}>Custom</button>
        </div>
        {amount === "custom" && (
          <label className="paypal-custom-amount">
            Custom amount (USD)
            <span><b>$</b><input type="number" min={minimum} max="1000" step="0.01" inputMode="decimal" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder={`Minimum $${minimum}`} /></span>
          </label>
        )}
        {!validAmount && amount === "custom" && <small className="paypal-validation">Enter an amount from ${minimum} to $1,000.</small>}
      </div>}
      <div className="paypal-button-panel">
        <strong>Donate ${validAmount ? selectedAmount.toFixed(2) : "0.00"} USD</strong>
        {PAYPAL_CLIENT_ID ? (
          <div ref={buttonRef} className="paypal-buttons" aria-live="polite" />
        ) : (
          <div className="paypal-setup-message">PayPal checkout is being configured. Please use GCash or Maya for now.</div>
        )}
        {status && <p className={`paypal-status ${status.startsWith("Thank") ? "success" : ""}`}>{status}</p>}
        <small>Available payment methods depend on PayPal eligibility in the donor's country.</small>
      </div>
    </div>
  );
}

const ACTIVE_EVENT_PACKAGES = [
  { events: 2, amount: 10, pesoAmount: 580 },
  { events: 5, amount: 25, pesoAmount: 1450 },
  { events: 10, amount: 50, pesoAmount: 2900 },
];

const LOCAL_PAYMENT_METHODS = {
  gcash: { name: "GCash", number: "0917 671 0751", copyValue: "09176710751", image: "/donations/gcash-qr.png" },
  maya: { name: "Maya", number: "0998 537 8242", copyValue: "09985378242", image: "/donations/maya-qr.png" },
};

function ActiveEventUpgrade({ session, onBack, onSubmitted }) {
  const [selected, setSelected] = useState(ACTIVE_EVENT_PACKAGES[0]);
  const [paymentProvider, setPaymentProvider] = useState("paypal");
  const [donation, setDonation] = useState(null);
  const [proofMethod, setProofMethod] = useState("upload");
  const [proof, setProof] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!donation || busy) return;
    if (proofMethod === "upload" && !proof) return setMessage(`Upload your ${paymentProvider === "paypal" ? "PayPal receipt" : `${LOCAL_PAYMENT_METHODS[paymentProvider].name} payment confirmation`}.`);
    setBusy(true); setMessage("");
    let proofPath = null;
    if (proofMethod === "upload") {
      if (proof.size > 5 * 1024 * 1024) { setBusy(false); return setMessage("Proof must be 5 MB or smaller."); }
      const safeName = proof.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      proofPath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("event-upgrade-proofs").upload(proofPath, proof);
      if (uploadError) { setBusy(false); return setMessage(uploadError.message); }
    }
    const { data: createdRequest, error } = await supabase.from("active_event_upgrade_requests").insert({
      organizer_user_id: session.user.id,
      requested_events: selected.events,
      donation_amount_usd: selected.amount,
      donation_amount_php: paymentProvider === "paypal" ? null : selected.pesoAmount,
      payment_provider: paymentProvider,
      payment_reference: donation.orderId || null,
      paypal_order_id: paymentProvider === "paypal" ? donation.orderId : null,
      paypal_capture_id: paymentProvider === "paypal" ? donation.captureId : null,
      proof_method: proofMethod,
      proof_path: proofPath,
    }).select("id").single();
    setBusy(false);
    if (error) return setMessage(error.message);
    sendNotification("upgrade_received", { requestId: createdRequest.id });
    if (proofMethod === "email") {
      const providerName = paymentProvider === "paypal" ? "PayPal" : LOCAL_PAYMENT_METHODS[paymentProvider].name;
      const subject = encodeURIComponent(`PickleFlow payment proof | +${selected.events} active events`);
      const body = encodeURIComponent(`Hello PickleFlow Support,\n\nI am submitting my ${providerName} payment proof for +${selected.events} active events.\n\nPackage: +${selected.events} active events\nAmount: ${paymentProvider === "paypal" ? `$${selected.amount} USD` : `₱${selected.pesoAmount.toLocaleString()} PHP`}\nOrganizer account: ${session.user.email}\n${donation.orderId ? `Payment reference: ${donation.orderId}\n` : ""}\nPlease attach the receipt or payment screenshot before sending.\n\nThank you,\nPickleFlow Organizer`);
      window.location.href = `mailto:hello@paotechs.com?subject=${subject}&body=${body}`;
    }
    setMessage("Your request is in the PickleFlow approval queue. We’ll review the payment proof and update your active-event allowance.");
    onSubmitted?.();
  }

  return <section className="profile-card upgrade-card">
    <button className="text-button compact" onClick={onBack}><ArrowLeft size={16} /> Back to events</button>
    <span className="eyebrow">Increase your event allowance</span>
    <h2>Support PickleFlow and run more active events</h2>
    <p className="muted">Select a package, pay securely through PayPal, GCash, or Maya, then send your proof. Additional events become available after Platform Admin approval.</p>
    <div className="upgrade-steps"><span><b>1</b> Select a package and donate</span><span><b>2</b> Upload or email your proof</span><span><b>3</b> Admin approves your allowance</span></div>
    <div className="upgrade-packages">
      {ACTIVE_EVENT_PACKAGES.map((item) => <button type="button" key={item.events} className={selected.events === item.events ? "selected" : ""} onClick={() => { setSelected(item); setDonation(null); }}>
        <strong>+{item.events}</strong><span>active events</span><b>${item.amount} / ₱{item.pesoAmount.toLocaleString()}</b>
      </button>)}
      <a className="custom-package" href="mailto:hello@paotechs.com?subject=PickleFlow custom active event allowance"><strong>Custom</strong><span>active events</span><b>Contact support</b></a>
    </div>
    <div className="upgrade-payment-methods" role="group" aria-label="Payment method">
      {[{ id: "paypal", name: "PayPal", detail: "USD · online checkout" }, { id: "gcash", name: "GCash", detail: "PHP · scan or send" }, { id: "maya", name: "Maya", detail: "PHP · scan or send" }].map((method) => <button type="button" key={method.id} className={paymentProvider === method.id ? "selected" : ""} onClick={() => { setPaymentProvider(method.id); setDonation(null); setMessage(""); }}><b>{method.name}</b><span>{method.detail}</span></button>)}
    </div>
    {!donation && paymentProvider === "paypal" && <PayPalDonationCheckout key={selected.events} minimum={selected.amount} initialAmount={`${selected.amount}.00`} amounts={[`${selected.amount}.00`]} description={`PickleFlow +${selected.events} active events`} onSuccess={setDonation} fixedAmount />}
    {!donation && paymentProvider !== "paypal" && (() => { const wallet = LOCAL_PAYMENT_METHODS[paymentProvider]; return <div className="upgrade-wallet-checkout">
      <div className="upgrade-wallet-qr"><img src={wallet.image} alt={`${wallet.name} QR code for PickleFlow`} /></div>
      <div><span className="eyebrow">Pay with {wallet.name}</span><h3>Send ₱{selected.pesoAmount.toLocaleString()}</h3><p>Scan the QR code or send to the mobile number below. Save the receipt—you’ll submit it in the next step.</p><div className="wallet-number"><span>{wallet.number}</span><button type="button" onClick={() => navigator.clipboard?.writeText(wallet.copyValue)}><Copy size={16} /> Copy</button></div><button className="button button-primary" type="button" onClick={() => setDonation({ provider: paymentProvider })}>I’ve sent the payment</button></div>
    </div>; })()}
    {donation && <>
      <div className="suggestion-confirmed"><CheckCircle2 /><span>{paymentProvider === "paypal" ? "PayPal donation confirmed." : `${LOCAL_PAYMENT_METHODS[paymentProvider].name} payment marked as sent.`}</span></div>
      <div className="proof-heading"><span className="eyebrow">Step 2</span><h3>Send your proof of payment</h3><p>Upload your receipt below, or choose Email proof to attach it from your email app.</p></div>
      <div className="proof-methods">
        <label><input type="radio" checked={proofMethod === "upload"} onChange={() => setProofMethod("upload")} /> Upload proof</label>
        <label><input type="radio" checked={proofMethod === "email"} onChange={() => setProofMethod("email")} /> Email proof</label>
      </div>
      {proofMethod === "upload" && <label className="proof-upload"><FileUp size={20} /><span>{proof?.name || `Choose ${paymentProvider === "paypal" ? "PayPal" : LOCAL_PAYMENT_METHODS[paymentProvider].name} receipt (image or PDF, up to 5 MB)`}</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setProof(event.target.files?.[0] || null)} /></label>}
      {proofMethod === "email" && <p className="form-note">After submitting, your email app will open with a PickleFlow-formatted message. Attach the receipt before sending.</p>}
      {message && <div className={`form-message ${message.startsWith("Your request") ? "" : "error"}`}>{message}</div>}
      <button className="button button-primary button-full" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit for approval"}</button>
    </>}
  </section>;
}

function SuggestionPage({ session, onLogin }) {
  const [paymentProvider, setPaymentProvider] = useState("paypal");
  const [donation, setDonation] = useState(null);
  const [walletAmount, setWalletAmount] = useState("580");
  const [walletProof, setWalletProof] = useState(null);
  const [form, setForm] = useState({ category: "feature", title: "", details: "" });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!session || !donation || submitting) return;
    setSubmitting(true);
    setMessage("");
    let proofPath = null;
    if (paymentProvider !== "paypal" && paymentProvider !== "later") {
      if (!walletProof) { setSubmitting(false); return setMessage("Upload your payment receipt before submitting."); }
      if (walletProof.size > 5 * 1024 * 1024) { setSubmitting(false); return setMessage("Proof must be 5 MB or smaller."); }
      const safeName = walletProof.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      proofPath = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("suggestion-payment-proofs").upload(proofPath, walletProof);
      if (uploadError) { setSubmitting(false); return setMessage(uploadError.message); }
    }
    const { data: createdSuggestion, error } = await supabase.from("app_improvement_suggestions").insert({
      organizer_user_id: session.user.id,
      category: form.category,
      title: form.title.trim(),
      details: form.details.trim(),
      donation_amount_usd: paymentProvider === "paypal" ? donation.amount : null,
      donation_amount_php: paymentProvider === "gcash" || paymentProvider === "maya" ? donation.amountPhp : null,
      payment_provider: paymentProvider,
      payment_reference: donation.orderId || null,
      payment_proof_path: proofPath,
      paypal_order_id: paymentProvider === "paypal" ? donation.orderId : null,
      paypal_capture_id: paymentProvider === "paypal" ? donation.captureId : null,
    }).select("id").single();
    setSubmitting(false);
    if (error) return setMessage(error.message);
    await sendNotification("suggestion_received", { suggestionId: createdSuggestion.id });
    window.location.assign("/");
  }

  return (
    <main className="suggest-page">
      <a className="donate-back" href="/"><ArrowLeft size={17} /> Back to PickleFlow</a>
      <section className="suggest-hero">
        <div className="donate-heart"><MessageSquarePlus size={28} /></div>
        <span className="eyebrow">Help shape PickleFlow</span>
        <h1>Suggest an app improvement.</h1>
        <p>Share an idea now and support PickleFlow through PayPal, GCash, or Maya—or choose to donate later. Every suggestion enters the product backlog for review.</p>
      </section>
      {!session ? (
        <section className="suggest-card locked-suggestion">
          <ShieldCheck size={28} />
          <h2>Organizer sign-in required</h2>
          <p>Sign in first so we can associate the suggestion with your organizer account.</p>
          <button className="button button-primary" onClick={onLogin}>Log in to continue</button>
        </section>
      ) : !donation ? (
        <section className="suggest-card">
          <h2>Choose how you’d like to support PickleFlow</h2>
          <p className="muted">Donate at least $10 USD or ₱580 PHP. The suggestion form opens after payment confirmation.</p>
          <div className="upgrade-payment-methods" role="group" aria-label="Payment method">
            {[{ id: "paypal", name: "PayPal", detail: "USD · online checkout" }, { id: "gcash", name: "GCash", detail: "PHP · scan or send" }, { id: "maya", name: "Maya", detail: "PHP · scan or send" }].map((method) => <button type="button" key={method.id} className={paymentProvider === method.id ? "selected" : ""} onClick={() => { setPaymentProvider(method.id); setWalletProof(null); setMessage(""); }}><b>{method.name}</b><span>{method.detail}</span></button>)}
          </div>
          {paymentProvider === "paypal" ? <PayPalDonationCheckout
            minimum={10}
            initialAmount="10.00"
            amounts={["10.00", "25.00", "50.00"]}
            description="PickleFlow app improvement suggestion"
            onSuccess={setDonation}
          /> : (() => { const wallet = LOCAL_PAYMENT_METHODS[paymentProvider]; const parsedAmount = Number(walletAmount); const validAmount = Number.isFinite(parsedAmount) && parsedAmount >= 580; return <div className="suggest-wallet-checkout">
            <div className="upgrade-wallet-qr"><img src={wallet.image} alt={`${wallet.name} QR code for PickleFlow`} /></div>
            <div className="suggest-wallet-details"><span className="eyebrow">Donate with {wallet.name}</span><h3>Scan or send to {wallet.number}</h3><div className="wallet-amounts" role="group" aria-label="Donation amount">{[580,1450,2900].map((amount) => <button type="button" key={amount} className={walletAmount === String(amount) ? "selected" : ""} onClick={() => setWalletAmount(String(amount))}>₱{amount.toLocaleString()}</button>)}<button type="button" className={!['580','1450','2900'].includes(walletAmount) ? "selected" : ""} onClick={() => setWalletAmount("")}>Custom</button></div><label>Donation amount (PHP)<input type="number" min="580" step="1" inputMode="numeric" value={walletAmount} onChange={(event) => setWalletAmount(event.target.value)} /></label><label className="proof-upload"><FileUp size={20} /><span>{walletProof?.name || `Upload ${wallet.name} receipt (image or PDF, up to 5 MB)`}</span><input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setWalletProof(event.target.files?.[0] || null)} /></label>{!validAmount && <small className="paypal-validation">The minimum donation is ₱580.</small>}<button className="button button-primary button-full" type="button" disabled={!validAmount || !walletProof} onClick={() => setDonation({ provider: paymentProvider, amountPhp: parsedAmount })}>Continue to suggestion</button></div>
          </div>; })()}
          <div className="donate-later"><span>Not ready to donate today?</span><button className="text-button" type="button" onClick={() => { setPaymentProvider("later"); setDonation({ provider: "later" }); }}>I’ll Donate Later</button></div>
        </section>
      ) : (
        <section className="suggest-card suggestion-unlocked">
          <div className={`suggestion-confirmed ${paymentProvider === "later" ? "donation-deferred" : ""}`}><CheckCircle2 /><span>{paymentProvider === "paypal" ? "PayPal donation confirmed. Thank you for supporting PickleFlow." : paymentProvider === "later" ? "Donation deferred. Your idea will still be added to the PickleFlow backlog." : `${LOCAL_PAYMENT_METHODS[paymentProvider].name} payment proof attached. Thank you for supporting PickleFlow.`}</span></div>
          <h2>Tell us what would make PickleFlow better</h2>
          <form onSubmit={submit}>
            <label>Suggestion type
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="feature">New feature</option>
                <option value="improvement">Existing feature improvement</option>
                <option value="usability">UI or usability</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Short title<input required maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Details<textarea required minLength="10" maxLength="3000" rows="7" value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} placeholder="Describe the problem, your suggested improvement, and how it would help organizers or players." /></label>
            {message && <div className={`form-message ${message.startsWith("Thank") ? "" : "error"}`}>{message}</div>}
            <button className="button button-primary button-full" disabled={submitting}>{submitting ? "Submitting…" : "Submit suggestion"}</button>
          </form>
        </section>
      )}
    </main>
  );
}

function AuthPanel({ onClose, initialMode = "signup" }) {
  const [mode, setMode] = useState(initialMode),
    [form, setForm] = useState({ ...emptyProfile, email: "", password: "" }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
      if (mode === "signup") {
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
        });
        if (error) throw error;
        setMessage(
          "Registration received. Please check your email to confirm your account.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section className="auth-card" role="dialog" aria-modal="true">
        <button className="close-button" onClick={onClose} aria-label="Close">
          ×
        </button>
        <span className="eyebrow">
          {mode === "signup" ? "Organizer registration" : "Welcome back"}
        </span>
        <h2>
          {mode === "signup"
            ? "Create your free account"
            : "Sign in to PickleFlow"}
        </h2>
        <p className="muted">No subscription or payment is required.</p>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label>
                Full name
                <input
                  required
                  name="full_name"
                  value={form.full_name}
                  onChange={update}
                />
              </label>
              <label>
                Club or organization
                <input
                  required
                  name="organization_name"
                  value={form.organization_name}
                  onChange={update}
                />
              </label>
              <div className="form-row">
                <label>
                  City
                  <input name="city" value={form.city} onChange={update} />
                </label>
                <label>
                  Country
                  <input
                    name="country"
                    value={form.country}
                    onChange={update}
                  />
                </label>
              </div>
              <label>
                Phone number <span>(optional)</span>
                <input name="phone" value={form.phone} onChange={update} />
              </label>
            </>
          )}
          <label>
            Email
            <input
              required
              type="email"
              name="email"
              value={form.email}
              onChange={update}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength="8"
              type="password"
              name="password"
              value={form.password}
              onChange={update}
            />
          </label>
          {message && <div className="form-message">{message}</div>}
          <button className="button button-primary button-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create free organizer account"
                : "Sign in"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setMessage("");
          }}
        >
          {mode === "signup"
            ? "Already registered? Sign in"
            : "Need an account? Register"}
        </button>
      </section>
    </div>
  );
}

function TermsStep({ onAccept, onCancel }) {
  const [accepted, setAccepted] = useState(false);
  return (
    <section className="profile-card terms-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">Before creating an event</span>
          <h2>Event terms and data retention</h2>
        </div>
        <button className="text-button compact" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="retention-alert">
        <strong>72-hour data retention</strong>
        <span>
          PickleFlow will permanently delete player, contact, queue, and game
          data 72 hours after the event date. A summary containing only the
          event name, date, player count, and game count will remain.
        </span>
      </div>
      <div className="terms-copy">
        <h3>Terms for event organizers</h3>
        <ul>
          <li>
            You are responsible for providing accurate event details and
            managing your registered players.
          </li>
          <li>
            You may use player information only for organizing and communicating
            about the stated event.
          </li>
          <li>
            Do not export, share, or reuse player contact information for
            unrelated marketing without their permission.
          </li>
          <li>
            The event record and all associated player registrations will be
            permanently deleted after the retention period.
          </li>
          <li>
            If you need the information retained longer, contact the PickleFlow
            platform administrator before the deletion date. Extensions are
            subject to special consideration and are not guaranteed.
          </li>
        </ul>
      </div>
      <label className="terms-acceptance">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          I have read and accept the terms and conditions, including the{" "}
          <strong>72-hour post-event data-retention policy</strong>.
        </span>
      </label>
      <button
        className="button button-primary button-full"
        disabled={!accepted}
        onClick={() => onAccept(new Date().toISOString())}
      >
        Accept and configure event
      </button>
    </section>
  );
}

function LocationPicker({ latitude, longitude, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const hasPin = latitude !== null && latitude !== "" && longitude !== null && longitude !== "" && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    const center = hasPin ? [Number(latitude), Number(longitude)] : [9.85, 124.14];
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(center, hasPin ? 16 : 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const placePin = (lat, lng) => {
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.circleMarker([lat, lng], {
        radius: 10, color: "#fff", weight: 4, fillColor: "#2375d8", fillOpacity: 1,
      }).addTo(map);
    };
    if (hasPin) placePin(Number(latitude), Number(longitude));
    map.on("click", ({ latlng }) => {
      placePin(latlng.lat, latlng.lng);
      onChangeRef.current(latlng.lat, latlng.lng);
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  function useCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const lat = coords.latitude, lng = coords.longitude;
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.circleMarker([lat, lng], {
        radius: 10, color: "#fff", weight: 4, fillColor: "#2375d8", fillOpacity: 1,
      }).addTo(mapRef.current);
      mapRef.current.setView([lat, lng], 17);
      onChange(lat, lng);
    });
  }
  const hasPin = latitude !== null && latitude !== "" && longitude !== null && longitude !== "" && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  return (
    <div className="location-picker">
      <div className="location-picker-heading">
        <div><strong>Pin the event location</strong><span>Tap the exact court or venue on the map.</span></div>
        <button type="button" className="button button-secondary" onClick={useCurrentLocation}>
          <LocateFixed size={16} /> Use my location
        </button>
      </div>
      <div ref={containerRef} className="location-map" aria-label="Event location map selector" />
      <div className="location-picker-footer">
        <span>{hasPin ? `Pinned at ${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}` : "No location pinned yet."}</span>
        {hasPin && <a href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`} target="_blank" rel="noreferrer">Open in Google Maps</a>}
      </div>
    </div>
  );
}

function EventForm({
  onSaved,
  onCancel,
  defaultCity,
  organizerPhone,
  termsAcceptedAt,
  initialEvent,
}) {
  const editing = Boolean(initialEvent);
  const [form, setForm] = useState(
      initialEvent
        ? {
            ...emptyEvent,
            ...initialEvent,
            start_time: initialEvent.start_time?.slice(0, 5) || "",
            play_end_time: initialEvent.play_end_time?.slice(0, 5) || "",
          }
        : { ...emptyEvent, city: defaultCity || "", organizer_contact_phone: organizerPhone || "" },
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    if (form.start_time && form.play_end_time && form.play_end_time <= form.start_time) {
      setMessage("Play end time must be later than play start time.");
      setBusy(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const payload = {
      name: form.name,
      description: form.description,
      venue: form.venue,
      city: form.city,
      event_date: form.event_date,
      start_time: form.start_time || null,
      play_end_time: form.play_end_time || null,
      registration_limit: form.registration_limit
        ? Number(form.registration_limit)
        : null,
      organizer_contact_phone: form.organizer_contact_phone.trim(),
      location_lat: form.location_lat === null || form.location_lat === "" ? null : Number(form.location_lat),
      location_lng: form.location_lng === null || form.location_lng === "" ? null : Number(form.location_lng),
      status: form.status,
      game_format: form.game_format,
      points_to_win: Number(form.points_to_win),
      skill_matching_mode: form.skill_matching_mode || "balanced",
      auto_assign_next_players: Boolean(form.auto_assign_next_players),
    };
    if (!editing)
      Object.assign(payload, {
        organizer_user_id: user.id,
        terms_accepted_at: termsAcceptedAt,
        terms_version: "2026-10-12-72h",
      });
    const query = editing
      ? supabase.from("events").update(payload).eq("id", initialEvent.id)
      : supabase.from("events").insert(payload);
    const { data, error } = await query.select().single();
    if (error) setMessage(error.message);
    else onSaved(data);
    setBusy(false);
  }
  return (
    <section className="profile-card event-form-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">
            {editing ? "Event settings" : "New event"}
          </span>
          <h2>{editing ? "Edit event" : "Create a pickleball event"}</h2>
        </div>
        <button className="text-button compact" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Event name
          <input
            required
            name="name"
            value={form.name}
            onChange={update}
            placeholder="Saturday Open Play"
          />
        </label>
        <label>
          Description <span>(optional)</span>
          <textarea
            name="description"
            value={form.description || ""}
            onChange={update}
            placeholder="Who should join and what players should expect"
          />
        </label>
        <label>
          Venue
          <input
            required
            name="venue"
            value={form.venue}
            onChange={update}
            placeholder="Club or court name"
          />
        </label>
        <label>
          Organizer contact phone
          <input
            required
            type="tel"
            name="organizer_contact_phone"
            value={form.organizer_contact_phone || ""}
            onChange={update}
            placeholder="Number players can call about this event"
          />
        </label>
        <div className="form-row">
          <label>
            City
            <input name="city" value={form.city || ""} onChange={update} />
          </label>
          <label>
            Player limit
            <input
              type="number"
              min="1"
              name="registration_limit"
              value={form.registration_limit || ""}
              onChange={update}
            />
          </label>
        </div>
        <fieldset className="event-game-settings">
          <legend><Settings2 size={18} /> Game settings</legend>
          <p>Choose how matches will run. These settings can still be changed during Game Day.</p>
          <div className="form-row">
            <label>
              Game format
              <select required name="game_format" value={form.game_format || "open_play"} onChange={update}>
                <option value="open_play">Open Play</option>
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
                <option value="mixed_doubles">Mixed doubles</option>
              </select>
            </label>
            <label>
              Points to win
              <input required type="number" min="1" max="99" name="points_to_win" value={form.points_to_win || 11} onChange={update} />
            </label>
          </div>
          {form.game_format === "open_play" && (
            <label>
              Skill Matching Mode
              <select name="skill_matching_mode" value={form.skill_matching_mode || "balanced"} onChange={update}>
                <option value="balanced">Balanced Matches</option>
                <option value="similar_skill">Similar Skill</option>
                <option value="mix_everyone">Mix Everyone</option>
              </select>
              <small>Balanced Matches is recommended. You can switch modes during Game Day.</small>
            </label>
          )}
          <label className="event-auto-assign">
            <input type="checkbox" checked={Boolean(form.auto_assign_next_players)} onChange={(event) => setForm({ ...form, auto_assign_next_players: event.target.checked })} />
            <span><strong>Automatically prepare the next match</strong><small>PickleFlow selects the next available players from the waiting queue.</small></span>
          </label>
        </fieldset>
        <LocationPicker
          latitude={form.location_lat}
          longitude={form.location_lng}
          onChange={(location_lat, location_lng) => setForm({ ...form, location_lat, location_lng })}
        />
        <div className="form-row">
          <label>
            Event date
            <input
              required
              type="date"
              name="event_date"
              value={form.event_date}
              onChange={update}
            />
          </label>
          <label>
            Play start time
            <input
              type="time"
              name="start_time"
              value={form.start_time}
              required
              onChange={update}
            />
          </label>
          <label>
            Play end time
            <input
              type="time"
              name="play_end_time"
              value={form.play_end_time}
              onChange={update}
              required
            />
            <small>Final equalization begins 30 minutes before this time.</small>
          </label>
        </div>
        {editing && (
          <label>
            Event status
            <select name="status" value={form.status} onChange={update}>
              <option value="draft">Draft</option>
              <option value="open">Open registration</option>
              <option value="closed">Registration closed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        )}
        {message && <div className="form-message error">{message}</div>}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create event"}
        </button>
      </form>
    </section>
  );
}

function EventList({ events, archives, onSelect, onNew, allowance, onUpgrade, allowAutoTour }) {
  const [showPageTour, setShowPageTour] = useState(false);
  useEffect(() => {
    if (allowAutoTour && !window.localStorage.getItem("pickleflow-tour-events")) setShowPageTour(true);
  }, [allowAutoTour]);
  async function copyLink(code) {
    await navigator.clipboard.writeText(
      `${window.location.origin}/?event=${code}`,
    );
    alert("Registration link copied.");
  }
  return (
    <section className="events-section">
      <div className="active-event-meter" data-tour="event-limit">
        <div><span>Active events</span><strong>{allowance.active_count} of {allowance.event_limit}</strong><small>Open events dated today or later</small></div>
        <button className="button button-donate" onClick={onUpgrade}><Heart size={17} /> Add active events</button>
      </div>
      <div className="section-title">
        <div>
          <span className="eyebrow">Your events</span>
          <h2>Event registration</h2>
        </div>
        <div className="title-actions"><button className="page-guide-button" type="button" onClick={() => setShowPageTour(true)}><HelpCircle size={17} /> Guide</button><button className="button button-primary" data-tour="create-event" onClick={onNew}>
          <Plus size={17} /> Create event
        </button></div>
      </div>
      {!events.length ? (
        <div className="empty-state">
          <CalendarDays size={36} />
          <h3>No events yet</h3>
          <p>Create your first event and share its player-registration link.</p>
        </div>
      ) : (
        <div className="event-grid">
          {events.map((item) => (
            <article className="event-card" data-tour="event-card" key={item.id}>
              <div className="event-card-top">
                <span className={`status-badge ${item.status}`}>
                  {item.status}
                </span>
                <span className="event-code">{item.event_code}</span>
              </div>
              <h3>{item.name}</h3>
              <p>
                <CalendarDays size={15} />{" "}
                {new Date(`${item.event_date}T00:00:00`).toLocaleDateString()}
              </p>
              <p>
                <MapPin size={15} /> {item.venue}
                {item.city ? `, ${item.city}` : ""}
              </p>
              <div className="event-actions">
                <button
                  className="button button-secondary"
                  onClick={() => onSelect(item)}
                >
                  View players
                </button>
                <button
                  className="icon-button"
                  onClick={() => copyLink(item.event_code)}
                  aria-label="Copy registration link"
                >
                  <Copy size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {archives.length > 0 && (
        <section className="event-history">
          <div className="section-title">
            <div>
              <span className="eyebrow">Retained summaries</span>
              <h2>Event history</h2>
            </div>
          </div>
          <p className="muted">Player details, contacts, queues, and game records have been permanently deleted.</p>
          <div className="event-grid archive-grid">
            {archives.map((item) => (
              <article className="event-card archive-card" key={item.id}>
                <div className="event-card-top">
                  <span className="status-badge archived">Archived</span>
                  <span className="event-code">Summary only</span>
                </div>
                <h3>{item.event_name}</h3>
                <p><CalendarDays size={15} /> {new Date(`${item.event_date}T00:00:00`).toLocaleDateString()}</p>
                <div className="archive-counts">
                  <span><Users size={16} /><strong>{item.player_count}</strong> players</span>
                  <span><Swords size={16} /><strong>{item.game_count}</strong> games</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <ContextualTour open={showPageTour} onClose={() => setShowPageTour(false)} storageKey="pickleflow-tour-events" steps={[
        { selector: '[data-tour="event-limit"]', title: "Your active-event allowance", text: "This shows how many current and future open events you can have. Completed or past events do not use this allowance." },
        { selector: '[data-tour="create-event"]', title: "Create an event", text: "Tap here first. Add the date, venue, player limit, and other event details." },
        { selector: '[data-tour="event-card"]', title: "Open your event", text: "Each event appears as a card. Open it to manage registration, players, exports, and Game Day." },
      ]} />
    </section>
  );
}

function EventPlayers({ event, onBack, onEdit, onGameDay, onEventUpdated }) {
  const [showPageTour, setShowPageTour] = useState(false);
  const [players, setPlayers] = useState([]),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [showWalkIn, setShowWalkIn] = useState(false),
    [walkIn, setWalkIn] = useState(emptyPlayer),
    [message, setMessage] = useState(""),
    [request, setRequest] = useState(null),
    [showExtension, setShowExtension] = useState(false),
    [extension, setExtension] = useState({
      requested_until: addDays(
        event.retention_extended_until || event.event_date,
        event.retention_extended_until ? 1 : 30,
      ),
      reason: "",
    }),
    [showReopenPrompt, setShowReopenPrompt] = useState(false),
    [reopening, setReopening] = useState(false),
    [showImport, setShowImport] = useState(false),
    [importRows, setImportRows] = useState([]),
    [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!window.localStorage.getItem("pickleflow-tour-players")) setShowPageTour(true);
  }, []);
  const registrationOpen = event.status === "open";
  const deletionDate =
    event.retention_extended_until || addDays(event.event_date, 3);
  const activeCount = players.filter(
    (player) => player.status !== "cancelled",
  ).length;
  const confirmedCount = players.filter(
    (player) => player.status === "confirmed",
  ).length;
  const waitlistedCount = players.filter(
    (player) => player.status === "waitlisted",
  ).length;
  const visiblePlayers = players.filter(
    (player) =>
      (filter === "all" || player.status === filter) &&
      `${player.full_name} ${player.email || ""} ${player.phone || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function loadPlayers() {
    setLoading(true);
    const [{ data }, { data: requests }] = await Promise.all([
      supabase
        .from("player_registrations")
        .select("*")
        .eq("event_id", event.id)
        .order("created_at"),
      supabase
        .from("retention_extension_requests")
        .select("*")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    setPlayers(data || []);
    setRequest(requests?.[0] || null);
    setLoading(false);
  }
  useEffect(() => {
    loadPlayers();
  }, [event.id]);
  async function updateStatus(player, status) {
    const { error } = await supabase
      .from("player_registrations")
      .update({ status })
      .eq("id", player.id);
    if (error) setMessage(error.message);
    else
      setPlayers(
        players.map((item) =>
          item.id === player.id ? { ...item, status } : item,
        ),
      );
  }
  async function addWalkIn(e) {
    e.preventDefault();
    setMessage("");
    if (!registrationOpen)
      return setMessage(
        "Registration is closed. Reopen registration to add a walk-in.",
      );
    const { data, error } = await supabase
      .from("player_registrations")
      .insert({
        ...walkIn,
        full_name: walkIn.full_name.trim(),
        email: walkIn.email.trim() || null,
        phone: walkIn.phone.trim() || null,
        event_id: event.id,
      })
      .select()
      .single();
    if (error) setMessage(playerRegistrationError(error));
    else {
      setPlayers([...players, data]);
      setWalkIn(emptyPlayer);
      setShowWalkIn(false);
    }
  }
  async function changeEventStatus(status) {
    if (
      status === "cancelled" &&
      !window.confirm(
        "Cancel this event? The registration link will stop working.",
      )
    )
      return false;
    const { data, error } = await supabase
      .from("events")
      .update({ status })
      .eq("id", event.id)
      .select()
      .single();
    if (error) {
      setMessage(error.message);
      return false;
    }
    onEventUpdated(data);
    return true;
  }
  function openWalkIn() {
    if (!registrationOpen) return setShowReopenPrompt(true);
    setShowWalkIn(!showWalkIn);
  }
  async function reopenAndAddPlayer() {
    setReopening(true);
    setMessage("");
    const reopened = await changeEventStatus("open");
    setReopening(false);
    if (reopened) {
      setShowReopenPrompt(false);
      setShowWalkIn(true);
      setMessage("Registration reopened. You can now add the player.");
    }
  }
  if (showReopenPrompt)
    return (
      <div className="modal-backdrop">
        <section
          className="game-complete-dialog reopen-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reopen-registration-title"
        >
          <span className="dialog-icon">
            <UserPlus size={25} />
          </span>
          <span className="eyebrow">Registration closed</span>
          <h2 id="reopen-registration-title">Reopen registration?</h2>
          <p className="muted">
            Registration must be open before a new walk-in player can be added.
            Reopening also allows players to use the public registration link
            again.
          </p>
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              onClick={() => setShowReopenPrompt(false)}
              disabled={reopening}
            >
              Not now
            </button>
            <button
              className="button button-primary"
              onClick={reopenAndAddPlayer}
              disabled={reopening}
            >
              {reopening ? "Reopening…" : "Reopen and add player"}
            </button>
          </div>
        </section>
      </div>
    );
  async function requestExtension(e) {
    e.preventDefault();
    setMessage("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("retention_extension_requests")
      .insert({
        event_id: event.id,
        organizer_user_id: user.id,
        requested_until: extension.requested_until,
        reason: extension.reason,
      })
      .select()
      .single();
    if (error) setMessage(error.message);
    else {
      setRequest(data);
      setShowExtension(false);
      setMessage("Extension request submitted for administrator review.");
    }
  }
  function exportCsv() {
    const rows = [
      ["Player", "Email", "Phone", "Skill level", "Status", "Registered"],
      ...visiblePlayers.map((player) => [
        player.full_name,
        player.email,
        player.phone || "",
        player.skill_level,
        player.status,
        player.created_at,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${event.event_code}-players.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function exportPdf() {
    const document = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = document.internal.pageSize.getWidth();
    const pageHeight = document.internal.pageSize.getHeight();
    const green = [20, 92, 68];
    const dark = [25, 42, 36];
    const muted = [91, 107, 101];
    const gold = [232, 176, 59];
    const clean = (value, fallback = "—") => value || fallback;
    const label = (value) =>
      String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const eventTime = event.start_time
      ? new Date(`2000-01-01T${event.start_time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "Not specified";
    const addHeader = () => {
      document.setFillColor(...green);
      document.rect(0, 0, pageWidth, 31, "F");
      document.setFillColor(...gold);
      document.rect(0, 31, pageWidth, 2, "F");
      document.setTextColor(255, 255, 255);
      document.setFont("helvetica", "bold");
      document.setFontSize(19);
      document.text("PICKLEFLOW", 15, 14);
      document.setFont("helvetica", "normal");
      document.setFontSize(9);
      document.text("EVENT DETAILS & PLAYER ROSTER", 15, 22);
      document.setFont("helvetica", "bold");
      document.setFontSize(11);
      document.text(event.event_code, pageWidth - 15, 18, { align: "right" });
    };
    const addFooter = () => {
      const pages = document.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        document.setPage(page);
        document.setDrawColor(220, 228, 224);
        document.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);
        document.setFont("helvetica", "normal");
        document.setFontSize(8);
        document.setTextColor(...muted);
        document.text("Generated by PickleFlow", 15, pageHeight - 9);
        document.text(`Page ${page} of ${pages}`, pageWidth - 15, pageHeight - 9, { align: "right" });
      }
    };

    addHeader();
    document.setTextColor(...dark);
    document.setFont("helvetica", "bold");
    document.setFontSize(22);
    const titleLines = document.splitTextToSize(event.name, pageWidth - 30);
    document.text(titleLines, 15, 47);
    let cursorY = 47 + titleLines.length * 8;
    document.setFont("helvetica", "normal");
    document.setFontSize(10);
    document.setTextColor(...muted);
    if (event.description) {
      const descriptionLines = document.splitTextToSize(event.description, pageWidth - 30);
      document.text(descriptionLines, 15, cursorY);
      cursorY += descriptionLines.length * 5 + 5;
    }
    autoTable(document, {
      startY: cursorY,
      theme: "plain",
      margin: { left: 15, right: 15 },
      body: [
        ["DATE", formatDate(event.event_date), "START TIME", eventTime],
        ["VENUE", event.venue, "CITY", clean(event.city)],
        ["STATUS", label(event.status), "PLAYER LIMIT", clean(event.registration_limit, "No limit")],
        ["REGISTERED", `${activeCount} active players`, "DATA DELETION", formatDate(deletionDate)],
      ],
      styles: { fontSize: 9, cellPadding: 3.2, textColor: dark },
      columnStyles: {
        0: { fontStyle: "bold", textColor: green, cellWidth: 28 },
        1: { cellWidth: 59 },
        2: { fontStyle: "bold", textColor: green, cellWidth: 30 },
      },
      alternateRowStyles: { fillColor: [244, 248, 246] },
    });
    const rosterY = document.lastAutoTable.finalY + 12;
    document.setFont("helvetica", "bold");
    document.setFontSize(15);
    document.setTextColor(...dark);
    document.text("Player roster", 15, rosterY);
    document.setFont("helvetica", "normal");
    document.setFontSize(9);
    document.setTextColor(...muted);
    document.text(`${confirmedCount} confirmed · ${waitlistedCount} waitlisted · ${players.length} total records`, 15, rosterY + 6);
    autoTable(document, {
      startY: rosterY + 10,
      margin: { left: 15, right: 15, top: 39, bottom: 21 },
      head: [["#", "Player", "Contact", "Skill level", "Status"]],
      body: players.map((player, index) => [
        index + 1,
        player.full_name,
        player.email || player.phone || "—",
        label(player.skill_level),
        label(player.status),
      ]),
      headStyles: { fillColor: green, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 248, 246] },
      styles: { fontSize: 8.5, cellPadding: 2.8, textColor: dark },
      columnStyles: { 0: { cellWidth: 10, halign: "center" } },
      didDrawPage: ({ pageNumber }) => { if (pageNumber > 1) addHeader(); },
    });
    addFooter();
    const slug = event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    document.save(`${event.event_code}-${slug}.pdf`);
  }
  function downloadImportTemplate() {
    const csv = "Full Name,Email,Phone,Skill Level\nMaria Santos,maria@example.com,09171234567,intermediate\nJuan Dela Cruz,,,beginner\n";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "pickleflow-player-import-template.csv";
    link.click(); URL.revokeObjectURL(link.href);
  }
  async function readImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) return setMessage("The CSV file does not contain any player rows.");
    const headers = parsed[0].map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const findColumn = (...names) => headers.findIndex((header) => names.includes(header));
    const nameIndex = findColumn("fullname", "player", "playername", "name");
    const emailIndex = findColumn("email", "emailaddress");
    const phoneIndex = findColumn("phone", "phonenumber", "mobile");
    const skillIndex = findColumn("skill", "skilllevel", "level");
    if (nameIndex < 0) return setMessage('The CSV must include a "Full Name" column.');
    const existingNames = new Set(players.map((player) => player.full_name.trim().toLowerCase()));
    const fileNames = new Set();
    const allowedSkills = new Set(["novice", "beginner", "intermediate", "advanced", "competitive"]);
    const rows = parsed.slice(1).map((values, index) => {
      const full_name = (values[nameIndex] || "").trim();
      const email = emailIndex >= 0 ? (values[emailIndex] || "").trim() : "";
      const phone = phoneIndex >= 0 ? (values[phoneIndex] || "").trim() : "";
      const skill = skillIndex >= 0 ? (values[skillIndex] || "beginner").trim().toLowerCase().replaceAll(" ", "_") : "beginner";
      const key = full_name.toLowerCase();
      let error = "";
      if (!full_name) error = "Full name is required";
      else if (existingNames.has(key)) error = "Name already exists in this event";
      else if (fileNames.has(key)) error = "Duplicate name in file";
      else if (!allowedSkills.has(skill)) error = "Invalid skill level";
      else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Invalid email address";
      fileNames.add(key);
      return { row: index + 2, full_name, email, phone, skill_level: skill, error };
    });
    setImportRows(rows); setShowImport(true); setMessage("");
  }
  async function importPlayers() {
    const validRows = importRows.filter((row) => !row.error);
    if (!validRows.length) return;
    setImporting(true);
    const added = [], failed = [];
    for (const row of validRows) {
      const { data, error } = await supabase.from("player_registrations").insert({
        event_id: event.id, full_name: row.full_name,
        email: row.email || null, phone: row.phone || null,
        skill_level: row.skill_level,
      }).select().single();
      if (error) failed.push({ ...row, error: playerRegistrationError(error) });
      else added.push(data);
    }
    setPlayers([...players, ...added]);
    setImportRows(failed);
    setImporting(false);
    if (!failed.length) setShowImport(false);
    setMessage(`${added.length} player${added.length === 1 ? "" : "s"} imported${failed.length ? `; ${failed.length} could not be imported.` : "."}`);
  }
  return (
    <section className="profile-card roster-card">
      <div className="section-title">
        <div>
          <span className="eyebrow">Event code {event.event_code}</span>
          <h2>{event.name}</h2>
        </div>
        <div className="title-actions"><button className="page-guide-button" type="button" onClick={() => setShowPageTour(true)}><HelpCircle size={17} /> Guide</button>
          <button className="button button-primary" data-tour="open-game-day" onClick={onGameDay} disabled={event.status === "completed"} title={event.status === "completed" ? "This event has ended" : "Open Game Day"}>
            {event.status === "completed" ? "Event ended" : "Open game day"}
          </button>
          <button className="button button-secondary" onClick={onBack}>
            Back to events
          </button>
        </div>
      </div>
      <div className="event-detail-bar" data-tour="registration-control">
        <div>
          <p className="muted">
            {event.venue} · {formatDate(event.event_date)}
          </p>
          <span className={`status-badge ${event.status}`}>{event.status}</span>
        </div>
        <div className="event-control-buttons">
          <button className="button button-secondary" onClick={onEdit}>
            <Edit3 size={16} /> Edit
          </button>
          {event.status === "open" ? (
            <button
              className="button button-secondary"
              onClick={() => changeEventStatus("closed")}
            >
              Close registration
            </button>
          ) : (
            event.status === "closed" && (
              <button
                className="button button-primary"
                onClick={() => changeEventStatus("open")}
              >
                Reopen registration
              </button>
            )
          )}
          {!["cancelled", "completed"].includes(event.status) && (
            <button
              className="button button-danger"
              onClick={() => changeEventStatus("cancelled")}
            >
              <XCircle size={16} /> Cancel event
            </button>
          )}
        </div>
      </div>
      <div className="retention-summary">
        <div>
          <strong>Scheduled data deletion: {formatDate(deletionDate)}</strong>
          <span>
            {event.retention_extended_until
              ? "Administrator-approved extended retention date."
              : "Personal and operational data are deleted 72 hours after the event date; summary totals remain."}
          </span>
        </div>
        {request?.status === "pending" ? (
          <span className="request-pill">Extension pending</span>
        ) : (
          <button
            className="text-button compact"
            onClick={() => setShowExtension(!showExtension)}
          >
            Request more time
          </button>
        )}
      </div>
      {showExtension && (
        <form className="inline-panel" onSubmit={requestExtension}>
          <div className="form-row">
            <label>
              Requested retention date
              <input
                required
                type="date"
                min={addDays(deletionDate, 1)}
                value={extension.requested_until}
                onChange={(e) =>
                  setExtension({
                    ...extension,
                    requested_until: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Reason
              <textarea
                required
                minLength="10"
                value={extension.reason}
                onChange={(e) =>
                  setExtension({ ...extension, reason: e.target.value })
                }
                placeholder="Why do you need additional time?"
              />
            </label>
          </div>
          <button className="button button-primary">Submit request</button>
        </form>
      )}
      <div className="roster-stats">
        <div>
          <strong>
            {activeCount}
            {event.registration_limit ? ` / ${event.registration_limit}` : ""}
          </strong>
          <span>Active players</span>
        </div>
        <div>
          <strong>{confirmedCount}</strong>
          <span>Confirmed</span>
        </div>
        <div>
          <strong>{waitlistedCount}</strong>
          <span>Waitlisted</span>
        </div>
      </div>
      <div className="roster-toolbar" data-tour="player-tools">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search players"
            placeholder="Search players"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button data-tour="add-walkin"
          className={`button button-secondary ${!registrationOpen ? "requires-reopen" : ""}`}
          aria-disabled={!registrationOpen}
          title={
            registrationOpen
              ? undefined
              : "Reopen registration to add a walk-in"
          }
          onClick={openWalkIn}
        >
          <UserPlus size={16} /> Add walk-in
        </button>
        <button
          className="button button-secondary"
          onClick={exportCsv}
          disabled={!visiblePlayers.length}
        >
          <Download size={16} /> Export CSV
        </button>
        <button className="button button-secondary" onClick={exportPdf}>
          <Download size={16} /> Export PDF
        </button>
        <label className="button button-secondary import-file-button" data-tour="import-players">
          <FileUp size={16} /> Import CSV
          <input type="file" accept=".csv,text/csv" onChange={readImportFile} />
        </label>
      </div>
      <ContextualTour open={showPageTour} onClose={() => setShowPageTour(false)} storageKey="pickleflow-tour-players" steps={[
        { selector: '[data-tour="registration-control"]', title: "Control registration", text: "Edit the event or close and reopen public registration from this area." },
        { selector: '[data-tour="player-tools"]', title: "Find and manage players", text: "Search, filter, add walk-ins, import a CSV, or export your event information." },
        { selector: '[data-tour="add-walkin"]', title: "Add a player yourself", text: "Use Add walk-in for a player who arrives without registering online." },
        { selector: '[data-tour="import-players"]', title: "Import many players", text: "Upload the CSV template when you already have a player list." },
        { selector: '[data-tour="open-game-day"]', title: "Start Game Day", text: "When players begin arriving, open Game Day for check-in, queues, courts, and scoring." },
      ]} />
      {showImport && <section className="inline-panel import-panel">
        <div className="import-heading"><div><h3>Import player list</h3><p className="muted">Review the file before importing. Email and phone are optional.</p></div><button className="text-button compact" onClick={downloadImportTemplate}><Download size={15} /> Download template</button></div>
        <div className="import-preview"><table className="player-table"><thead><tr><th>Row</th><th>Player</th><th>Contact</th><th>Skill</th><th>Validation</th></tr></thead><tbody>{importRows.map((row) => <tr key={row.row}><td>{row.row}</td><td><strong>{row.full_name || "Missing name"}</strong></td><td>{row.email || row.phone || "—"}</td><td className="capitalize">{row.skill_level.replaceAll("_", " ")}</td><td><span className={`import-status ${row.error ? "invalid" : "valid"}`}>{row.error || "Ready"}</span></td></tr>)}</tbody></table></div>
        <div className="dialog-actions"><button className="button button-secondary" onClick={() => { setShowImport(false); setImportRows([]); }} disabled={importing}>Cancel</button><button className="button button-secondary" onClick={downloadImportTemplate}><Download size={16} /> Template</button><button className="button button-primary" onClick={importPlayers} disabled={importing || !importRows.some((row) => !row.error)}><FileUp size={16} /> {importing ? "Importing…" : `Import ${importRows.filter((row) => !row.error).length} players`}</button></div>
      </section>}
      {showWalkIn && registrationOpen && (
        <form className="inline-panel" onSubmit={addWalkIn}>
          <div className="contact-hint">
            Email and phone are optional. Player names must be unique for this
            event.
          </div>
          <div className="form-row">
            <label>
              Full name
              <input
                required
                value={walkIn.full_name}
                onChange={(e) =>
                  setWalkIn({ ...walkIn, full_name: e.target.value })
                }
              />
            </label>
            <label>
              Email <span>(optional)</span>
              <input
                type="email"
                value={walkIn.email}
                onChange={(e) =>
                  setWalkIn({ ...walkIn, email: e.target.value })
                }
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Phone <span>(optional)</span>
              <input
                value={walkIn.phone}
                onChange={(e) =>
                  setWalkIn({ ...walkIn, phone: e.target.value })
                }
              />
            </label>
            <label>
              Skill level
              <select
                value={walkIn.skill_level}
                onChange={(e) =>
                  setWalkIn({ ...walkIn, skill_level: e.target.value })
                }
              >
                <option value="novice">Novice</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="competitive">Competitive</option>
              </select>
            </label>
          </div>
          <button className="button button-primary">Add player</button>
        </form>
      )}
      {message && <div className="form-message">{message}</div>}
      {loading ? (
        <p>Loading players…</p>
      ) : !players.length ? (
        <div className="empty-state small">
          <Users size={30} />
          <h3>No registered players yet</h3>
          <p>Share the event link or add a walk-in.</p>
        </div>
      ) : (
        <div className="player-table-wrap">
          <table className="player-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Skill level</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((player) => (
                <tr key={player.id}>
                  <td data-label="Player">
                    <strong>{player.full_name}</strong>
                  </td>
                  <td data-label="Skill level" className="capitalize">
                    {player.skill_level}
                  </td>
                  <td data-label="Contact">
                    <div className="desktop-contact">
                      {player.email || "No email"}
                      <br />
                      <span>{player.phone || "No phone"}</span>
                    </div>
                    <details className="player-contact">
                      <summary>Contact details</summary>
                      <div>
                        {player.email || "No email"}
                        <br />
                        <span>{player.phone || "No phone"}</span>
                      </div>
                    </details>
                  </td>
                  <td data-label="Status">
                    <select
                      aria-label={`Registration status for ${player.full_name}`}
                      className="status-select"
                      value={player.status}
                      onChange={(e) => updateStatus(player, e.target.value)}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="waitlisted">Waitlisted</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visiblePlayers.length && (
            <p className="muted table-empty">No players match this filter.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Dashboard({ session, onSignOut }) {
  const dashboardStateKey = `pickleflow-dashboard-${session.user.id}`;
  const walkthroughKey = `pickleflow-onboarding-seen-${session.user.id}`;
  const welcomeKey = `pickleflow-welcome-dismissed-${session.user.id}`;
  const [profile, setProfile] = useState(emptyProfile),
    [events, setEvents] = useState([]),
    [archives, setArchives] = useState([]),
    [view, setView] = useState("events"),
    [selectedEvent, setSelectedEvent] = useState(null),
    [termsAcceptedAt, setTermsAcceptedAt] = useState(null),
    [allowance, setAllowance] = useState({ active_count: 0, event_limit: 3, additional_events: 0 }),
    [isAdmin, setIsAdmin] = useState(false),
    [saved, setSaved] = useState(""),
    [showWelcome, setShowWelcome] = useState(
      () => !window.localStorage.getItem(welcomeKey),
    ),
    [showWalkthrough, setShowWalkthrough] = useState(false),
    [loading, setLoading] = useState(true);
  async function loadEvents() {
    const [eventResult, archiveResult, allowanceResult] = await Promise.all([
      supabase.from("events").select("*").eq("organizer_user_id", session.user.id).order("event_date", { ascending: false }),
      supabase.from("event_archives").select("*").eq("organizer_user_id", session.user.id).order("event_date", { ascending: false }),
      supabase.rpc("active_event_allowance", { target_user_id: session.user.id }),
    ]);
    setEvents(eventResult.data || []);
    setArchives(archiveResult.data || []);
    if (allowanceResult.data?.[0]) setAllowance(allowanceResult.data[0]);
  }
  useEffect(() => {
    Promise.all([
      supabase
        .from("organizer_profiles")
        .select("full_name, organization_name, phone, city, country")
        .eq("user_id", session.user.id)
        .single(),
      supabase
        .from("events")
        .select("*")
        .eq("organizer_user_id", session.user.id)
        .order("event_date", { ascending: false }),
      supabase
        .from("event_archives")
        .select("*")
        .eq("organizer_user_id", session.user.id)
        .order("event_date", { ascending: false }),
      supabase.rpc("active_event_allowance", { target_user_id: session.user.id }),
      supabase.rpc("is_platform_admin"),
    ]).then(([profileResult, eventResult, archiveResult, allowanceResult, adminResult]) => {
      const loadedEvents = eventResult.data || [];
      if (profileResult.data)
        setProfile({ ...emptyProfile, ...profileResult.data });
      setEvents(loadedEvents);
      setArchives(archiveResult.data || []);
      if (allowanceResult.data?.[0]) setAllowance(allowanceResult.data[0]);
      setIsAdmin(Boolean(adminResult.data));
      if (!loadedEvents.length && !window.localStorage.getItem(walkthroughKey)) setShowWalkthrough(true);
      try {
        const savedState = JSON.parse(
          window.localStorage.getItem(dashboardStateKey) || "null",
        );
        const savedEvent = loadedEvents.find(
          (event) => event.id === savedState?.eventId,
        );
        if (
          savedEvent &&
          ["players", "edit", "game-day"].includes(savedState?.view)
        ) {
          setSelectedEvent(savedEvent);
          setView(savedState.view);
        }
      } catch {
        window.localStorage.removeItem(dashboardStateKey);
      }
      setLoading(false);
    });
  }, [session.user.id]);
  function closeWalkthrough() {
    window.localStorage.setItem(walkthroughKey, "true");
    setShowWalkthrough(false);
  }
  function closeWelcome() {
    window.localStorage.setItem(welcomeKey, "true");
    setShowWelcome(false);
  }
  useEffect(() => {
    if (loading) return;
    if (selectedEvent && ["players", "edit", "game-day"].includes(view)) {
      window.localStorage.setItem(
        dashboardStateKey,
        JSON.stringify({ view, eventId: selectedEvent.id }),
      );
    } else {
      window.localStorage.removeItem(dashboardStateKey);
    }
  }, [dashboardStateKey, loading, selectedEvent, view]);
  async function saveProfile(e) {
    e.preventDefault();
    setSaved("");
    const { error } = await supabase
      .from("organizer_profiles")
      .update(profile)
      .eq("user_id", session.user.id);
    setSaved(error ? error.message : "Profile saved.");
  }
  if (loading)
    return (
      <main className="dashboard">
        <p>Loading PickleFlow…</p>
      </main>
    );
  function replaceEvent(item) {
    setEvents(events.map((event) => (event.id === item.id ? item : event)));
    setSelectedEvent(item);
  }
  const dashboardNavigation = (
    <nav className="dashboard-tabs" aria-label="Organizer navigation">
      <button
        className={view !== "profile" ? "active" : ""}
        onClick={() => setView("events")}
      >
        Events
      </button>
      <button
        className={view === "profile" ? "active" : ""}
        onClick={() => setView("profile")}
      >
        Organizer profile
      </button>
      {isAdmin && <a href="/admin">Platform Admin</a>}
    </nav>
  );
  return (
    <>
      <Header
        session={session}
        onSignOut={onSignOut}
        dashboardNavigation={dashboardNavigation}
      />
      <main className="dashboard">
      {showWelcome && view !== "game-day" && (
      <section className="welcome-card">
        <button className="welcome-close" type="button" aria-label="Close welcome banner" onClick={closeWelcome}><X size={20} /></button>
        <span className="eyebrow">
          <ShieldCheck size={15} /> Organizer account
        </span>
        <h1>
          Welcome
          {profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
        </h1>
        <p>
          Create an event and share its link so players can register without
          creating an account.
        </p>
        <button className="welcome-guide-button" type="button" onClick={() => setShowWalkthrough(true)}><HelpCircle size={18} /> Show me how</button>
      </section>
      )}
      {view === "events" && (
        <EventList
          events={events}
          archives={archives}
          onSelect={(item) => {
            setSelectedEvent(item);
            setView("players");
          }}
          onNew={() => setView("terms")}
          allowance={allowance}
          onUpgrade={() => setView("upgrade")}
          allowAutoTour={!showWalkthrough}
        />
      )}
      {view === "upgrade" && <ActiveEventUpgrade session={session} onBack={() => setView("events")} onSubmitted={loadEvents} />}
      {view === "terms" && (
        <TermsStep
          onAccept={(acceptedAt) => {
            setTermsAcceptedAt(acceptedAt);
            setView("new");
          }}
          onCancel={() => setView("events")}
        />
      )}
      {view === "new" && (
        <EventForm
          defaultCity={profile.city}
          organizerPhone={profile.phone}
          termsAcceptedAt={termsAcceptedAt}
          onSaved={(item) => {
            setEvents([item, ...events]);
            setTermsAcceptedAt(null);
            setView("events");
          }}
          onCancel={() => {
            setTermsAcceptedAt(null);
            setView("events");
          }}
        />
      )}
      {view === "edit" && selectedEvent && (
        <EventForm
          initialEvent={selectedEvent}
          organizerPhone={profile.phone}
          onSaved={(item) => {
            replaceEvent(item);
            setView("players");
          }}
          onCancel={() => setView("players")}
        />
      )}
      {view === "players" && selectedEvent && (
        <EventPlayers
          event={selectedEvent}
          onEdit={() => setView("edit")}
          onGameDay={() => setView("game-day")}
          onEventUpdated={replaceEvent}
          onBack={() => {
            loadEvents();
            setView("events");
          }}
        />
      )}
      {view === "game-day" && selectedEvent && (
        <GameDay
          event={selectedEvent}
          onEventUpdated={replaceEvent}
          onBack={() => setView("players")}
        />
      )}
      {showWalkthrough && <OrganizerWalkthrough onClose={closeWalkthrough} />}
      {view === "profile" && (
        <section className="profile-card">
          <h2>Organizer profile</h2>
          <form onSubmit={saveProfile}>
            <label>
              Full name
              <input
                required
                value={profile.full_name}
                onChange={(e) =>
                  setProfile({ ...profile, full_name: e.target.value })
                }
              />
            </label>
            <label>
              Club or organization
              <input
                required
                value={profile.organization_name}
                onChange={(e) =>
                  setProfile({ ...profile, organization_name: e.target.value })
                }
              />
            </label>
            <label>
              Phone number
              <input
                value={profile.phone || ""}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
              />
            </label>
            <div className="form-row">
              <label>
                City
                <input
                  value={profile.city || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, city: e.target.value })
                  }
                />
              </label>
              <label>
                Country
                <input
                  value={profile.country || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, country: e.target.value })
                  }
                />
              </label>
            </div>
            {saved && <div className="form-message">{saved}</div>}
            <button className="button button-primary">Save profile</button>
          </form>
        </section>
      )}
      </main>
    </>
  );
}

function PlatformAdminPage({ session, onLogin }) {
  const [allowed, setAllowed] = useState(null);
  const [requests, setRequests] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [organizers, setOrganizers] = useState([]);
  const [organizerSearch, setOrganizerSearch] = useState("");
  const [selectedOrganizerId, setSelectedOrganizerId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const { data: admin } = await supabase.rpc("is_platform_admin");
    setAllowed(Boolean(admin));
    if (admin) {
      setLoading(true);
      const [requestResult, organizerResult, suggestionResult] = await Promise.all([
        supabase.from("active_event_upgrade_requests").select("*").order("created_at", { ascending: false }),
        supabase.rpc("admin_organizer_activity"),
        supabase.from("app_improvement_suggestions").select("*").order("created_at", { ascending: false }),
      ]);
      if (requestResult.error || organizerResult.error || suggestionResult.error) setMessage(requestResult.error?.message || organizerResult.error?.message || suggestionResult.error?.message);
      else {
        setRequests(requestResult.data || []);
        setOrganizers(organizerResult.data || []);
        setSuggestions(suggestionResult.data || []);
        setSelectedOrganizerId((current) => current || organizerResult.data?.[0]?.user_id || null);
      }
      setLoading(false);
    }
  }
  useEffect(() => { if (session) load(); else setAllowed(false); }, [session]);
  async function review(request, approve) {
    setMessage("");
    const { error } = await supabase.rpc("review_active_event_upgrade", { p_request_id: request.id, p_approve: approve });
    if (error) return setMessage(error.message);
    sendNotification("upgrade_reviewed", { requestId: request.id });
    setMessage(approve ? `Approved +${request.requested_events} active events.` : "Request declined.");
    load();
  }
  async function viewProof(path) {
    const { data, error } = await supabase.storage.from("event-upgrade-proofs").createSignedUrl(path, 300);
    if (error) setMessage(error.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  async function updateSuggestionStatus(id, status) {
    setMessage("");
    const { error } = await supabase.from("app_improvement_suggestions").update({ status }).eq("id", id);
    if (error) return setMessage(error.message);
    sendNotification("suggestion_status", { suggestionId: id });
    setSuggestions((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    setMessage(`Suggestion moved to ${status}.`);
  }
  async function viewSuggestionProof(path) {
    const { data, error } = await supabase.storage.from("suggestion-payment-proofs").createSignedUrl(path, 300);
    if (error) setMessage(error.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const filteredOrganizers = organizers.filter((organizer) => {
    const query = organizerSearch.trim().toLowerCase();
    return !query || [organizer.full_name, organizer.organization_name, organizer.email, organizer.phone, organizer.city, organizer.country]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
  const organizerTotals = organizers.reduce((totals, organizer) => ({
    events: totals.events + organizer.event_count,
    active: totals.active + organizer.active_event_count,
    players: totals.players + organizer.player_count,
    games: totals.games + organizer.game_count,
  }), { events: 0, active: 0, players: 0, games: 0 });
  const selectedOrganizer = filteredOrganizers.find((organizer) => organizer.user_id === selectedOrganizerId)
    || filteredOrganizers[0]
    || null;
  const dateTime = (value) => value ? new Date(value).toLocaleString() : "No activity yet";
  if (!session) return <main className="dashboard"><section className="profile-card admin-empty"><ShieldCheck /><h1>Platform Admin</h1><p>Sign in with an administrator account.</p><button className="button button-primary" onClick={onLogin}>Log in</button></section></main>;
  if (allowed === null) return <main className="dashboard"><p>Checking administrator access…</p></main>;
  if (!allowed) return <main className="dashboard"><section className="profile-card admin-empty"><XCircle /><h1>Access denied</h1><p>This page is available only to PickleFlow platform administrators.</p><a className="button button-secondary" href="/">Return home</a></section></main>;
  return <main className="dashboard admin-page">
    <section className="welcome-card"><span className="eyebrow"><ShieldCheck size={15} /> Platform Admin</span><h1>Platform activity</h1><p>Monitor organizers, events, player registrations, games, suggestions, and active-event upgrade requests.</p></section>
    {message && <div className="form-message">{message}</div>}
    <section className="admin-summary-grid">
      <article><Users size={20} /><span>Organizers</span><strong>{organizers.length}</strong></article>
      <article><CalendarDays size={20} /><span>Events</span><strong>{organizerTotals.events}</strong><small>{organizerTotals.active} active</small></article>
      <article><UserPlus size={20} /><span>Players</span><strong>{organizerTotals.players}</strong></article>
      <article><Activity size={20} /><span>Games</span><strong>{organizerTotals.games}</strong></article>
    </section>
    <section className="profile-card admin-organizers-card">
      <div className="section-title"><div><span className="eyebrow">Organizer directory</span><h2>All organizers and activity</h2></div><a className="button button-secondary" href="/">Organizer dashboard</a></div>
      <label className="admin-search"><Search size={18} /><input value={organizerSearch} onChange={(event) => setOrganizerSearch(event.target.value)} placeholder="Search name, organization, email, phone, or location" /></label>
      {loading ? <div className="empty-state"><p>Loading organizer activity…</p></div> : !filteredOrganizers.length ? <div className="empty-state"><Users size={36} /><h3>No organizers found</h3><p>Try a different search.</p></div> : <div className="admin-organizer-split">
        <aside className="admin-organizer-sidebar" aria-label="Organizer list">
          {filteredOrganizers.map((organizer) => <button className={`admin-organizer-nav ${selectedOrganizer?.user_id === organizer.user_id ? "selected" : ""}`} key={organizer.user_id} onClick={() => setSelectedOrganizerId(organizer.user_id)}>
            <span className="admin-avatar">{(organizer.full_name || organizer.email || "O").charAt(0).toUpperCase()}</span>
            <span><b>{organizer.full_name || "Organizer"}</b><small>{organizer.organization_name || organizer.email}</small><em>{organizer.event_count} events · {organizer.player_count} players</em></span>
          </button>)}
        </aside>
        {selectedOrganizer && <article className="admin-organizer-canvas">
          <header className="admin-organizer-canvas-header">
            <div className="admin-organizer-identity"><span className="admin-avatar large">{(selectedOrganizer.full_name || selectedOrganizer.email || "O").charAt(0).toUpperCase()}</span><div><h3>{selectedOrganizer.full_name || "Organizer"}</h3><p>{selectedOrganizer.organization_name || "Independent organizer"}</p><small>{selectedOrganizer.email}{selectedOrganizer.phone ? ` · ${selectedOrganizer.phone}` : ""}</small></div></div>
            <div className="admin-organizer-last"><span className={`status-badge ${selectedOrganizer.profile_status}`}>{selectedOrganizer.profile_status}</span><small>Last activity</small><b>{dateTime(selectedOrganizer.last_activity_at)}</b></div>
          </header>
          <div className="admin-organizer-kpis"><div><b>{selectedOrganizer.event_count}</b><span>Events</span></div><div><b>{selectedOrganizer.active_event_count}/{selectedOrganizer.event_limit}</b><span>Active</span></div><div><b>{selectedOrganizer.player_count}</b><span>Players</span></div><div><b>{selectedOrganizer.game_count}</b><span>Games</span></div></div>
          <div className="admin-organizer-details">
              <div className="admin-detail-grid">
                <div><span>Location</span><b>{[selectedOrganizer.city, selectedOrganizer.country].filter(Boolean).join(", ") || "Not provided"}</b></div>
                <div><span>Joined</span><b>{dateTime(selectedOrganizer.joined_at)}</b></div>
                <div><span>Last sign-in</span><b>{dateTime(selectedOrganizer.last_sign_in_at)}</b></div>
                <div><span>Event allowance</span><b>{selectedOrganizer.event_limit} total · +{selectedOrganizer.additional_active_events} approved</b></div>
                <div><span>Upcoming / completed events</span><b>{selectedOrganizer.upcoming_event_count} / {selectedOrganizer.completed_event_count}</b></div>
                <div><span>Completed games</span><b>{selectedOrganizer.completed_game_count}</b></div>
              </div>
              <h4>Recent events</h4>
              {!selectedOrganizer.recent_events?.length ? <p className="muted">No events created yet.</p> : <div className="admin-recent-events">{selectedOrganizer.recent_events.map((event) => <div key={event.id}><div><b>{event.name}</b><small>{formatDate(event.event_date)} · Updated {dateTime(event.updated_at)}</small></div><span className={`status-badge ${event.status}`}>{event.status}</span><span>{event.players} players</span><span>{event.games} games</span></div>)}</div>}
          </div>
        </article>}
      </div>}
    </section>
    <section className="profile-card admin-suggestions-card">
      <div className="section-title"><div><span className="eyebrow">Product feedback</span><h2>Suggestion backlog</h2></div><span className="admin-count">{suggestions.length} submissions</span></div>
      {!suggestions.length ? <div className="empty-state"><MessageSquarePlus size={36} /><h3>No suggestions yet</h3><p>Organizer submissions will appear here.</p></div> : <div className="admin-suggestion-list">{suggestions.map((item) => <article key={item.id}>
        <div className="admin-suggestion-main"><div><span className={`status-badge ${item.status}`}>{item.status}</span><span className="payment-provider-badge">{item.payment_provider === "later" ? "DONATE LATER" : (item.payment_provider || "paypal").toUpperCase()}</span></div><h3>{item.title}</h3><p>{item.details}</p><small>{item.category} · {new Date(item.created_at).toLocaleString()}</small><small>Organizer: {item.organizer_user_id}</small>{item.payment_provider === "paypal" && <small>Donation: ${Number(item.donation_amount_usd).toFixed(2)} USD</small>}{["gcash","maya"].includes(item.payment_provider) && <small>Donation: ₱{Number(item.donation_amount_php).toLocaleString()} PHP</small>}</div>
        <div className="admin-suggestion-actions">{item.payment_proof_path && <button className="button button-secondary" onClick={() => viewSuggestionProof(item.payment_proof_path)}>View proof</button>}<label>Status<select value={item.status} onChange={(event) => updateSuggestionStatus(item.id, event.target.value)}><option value="backlog">Backlog</option><option value="reviewing">Reviewing</option><option value="planned">Planned</option><option value="declined">Declined</option><option value="completed">Completed</option></select></label></div>
      </article>)}</div>}
    </section>
    <section className="profile-card">
      <div className="section-title"><div><span className="eyebrow">Upgrade requests</span><h2>Review queue</h2></div></div>
      {!requests.length ? <div className="empty-state"><CheckCircle2 size={36} /><h3>No requests yet</h3><p>Submitted donation proofs will appear here.</p></div> : <div className="admin-request-list">{requests.map((item) => <article key={item.id}>
        <div><span className={`status-badge ${item.status}`}>{item.status}</span><span className="payment-provider-badge">{(item.payment_provider || "paypal").toUpperCase()}</span><h3>+{item.requested_events} active events</h3><p>{item.payment_provider && item.payment_provider !== "paypal" ? `₱${Number(item.donation_amount_php).toLocaleString()} PHP` : `$${Number(item.donation_amount_usd).toFixed(2)} USD`} · {new Date(item.created_at).toLocaleString()}</p><small>Organizer: {item.organizer_user_id}</small>{(item.payment_reference || item.paypal_order_id) && <small>Payment reference: {item.payment_reference || item.paypal_order_id}</small>}</div>
        <div className="admin-request-actions">{item.proof_method === "upload" ? <button className="button button-secondary" onClick={() => viewProof(item.proof_path)}>View proof</button> : <a className="button button-secondary" href={`mailto:hello@paotechs.com?subject=PickleFlow proof ${item.payment_reference || item.paypal_order_id || item.id}`}>Check emailed proof</a>}{item.status === "pending" && <><button className="button button-primary" onClick={() => review(item, true)}>Approve</button><button className="button button-secondary" onClick={() => review(item, false)}>Decline</button></>}</div>
      </article>)}</div>}
    </section>
  </main>;
}

function PublicRegistration({ code, onHome }) {
  const [event, setEvent] = useState(null),
    [count, setCount] = useState(0),
    [form, setForm] = useState({ ...emptyPlayer, website: "" }),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .eq("event_code", code.toUpperCase())
      .eq("status", "open")
      .single()
      .then(async ({ data }) => {
        setEvent(data);
        if (data) {
          const result = await supabase.rpc("get_event_registration_count", {
            p_event_id: data.id,
          });
          setCount(result.data || 0);
        }
        setLoading(false);
      });
  }, [code]);
  const spots = useMemo(
    () =>
      event?.registration_limit
        ? Math.max(event.registration_limit - count, 0)
        : null,
    [event, count],
  );
  async function submit(e) {
    e.preventDefault();
    setMessage("");
    if (spots === 0)
      return setMessage("Registration is full. Please contact the organizer.");
    let { error } = await supabase.rpc("register_player", {
      p_event_id: event.id,
      p_full_name: form.full_name.trim(),
      p_email: form.email.trim() || null,
      p_phone: form.phone.trim() || null,
      p_skill_level: form.skill_level,
      p_client_id: registrationClientId(),
      p_website: form.website,
    });
    // Keeps registration available during the short deployment window before
    // the matching database migration is applied.
    if (error?.code === "PGRST202" || error?.code === "42883") {
      ({ error } = await supabase.from("player_registrations").insert({
        event_id: event.id,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        skill_level: form.skill_level,
      }));
    }
    if (error) setMessage(playerRegistrationError(error));
    else setSuccess(true);
  }
  if (loading)
    return (
      <main className="public-registration">
        <p>Loading event…</p>
      </main>
    );
  if (!event)
    return (
      <main className="public-registration">
        <section className="auth-card">
          <h2>Event unavailable</h2>
          <p className="muted">
            The event code is invalid, closed, or no longer accepting players.
          </p>
          <button className="button button-primary" onClick={onHome}>
            Go to PickleFlow
          </button>
        </section>
      </main>
    );
  return (
    <main className="public-registration">
      <section className="registration-hero">
        <span className="eyebrow">
          Player registration · {event.event_code}
        </span>
        <h1>{event.name}</h1>
        <p>{event.description || "Join this pickleball event."}</p>
        <div className="event-meta">
          <span>
            <CalendarDays size={17} />{" "}
            {new Date(`${event.event_date}T00:00:00`).toLocaleDateString()}{" "}
            {event.start_time ? `· ${event.start_time.slice(0, 5)}` : ""}
          </span>
          <span>
            <MapPin size={17} /> {event.venue}
            {event.city ? `, ${event.city}` : ""}
          </span>
          {event.organizer_contact_phone && (
            <a href={`tel:${event.organizer_contact_phone}`}>
              <Phone size={17} /> Organizer: {event.organizer_contact_phone}
            </a>
          )}
          <span>
            <Users size={17} />{" "}
            {spots === null
              ? "Open registration"
              : `${spots} spot${spots === 1 ? "" : "s"} remaining`}
          </span>
        </div>
        {event.location_lat && event.location_lng && (
          <div className="registration-location">
            <div className="registration-location-heading">
              <div><strong>Pinned event location</strong><span>Use the preview or open the pin for directions.</span></div>
              <a className="button button-secondary" href={`https://www.google.com/maps/search/?api=1&query=${event.location_lat},${event.location_lng}`} target="_blank" rel="noreferrer">
                <MapPin size={16} /> Open in Google Maps
              </a>
            </div>
            <iframe
              title="Pinned event location preview"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(event.location_lng) - 0.006}%2C${Number(event.location_lat) - 0.004}%2C${Number(event.location_lng) + 0.006}%2C${Number(event.location_lat) + 0.004}&layer=mapnik&marker=${event.location_lat}%2C${event.location_lng}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}
      </section>
      <section className="auth-card registration-card">
        {success ? (
          <div className="registration-success">
            <CheckCircle2 size={54} />
            <h2>You’re registered!</h2>
            <p>The organizer can now see your registration for {event.name}.</p>
          </div>
        ) : (
          <>
            <h2>Player information</h2>
            <p className="muted">You do not need a PickleFlow account.</p>
            <form onSubmit={submit}>
              <label className="registration-honeypot" aria-hidden="true">
                Website
                <input tabIndex="-1" autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              </label>
              <label>
                Full name
                <input
                  required
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                />
              </label>
              <div className="contact-hint">
                Email and phone are optional. Player names must be unique for
                this event.
              </div>
              <label>
                Email <span>(optional)</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>
              <label>
                Phone number <span>(optional)</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
              <label>
                Skill level
                <select
                  value={form.skill_level}
                  onChange={(e) =>
                    setForm({ ...form, skill_level: e.target.value })
                  }
                >
                  <option value="novice">Novice</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="competitive">Competitive</option>
                </select>
              </label>
              {message && <div className="form-message error">{message}</div>}
              <button className="button button-primary button-full">
                Register for this event
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(null),
    [showAuth, setShowAuth] = useState(false),
    [authMode, setAuthMode] = useState("signup"),
    [loading, setLoading] = useState(isSupabaseConfigured);
  const eventCode = new URLSearchParams(window.location.search).get("event");
  const scoringToken = new URLSearchParams(window.location.search).get("score");
  const displayToken = new URLSearchParams(window.location.search).get("display");
  const isDonationPage = window.location.pathname.replace(/\/+$/, "") === "/donate";
  const isSuggestionPage = window.location.pathname.replace(/\/+$/, "") === "/suggest";
  const isAdminPage = window.location.pathname.replace(/\/+$/, "") === "/admin";
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const publicPage = PUBLIC_PAGES[normalizedPath];
  const isPrivateView = Boolean(session || eventCode || scoringToken || displayToken || isAdminPage || isSuggestionPage);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) setShowAuth(false);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const origin = "https://pickleflow.paotechs.com";
    if (publicPage) {
      setDocumentMeta({
        title: publicPage.seoTitle || `${publicPage.title} | PickleFlow`,
        description: publicPage.description,
        canonical: `${origin}${normalizedPath}`,
      });
      return;
    }
    if (isDonationPage) {
      setDocumentMeta({
        title: "Support PickleFlow | Donate",
        description: "Help keep PickleFlow free for pickleball event organizers with an optional donation.",
        canonical: `${origin}/donate`,
      });
      return;
    }
    setDocumentMeta({
      title: isPrivateView ? "PickleFlow" : "PickleFlow | Free Pickleball Event & Open Play Management",
      description: "Free pickleball event and open play management for player registration, fair queues, court assignments, live scoring, and smart TV match boards.",
      canonical: `${origin}/`,
      noindex: isPrivateView,
    });
  }, [isDonationPage, isPrivateView, normalizedPath, publicPage]);
  if (scoringToken && supabase)
    return <CourtScoring token={scoringToken} />;
  if (displayToken && supabase)
    return <MatchBoard token={displayToken} />;
  if (isDonationPage)
    return (
      <div className="app">
        <Header />
        <DonationPage />
        <footer>PickleFlow · A PAOTECHS-powered community project</footer>
      </div>
    );
  if (isSuggestionPage)
    return (
      <div className="app">
        <Header session={session} onSignOut={() => supabase?.auth.signOut()} />
        <SuggestionPage session={session} onLogin={() => { setAuthMode("signin"); setShowAuth(true); }} />
        {showAuth && <AuthPanel initialMode={authMode} onClose={() => setShowAuth(false)} />}
        <footer>PickleFlow · A PAOTECHS-powered community project</footer>
      </div>
    );
  if (isAdminPage)
    return (
      <div className="app">
        <Header session={session} onSignOut={() => supabase?.auth.signOut()} />
        <PlatformAdminPage session={session} onLogin={() => { setAuthMode("signin"); setShowAuth(true); }} />
        {showAuth && <AuthPanel initialMode={authMode} onClose={() => setShowAuth(false)} />}
        <footer>PickleFlow · A PAOTECHS-powered community project</footer>
      </div>
    );
  if (publicPage)
    return (
      <div className="app">
        <Header session={session} onSignOut={() => supabase?.auth.signOut()} />
        <MarketingPage
          page={publicPage}
          onStart={() => {
            setAuthMode("signup");
            setShowAuth(true);
          }}
        />
        {showAuth && <AuthPanel initialMode={authMode} onClose={() => setShowAuth(false)} />}
        <footer>PickleFlow · A PAOTECHS-powered community project</footer>
      </div>
    );
  if (eventCode && supabase)
    return (
      <div className="app">
        <Header />
        <PublicRegistration
          code={eventCode}
          onHome={() => {
            window.location.href = "/";
          }}
        />
      </div>
    );
  return (
    <div className="app">
      {loading ? (
        <>
          <Header session={session} onSignOut={() => supabase.auth.signOut()} />
          <main className="dashboard">
            <p>Loading PickleFlow…</p>
          </main>
        </>
      ) : session ? (
        <Dashboard session={session} onSignOut={() => supabase.auth.signOut()} />
      ) : (
        <>
          <Header />
          <Landing
            onStart={() => {
              setAuthMode("signup");
              setShowAuth(true);
            }}
            onLogin={() => {
              setAuthMode("signin");
              setShowAuth(true);
            }}
          />
        </>
      )}
      {!session && showAuth && (
        <AuthPanel
          key={authMode}
          initialMode={authMode}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}

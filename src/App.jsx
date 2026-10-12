import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Heart,
  FileUp,
  LogOut,
  LocateFixed,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  MessageSquarePlus,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
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
  registration_limit: 32,
  organizer_contact_phone: "",
  location_lat: null,
  location_lng: null,
  status: "open",
};
const emptyPlayer = {
  full_name: "",
  email: "",
  phone: "",
  skill_level: "beginner",
};

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
    eyebrow: "From signup to final score",
    title: "How PickleFlow keeps game day moving",
    description: "See how organizers use PickleFlow to create an event, register players, run fair open play, score matches, and share live court updates.",
    intro: "PickleFlow connects every part of a pickleball event in one simple, mobile-friendly flow. Organizers stay in control while players, scorers, and spectators see exactly what they need.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow Game Day organizer screen",
    steps: [
      ["Create the event", "Set the schedule, venue, player limit, courts, game format, and points to win."],
      ["Share registration", "Send one registration link or QR code so players can join from any phone."],
      ["Check in players", "Confirm arrivals, add walk-ins, import a list, and place available players in the queue."],
      ["Run every court", "Automatically prepare the next matches, score from court-side phones, and handle substitutions."],
      ["Display live updates", "Show current scores, next matches, waiting players, and winners on a shared Match Board."],
    ],
  },
  "/pickleball-event-management": {
    eyebrow: "Pickleball event management",
    title: "One organized home for your pickleball event",
    description: "Free pickleball event management software for organizer registration, player lists, check-ins, court assignments, queues, and event reports.",
    intro: "Replace scattered spreadsheets, paper lists, and group-chat updates with an organizer workspace designed for community events and club game days.",
    image: "/product-previews/event-roster.svg",
    imageAlt: "PickleFlow event roster and player management screen",
    steps: [
      ["Simple player registration", "Share a link or QR code and collect player names, skill levels, and optional contact details."],
      ["Flexible roster tools", "Add walk-ins, import CSV lists, prevent duplicate names, substitute players, and export event details."],
      ["Mobile check-in", "See who has arrived and move players from check-in to the waiting queue with clear statuses."],
      ["Multiple courts", "Monitor active and next matches per court without losing sight of the full event."],
    ],
  },
  "/open-play-management": {
    eyebrow: "Fair, faster open play",
    title: "Manage pickleball open play without a paper queue",
    description: "Run fair pickleball open play rotations with player check-in, waiting queues, automatic match creation, substitutions, and per-court next matches.",
    intro: "PickleFlow helps clubs keep rotations transparent and courts active. Everyone can see whether a player is checked in, waiting, in a game, or out of the event.",
    image: "/product-previews/game-day.svg",
    imageAlt: "PickleFlow open play courts and player queue",
    steps: [
      ["Clear player statuses", "Track Check In, Join Queue, Waiting, In-Game, and Out without maintaining a separate list."],
      ["Automatic next matches", "When enabled, PickleFlow selects eligible waiting players and keeps the next match ready for each court."],
      ["Practical substitutions", "Replace a player when needed and prioritize the substituted player for the next immediate game."],
      ["Live shared queue", "Let the Match Board keep players informed while organizers manage from their phones."],
    ],
  },
  "/live-pickleball-scoring": {
    eyebrow: "Live pickleball scoring",
    title: "Score each court from a phone and update the Match Board live",
    description: "Mobile pickleball scoring with real-time smart TV Match Board updates, next matches, player queues, winner standings, and optional voice announcements.",
    intro: "Give an umpire or scorer secure access to one court. Score changes synchronize to the organizer and large-screen display, keeping the entire venue informed.",
    image: "/product-previews/match-board.svg",
    imageAlt: "PickleFlow live pickleball Match Board",
    steps: [
      ["Court-specific scorer links", "Share a QR code for a scorer to open the assigned court directly on a mobile device."],
      ["Real-time synchronization", "Scores update across connected organizer, scorer, and Match Board devices."],
      ["Confirmed completion", "When the winning score is reached, confirm the result before PickleFlow completes the game."],
      ["Venue-ready display", "Present courts, scores, upcoming matches, the queue, winners, and voice announcements on a smart TV."],
    ],
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
  return (
    <main className="seo-page">
      <section className="seo-hero">
        <div>
          <span className="eyebrow"><Sparkles size={15} /> {page.eyebrow}</span>
          <h1>{page.title}</h1>
          <p>{page.intro}</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={onStart}>Create your free event</button>
            <a className="button button-secondary" href="/how-it-works">See how it works</a>
          </div>
        </div>
        <img src={page.image} alt={page.imageAlt} />
      </section>
      <section className="seo-benefits">
        <span className="eyebrow">Made for real game days</span>
        <h2>Everything stays in one flow.</h2>
        <div>
          {page.steps.map(([title, copy], index) => (
            <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>
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

function Header({ session, onSignOut }) {
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
              <Sparkles size={15} /> Free for organizers
            </span>
            <h1>Run pickleball events without the spreadsheet shuffle.</h1>
            <p>
              Create events, share a player-registration link, and keep every
              signup organized in one place.
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
            <a href="/pickleball-event-management"><strong>Event management</strong><span>Registration, rosters, check-in, and reports.</span></a>
            <a href="/open-play-management"><strong>Open play management</strong><span>Fair queues, rotations, and automatic matches.</span></a>
            <a href="/live-pickleball-scoring"><strong>Live scoring & Match Board</strong><span>Score by phone and update the venue live.</span></a>
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
    const { error } = await supabase.from("active_event_upgrade_requests").insert({
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
    });
    setBusy(false);
    if (error) return setMessage(error.message);
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
    const { error } = await supabase.from("app_improvement_suggestions").insert({
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
    });
    setSubmitting(false);
    if (error) return setMessage(error.message);
    setForm({ category: "feature", title: "", details: "" });
    setMessage("Thank you—your suggestion has been submitted.");
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
          PickleFlow will permanently delete the event and its associated
          player and game data 72 hours after the event is completed.
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
      registration_limit: form.registration_limit
        ? Number(form.registration_limit)
        : null,
      organizer_contact_phone: form.organizer_contact_phone.trim(),
      location_lat: form.location_lat === null || form.location_lat === "" ? null : Number(form.location_lat),
      location_lng: form.location_lng === null || form.location_lng === "" ? null : Number(form.location_lng),
      status: form.status,
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
            Start time
            <input
              type="time"
              name="start_time"
              value={form.start_time}
              onChange={update}
            />
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

function EventList({ events, onSelect, onNew, allowance, onUpgrade }) {
  async function copyLink(code) {
    await navigator.clipboard.writeText(
      `${window.location.origin}/?event=${code}`,
    );
    alert("Registration link copied.");
  }
  return (
    <section className="events-section">
      <div className="active-event-meter">
        <div><span>Active events</span><strong>{allowance.active_count} of {allowance.event_limit}</strong><small>Open events dated today or later</small></div>
        <button className="button button-donate" onClick={onUpgrade}><Heart size={17} /> Add active events</button>
      </div>
      <div className="section-title">
        <div>
          <span className="eyebrow">Your events</span>
          <h2>Event registration</h2>
        </div>
        <button className="button button-primary" onClick={onNew}>
          <Plus size={17} /> Create event
        </button>
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
            <article className="event-card" key={item.id}>
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
    </section>
  );
}

function EventPlayers({ event, onBack, onEdit, onGameDay, onEventUpdated }) {
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
        <div className="title-actions">
          <button className="button button-primary" onClick={onGameDay}>
            Open game day
          </button>
          <button className="button button-secondary" onClick={onBack}>
            Back to events
          </button>
        </div>
      </div>
      <div className="event-detail-bar">
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
              : "Event, player, and game data are deleted 72 hours after event completion."}
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
      <div className="roster-toolbar">
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
        <button
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
        <label className="button button-secondary import-file-button">
          <FileUp size={16} /> Import CSV
          <input type="file" accept=".csv,text/csv" onChange={readImportFile} />
        </label>
      </div>
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

function Dashboard({ session }) {
  const dashboardStateKey = `pickleflow-dashboard-${session.user.id}`;
  const [profile, setProfile] = useState(emptyProfile),
    [events, setEvents] = useState([]),
    [view, setView] = useState("events"),
    [selectedEvent, setSelectedEvent] = useState(null),
    [termsAcceptedAt, setTermsAcceptedAt] = useState(null),
    [allowance, setAllowance] = useState({ active_count: 0, event_limit: 3, additional_events: 0 }),
    [isAdmin, setIsAdmin] = useState(false),
    [saved, setSaved] = useState(""),
    [loading, setLoading] = useState(true);
  async function loadEvents() {
    const [eventResult, allowanceResult] = await Promise.all([
      supabase.from("events").select("*").eq("organizer_user_id", session.user.id).order("event_date", { ascending: false }),
      supabase.rpc("active_event_allowance", { target_user_id: session.user.id }),
    ]);
    setEvents(eventResult.data || []);
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
      supabase.rpc("active_event_allowance", { target_user_id: session.user.id }),
      supabase.rpc("is_platform_admin"),
    ]).then(([profileResult, eventResult, allowanceResult, adminResult]) => {
      const loadedEvents = eventResult.data || [];
      if (profileResult.data)
        setProfile({ ...emptyProfile, ...profileResult.data });
      setEvents(loadedEvents);
      if (allowanceResult.data?.[0]) setAllowance(allowanceResult.data[0]);
      setIsAdmin(Boolean(adminResult.data));
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
  return (
    <main className="dashboard">
      <section className="welcome-card">
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
      </section>
      <nav className="dashboard-tabs">
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
      {view === "events" && (
        <EventList
          events={events}
          onSelect={(item) => {
            setSelectedEvent(item);
            setView("players");
          }}
          onNew={() => setView("terms")}
          allowance={allowance}
          onUpgrade={() => setView("upgrade")}
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
              src={`https://www.google.com/maps?q=${event.location_lat},${event.location_lng}&z=16&output=embed`}
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
        title: `${publicPage.title} | PickleFlow`,
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
      <Header session={session} onSignOut={() => supabase.auth.signOut()} />
      {loading ? (
        <main className="dashboard">
          <p>Loading PickleFlow…</p>
        </main>
      ) : session ? (
        <Dashboard session={session} />
      ) : (
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

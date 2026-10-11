import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Heart,
  ExternalLink,
  FileUp,
  LogOut,
  LocateFixed,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
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

const formatDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString();
const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

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
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="PickleFlow home">
        <img src="/brand/pickleflow-logo.png" alt="PickleFlow" />
      </a>
      {session && (
        <button className="button button-ghost" onClick={onSignOut}>
          <LogOut size={17} /> Sign out
        </button>
      )}
    </header>
  );
}

function Landing({ onStart, onLogin }) {
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
          <div
            className="court-card"
            aria-label="Pickleball court illustration"
          >
            <div className="court-net" />
            <div className="ball">●</div>
            <div className="court-copy">
              <strong>Organize. Play. Connect.</strong>
              <span>Built for clubs and community events.</span>
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
      image: "/donations/gcash-qr.jpeg",
      className: "wallet-gcash",
    },
    {
      id: "maya",
      name: "Maya",
      number: "0998 537 8242",
      copyValue: "09985378242",
      image: "/donations/maya-qr.jpeg",
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
          <p>Donate securely in your preferred currency through PayPal.</p>
          <a
            className="button payment-action paypal-action"
            href="https://paypal.me/GlennOcay"
            target="_blank"
            rel="noreferrer"
          >
            Open PayPal <ExternalLink size={17} />
          </a>
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
            <strong className="recipient-name">Glenn Ocay</strong>
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
          are handled directly by PayPal, GCash, or Maya. Before sending, please
          verify that the recipient is <strong>Glenn Ocay</strong>.
        </p>
      </section>
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
        <strong>15-day data retention</strong>
        <span>
          PickleFlow will permanently delete the event and its associated
          player-registration data 15 days after the event date.
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
          <strong>15-day data-retention policy</strong>.
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
        terms_version: "2026-10-04",
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

function EventList({ events, onSelect, onNew }) {
  async function copyLink(code) {
    await navigator.clipboard.writeText(
      `${window.location.origin}/?event=${code}`,
    );
    alert("Registration link copied.");
  }
  return (
    <section className="events-section">
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
    event.retention_extended_until || addDays(event.event_date, 15);
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
              : "Event and player data are deleted 15 days after the event."}
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
    [saved, setSaved] = useState(""),
    [loading, setLoading] = useState(true);
  async function loadEvents() {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("organizer_user_id", session.user.id)
      .order("event_date", { ascending: false });
    setEvents(data || []);
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
    ]).then(([profileResult, eventResult]) => {
      const loadedEvents = eventResult.data || [];
      if (profileResult.data)
        setProfile({ ...emptyProfile, ...profileResult.data });
      setEvents(loadedEvents);
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
      </nav>
      {view === "events" && (
        <EventList
          events={events}
          onSelect={(item) => {
            setSelectedEvent(item);
            setView("players");
          }}
          onNew={() => setView("terms")}
        />
      )}
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

function PublicRegistration({ code, onHome }) {
  const [event, setEvent] = useState(null),
    [count, setCount] = useState(0),
    [form, setForm] = useState(emptyPlayer),
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
    const { error } = await supabase.from("player_registrations").insert({
      ...form,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      event_id: event.id,
    });
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

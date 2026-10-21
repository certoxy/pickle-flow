import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const origin = "https://pickleflow.paotechs.com";
const pages = {
  "/how-it-works": {
    title: "How PickleFlow Works | Pickleball Event Workflow",
    description: "See how organizers use PickleFlow to create an event, register players, run fair open play, score matches, and share live court updates.",
    h1: "How PickleFlow Keeps Game Day Moving",
    intro: "PickleFlow connects registration, player check-in, court assignments, scoring, standings, and venue displays in one mobile-friendly organizer workflow.",
    sections: [["Create the event", "Set the schedule, venue, player limit, courts, game format, and points to win."], ["Run every court", "Prepare next matches, score from court-side phones, and keep the Match Board updated."]],
  },
  "/pickleball-event-management": {
    title: "Pickleball Event Management Software | PickleFlow",
    description: "Free pickleball event management software for player lists, check-ins, court assignments, queues, and event reports.",
    h1: "One Organized Home for Your Pickleball Event",
    intro: "Replace scattered spreadsheets, paper lists, and group-chat updates with an organizer workspace designed for community events and club game days.",
    sections: [["Player registration and check-in", "Share a registration link or QR code, add walk-ins, import player lists, and track clear Game Day statuses."], ["Multiple courts", "Monitor active and upcoming matches without losing sight of the full event."]],
  },
  "/open-play-management": {
    title: "Pickleball Open Play Organizer & Scoring App | PickleFlow",
    description: "Organize pickleball open play with fair player rotation, court assignments, live scoring, standings, and offline support.",
    h1: "Pickleball Open Play Management Made Simple",
    intro: "Pickleball open play management software helps organizers coordinate player registration, check-ins, court assignments, partner rotations, scoring, and event standings.",
    sections: [
      ["What Is Pickleball Open Play Management Software?", "It coordinates who is ready, who is on court, which match is next, and how completed games affect standings."],
      ["How Fair Player Rotation Works", "PickleFlow prioritizes waiting players with fewer completed games and reduces repeated teammate pairings when alternative combinations are available."],
      ["Managing Multiple Courts and Player Queues", "A match can be paired before a court is free and remain court-pending until an available court can accept it."],
      ["How Offline Scoring and Recovery Work", "After an event is loaded in the same browser, selected player, queue, match, and scoring actions continue locally during a temporary interruption."],
      ["Understanding Standings and Overall Champions", "Completed games feed games played, wins, winning percentage, accumulated score, points allowed, and point differential."],
    ],
  },
  "/fair-player-rotation": {
    title: "Fair Pickleball Player Rotation for Open Play | PickleFlow",
    description: "Learn how PickleFlow prioritizes fewer games played and reduces repeated doubles partnerships during pickleball open play.",
    h1: "How PickleFlow Rotates Players and Partners Fairly",
    intro: "PickleFlow considers completed game counts first, preserves queue order as a tie-breaker, and arranges selected players to reduce repeated partnerships.",
    sections: [["Prioritize fewer games played", "Waiting players with fewer completed games are considered first."], ["Reduce repeated partnerships", "The three possible doubles arrangements are compared and the lowest partnership repetition count is preferred."], ["Limits", "Attendance changes, court availability, substitutions, and event duration can affect final game totals."]],
  },
  "/offline-scoring": {
    title: "Offline Pickleball Scoring & Game Day Operations | PickleFlow",
    description: "See which PickleFlow scoring, player, queue, and match actions continue during a temporary internet interruption.",
    h1: "Pickleball Scoring and Game Day Operations Without Internet",
    intro: "PickleFlow saves supported Game Day changes locally in a browser that loaded the event online and synchronizes them after reconnection.",
    sections: [["What works temporarily offline", "Add and check in players, update queue status, create and assign matches, record scores, and complete games in the organizer browser."], ["Previously loaded browser required", "A new device or cleared browser cannot retrieve the event for the first time without a connection."], ["Current limits", "Local browser storage must remain available, and fully offline synchronization between independent devices is not guaranteed."]],
  },
  "/court-management": {
    title: "Pickleball Court & Queue Management | PickleFlow",
    description: "Manage multiple pickleball courts, waiting players, court-pending matches, mobile scoring links, and live venue updates.",
    h1: "Manage Pickleball Courts, Queues, and Upcoming Matches",
    intro: "PickleFlow gives the organizer one view of court availability, active matches, the waiting queue, and the next paired match.",
    sections: [["Court-pending matches", "Prepare the next pairing while courts are occupied and assign it when a court becomes available."], ["Mobile scoring", "Share a court-specific scoring link or QR code and synchronize scores to the organizer and Match Board when online."], ["Large-screen Match Board", "Show active scores, serving side, waiting players, upcoming matches, recent results, and standings."]],
  },
  "/player-standings": {
    title: "Open Play Standings & Champion Methodology | PickleFlow",
    description: "Understand PickleFlow player standings, winning percentage, accumulated score, eligibility, and Overall Champion tie-breakers.",
    h1: "Pickleball Open Play Standings and Overall Champion",
    intro: "PickleFlow derives standings from completed games and displays the ranking inputs so organizers and players can understand the results.",
    sections: [["Statistics from completed games", "Games played, wins, losses, winning percentage, accumulated score, points allowed, and point differential are calculated."], ["Champion eligibility", "Eligible players completed at least one fewer game than the event maximum, with a minimum of one game."], ["Tie-breakers", "Winning percentage, wins, point differential, accumulated score, then fewest points allowed. Exact ties produce co-champions."]],
  },
  "/live-pickleball-scoring": {
    title: "Live Mobile Pickleball Scoring & Match Board | PickleFlow",
    description: "Mobile pickleball scoring with real-time Match Board updates, serving indicators, queues, and standings.",
    h1: "Score Each Court from a Phone and Update the Match Board Live",
    intro: "Give a scorer access to one court and keep the organizer and venue display updated online.",
    sections: [["Court-specific access", "Share a scorer link or QR code for the assigned court."], ["Serving controls", "Display the serving team and first or second service."], ["Confirmed completion", "Confirm the result after the winning score is reached before completing the game."]],
  },
  "/faq": {
    title: "PickleFlow FAQ | Open Play, Offline Scoring & Courts",
    description: "Answers about PickleFlow registration, fair player rotation, offline Game Day, court scoring, standings, and data retention.",
    h1: "PickleFlow Frequently Asked Questions",
    intro: "Current answers for pickleball organizers as of October 21, 2026.",
    sections: [["Is PickleFlow free?", "Organizer registration and the current core event workflow are free. Donations are optional and active-event limits apply."], ["Can PickleFlow work without internet?", "Selected organizer operations continue for a previously loaded event in the same browser."], ["Does PickleFlow guarantee perfect fairness?", "No. It prioritizes fewer games and minimizes repeated partnerships where possible, but real event conditions affect outcomes."], ["How long is detailed event data retained?", "Detailed event data is scheduled for deletion 72 hours after event completion, while a limited event summary may be retained."]],
  },
};

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const template = await readFile("dist/index.html", "utf8");

for (const [route, page] of Object.entries(pages)) {
  const canonical = origin + route;
  const content = `<main class="seo-page" data-prerendered="true">
    <section class="seo-hero"><div><p class="eyebrow">PickleFlow organizer guide</p><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.intro)}</p><p><a href="/">Open PickleFlow</a></p><small>Published by PAOTECHS · Last updated October 21, 2026</small></div></section>
    <section class="seo-content">${page.sections.map(([heading, copy]) => `<article><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(copy)}</p></article>`).join("")}</section>
    <nav class="seo-related" aria-label="PickleFlow guides"><a href="/open-play-management">Open Play management</a> <a href="/fair-player-rotation">Fair rotation</a> <a href="/offline-scoring">Offline scoring</a> <a href="/court-management">Court management</a> <a href="/player-standings">Standings</a> <a href="/faq">FAQ</a></nav>
  </main>`;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": "https://paotechs.com/#organization", name: "PAOTECHS", url: "https://paotechs.com/" },
      { "@type": "SoftwareApplication", "@id": origin + "/#software", name: "PickleFlow", url: origin + "/", applicationCategory: "SportsApplication", operatingSystem: "Web", publisher: { "@id": "https://paotechs.com/#organization" } },
      { "@type": "WebPage", "@id": canonical + "#webpage", url: canonical, name: page.title, description: page.description, dateModified: "2026-10-21", about: { "@id": origin + "/#software" }, publisher: { "@id": "https://paotechs.com/#organization" } },
    ],
  });
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div><script id="pickleflow-prerender-schema" type="application/ld+json">${schema.replace(/</g, "\\u003c")}</script>`);
  const output = join("dist", route.slice(1), "index.html");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
}

console.log(`Prerendered ${Object.keys(pages).length} public PickleFlow guides.`);

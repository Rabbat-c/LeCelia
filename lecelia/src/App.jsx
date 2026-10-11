import React, { useState, useEffect, useRef } from "react";
import {
  Icon,
  Compass, CalendarDays, User, MessageCircle, Plus, MapPin, Clock,
  Users, ArrowLeft, Send, Flame, Award, ChevronRight, X, Check, SlidersHorizontal,
  ShieldCheck, Hourglass, Ban, Bell, Mail, Phone, LogOut, Lock, Camera, HelpCircle,
} from "./lib/icons.jsx";
import { LangContext, useLang, STRINGS, makeT, makeTn } from "./lib/i18n.jsx";
import {
  ink, inkMuted, paper, highlighter, coral, forest, lineColor, displayFont, bodyFont, mapBg,
} from "./lib/theme.js";

// ---------- Design tokens ----------

// ---------- Sample / config data ----------
const INTERESTS = [
  "Running", "Hiking", "Book Club", "Pickleball", "Photography",
  "Live Music", "Volunteering", "Coffee Meetups", "Art & Craft", "Yoga",
  "Board Games", "Cooking", "Cycling", "Poker",
];

const AGE_BRACKETS = [
  { key: "18-25", min: 18, max: 25 },
  { key: "26-35", min: 26, max: 35 },
  { key: "36-50", min: 36, max: 50 },
  { key: "51+", min: 51, max: 120 },
];

const DISTANCES = [5, 10, 25, 50];
const GROUP_TYPES = ["Anyone", "Women", "Men", "Other"];
const AUDIENCE_OPTIONS = ["Mixed", "Women", "Men", "Other"];
const DEFAULT_CATEGORIES = ["Running", "Hiking", "Sports", "Cooking", "Games", "Art & Craft"];

// ---------- Billing (mock — swap for native IAP later) ----------
// Product IDs follow store conventions (reverse-DNS) so this table can be
// carried over as-is into App Store Connect / Google Play Console product
// configuration when this prototype becomes a native app.
const PAYMENT_PLANS = [
  { key: "day", productId: "com.lecelia.access.1day", label: "1 Day Access", price: "$1", days: 1, blurb: "Unlimited event selection for one calendar day of your choice." },
  { key: "week", productId: "com.lecelia.access.7day", label: "7 Day Access", price: "$5", days: 7, blurb: "Unlimited event selection for 7 consecutive calendar days." },
  { key: "month", productId: "com.lecelia.access.30day", label: "30 Day Access", price: "$15", days: 30, blurb: "Unlimited event selection for 30 consecutive calendar days." },
];

// Mock billing provider. On iOS this seam would call StoreKit (e.g. via
// react-native-iap) to purchase `productId`; on Android, Google Play
// Billing. Both real providers resolve with a receipt/purchase token that
// a backend verifies before granting entitlement server-side. Everything
// downstream (accessPass state, expiry checks, gating on passStatus) only
// depends on this Promise shape — swapping MockBillingProvider for a
// native provider with the same purchase(productId) signature is the only
// change needed at conversion time.
const MockBillingProvider = {
  async purchase(productId) {
    await new Promise((resolve) => setTimeout(resolve, 700)); // simulate purchase sheet + network round trip
    return { success: true, productId, transactionId: `mock_${Date.now()}`, purchasedAt: Date.now() };
  },
};

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CATEGORY_COLORS = {
  Running: coral,
  Hiking: forest,
  Photography: "#7A4FB5",
  Sports: "#2E6FB5",
  "Book Club": "#B5822E",
  Games: "#3A3A3A",
};
const FALLBACK_CATEGORY_COLORS = ["#2E6FB5", "#B5822E", "#7A4FB5", "#C1568A", "#3A6EA5"];
function colorForCategory(category) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_CATEGORY_COLORS[Math.abs(hash) % FALLBACK_CATEGORY_COLORS.length];
}

function ageLabel(ageRange) {
  if (ageRange[0] <= 0 && ageRange[1] >= 99) return "Any age";
  return `Ages ${ageRange[0]}–${ageRange[1] >= 99 ? "any" : ageRange[1]}`;
}

function genderLabel(meetup, t) {
  if (meetup.groupType === "Mixed") return t("gender_open_everyone");
  if (meetup.groupType === "Other") return meetup.audienceOther ? t("other_format", { text: meetup.audienceOther }) : meetup.groupType;
  return meetup.groupType;
}

const COUNTRIES = {
  "Portugal": {
    "Lisbon": ["Baixa", "Alfama", "Belém", "Parque das Nações"],
    "Porto": ["Ribeira", "Foz do Douro", "Cedofeita"],
  },
  "Kenya": {
    "Nairobi": ["Westlands", "Karen", "CBD", "Kilimani"],
    "Mombasa": ["Nyali", "Old Town"],
  },
  "Japan": {
    "Tokyo": ["Shibuya", "Shinjuku", "Asakusa", "Ikebukuro"],
    "Osaka": ["Namba", "Umeda", "Tennoji"],
  },
  "Canada": {
    "Toronto": ["Downtown", "The Annex", "Scarborough", "Leslieville"],
    "Vancouver": ["Kitsilano", "Downtown", "Mount Pleasant"],
  },
  "Australia": {
    "Melbourne": ["CBD", "Fitzroy", "St Kilda", "Brunswick"],
    "Sydney": ["CBD", "Bondi", "Newtown", "Surry Hills"],
  },
  "United States": {
    "Austin": ["Downtown", "South Congress", "East Austin", "Zilker"],
    "New York": ["Manhattan", "Brooklyn", "Queens", "The Bronx"],
    "San Francisco": ["Mission", "SoMa", "Marina", "Castro"],
  },
  "United Kingdom": {
    "London": ["Shoreditch", "Camden", "Brixton", "Notting Hill"],
    "Manchester": ["Northern Quarter", "Ancoats", "Chorlton"],
  },
  "Brazil": {
    "São Paulo": ["Vila Madalena", "Pinheiros", "Itaim Bibi"],
    "Rio de Janeiro": ["Copacabana", "Ipanema", "Santa Teresa"],
  },
  "India": {
    "Mumbai": ["Bandra", "Andheri", "Colaba"],
    "Bengaluru": ["Indiranagar", "Koramangala", "Whitefield"],
  },
  "Germany": {
    "Berlin": ["Kreuzberg", "Mitte", "Neukölln", "Prenzlauer Berg"],
    "Munich": ["Schwabing", "Altstadt", "Glockenbach"],
  },
};

// Approximate city-center coordinates for every city in COUNTRIES, used to
// give newly-created events real coordinates and to compute a live
// "distance from me" for the person browsing, instead of a fixed number.
const CITY_COORDS = {
  "Lisbon": { lat: 38.7223, lng: -9.1393 },
  "Porto": { lat: 41.1579, lng: -8.6291 },
  "Nairobi": { lat: -1.2921, lng: 36.8219 },
  "Mombasa": { lat: -4.0435, lng: 39.6682 },
  "Tokyo": { lat: 35.6762, lng: 139.6503 },
  "Osaka": { lat: 34.6937, lng: 135.5023 },
  "Toronto": { lat: 43.6511, lng: -79.3470 },
  "Vancouver": { lat: 49.2827, lng: -123.1207 },
  "Melbourne": { lat: -37.8136, lng: 144.9631 },
  "Sydney": { lat: -33.8688, lng: 151.2093 },
  "Austin": { lat: 30.2672, lng: -97.7431 },
  "New York": { lat: 40.7128, lng: -74.0060 },
  "San Francisco": { lat: 37.7749, lng: -122.4194 },
  "London": { lat: 51.5072, lng: -0.1276 },
  "Manchester": { lat: 53.4808, lng: -2.2426 },
  "São Paulo": { lat: -23.5505, lng: -46.6333 },
  "Rio de Janeiro": { lat: -22.9068, lng: -43.1729 },
  "Mumbai": { lat: 19.0760, lng: 72.8777 },
  "Bengaluru": { lat: 12.9716, lng: 77.5946 },
  "Berlin": { lat: 52.5200, lng: 13.4050 },
  "Munich": { lat: 48.1351, lng: 11.5820 },
};

// Great-circle distance in km between two lat/lng points.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Demo-only "existing account" a Login resolves to, since this prototype has no real backend.
const DEMO_ACCOUNT = { name: "Alex Rivera", country: "Portugal", city: "Lisbon", area: "Baixa" };

// Demo-only admin email. In a real build this lives server-side, never in client code.
const ADMIN_EMAIL = "admin@lecelia-app.com";

const SUPPORT_EMAIL = "support@lecelia-app.com";

const HELP_QA = {
  attendee: [
    { q: "How do I join a meetup?", a: "Open a meetup from Discover and tap \"I'm in.\" If it falls outside any access pass you already have, you'll be asked to pick one first." },
    { q: "What does an access pass unlock?", a: "A pass unlocks unlimited joins for the calendar days it covers. It doesn't cover events outside that date range — you'll be prompted to pick a pass that does." },
    { q: "Can I leave a meetup after joining?", a: "Yes. Open the meetup from My Meetups or Discover and choose \"Not going.\" Hosts can't remove themselves from their own event." },
    { q: "How do I message the group?", a: "Once you've joined a meetup, a group chat unlocks for it under the Chat tab." },
  ],
  host: [
    { q: "How do I host an event?", a: "Tap the + button and fill in the details. Every new event is reviewed by an admin before it goes live on Discover." },
    { q: "How long does approval take?", a: "This varies, but you'll get a notification as soon as your event is approved or if it needs changes." },
    { q: "Can I add a photo to my event?", a: "Yes — the event form has an optional photo field that shows on your event's card and detail page once approved." },
    { q: "What if my event gets declined?", a: "You'll receive a notification with the admin's reason so you can fix it and resubmit." },
  ],
};

function HelpQAItem({ q, a, isOpen, onToggle }) {
  return (
    <button onClick={onToggle} className="w-full text-left rounded-xl border-2 p-3.5" style={{ borderColor: ink }}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{q}</p>
        <ChevronRight size={16} color={inkMuted} className="shrink-0 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
      </div>
      {isOpen && <p className="text-sm leading-snug mt-2" style={{ color: inkMuted, fontFamily: bodyFont }}>{a}</p>}
    </button>
  );
}

function HelpScreen({ onBack }) {
  const { t } = useLang();
  const [openKey, setOpenKey] = useState(null);
  const toggle = (key) => setOpenKey((k) => (k === key ? null : key));

  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("help_back")}</span>
      </div>
      <TopHeader title={t("help_title")} subtitle={t("help_subtitle")} />
      <div className="px-5 pb-8">
        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("help_for_attendees")}</p>
        <div className="flex flex-col gap-2.5 mb-6">
          {HELP_QA.attendee.map((item, i) => {
            const key = `attendee-${i}`;
            return <HelpQAItem key={key} q={item.q} a={item.a} isOpen={openKey === key} onToggle={() => toggle(key)} />;
          })}
        </div>

        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("help_for_hosts")}</p>
        <div className="flex flex-col gap-2.5 mb-6">
          {HELP_QA.host.map((item, i) => {
            const key = `host-${i}`;
            return <HelpQAItem key={key} q={item.q} a={item.a} isOpen={openKey === key} onToggle={() => toggle(key)} />;
          })}
        </div>

        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("help_contact_us")}</p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2.5 rounded-xl border-2 p-3.5" style={{ borderColor: ink }}>
          <Mail size={16} color={ink} />
          <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{SUPPORT_EMAIL}</p>
        </a>
      </div>
    </div>
  );
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Rough "starts at" timestamp used only to tell upcoming events from past ones in this prototype.
function daysFromNow(days, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function formatDateShort(ts) {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function dateStrFromTimestamp(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Always shows the actual date (not just a relative day name) so a user can
// check an event against the days their access pass covers, e.g. "Wed 30/09/26".
function formatEventWhenFromTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const dayLabel = d.toLocaleDateString(undefined, { weekday: "short" });
  const timeLabel = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel} ${formatDateShort(ts)} · ${timeLabel}`;
}

function formatEventWhen(dateStr, timeStr) {
  if (!dateStr || !timeStr) return "";
  const dt = new Date(`${dateStr}T${timeStr}`);
  if (isNaN(dt.getTime())) return "";
  return formatEventWhenFromTimestamp(dt.getTime());
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Builds the calendar-day window an access pass covers: `plan.days`
// consecutive calendar days starting on the day the user chose.
function buildPassWindow(plan, chosenDateStr) {
  const base = chosenDateStr ? new Date(`${chosenDateStr}T00:00:00`) : new Date();
  const start = startOfDay(base);
  const end = endOfDay(new Date(start));
  end.setDate(end.getDate() + (plan.days - 1));
  return { start: start.getTime(), end: end.getTime() };
}

function formatDateRange(startMs, endMs) {
  const opts = { month: "short", day: "numeric" };
  const start = new Date(startMs).toLocaleDateString(undefined, opts);
  const end = new Date(endMs).toLocaleDateString(undefined, opts);
  return start === end ? start : `${start} – ${end}`;
}

// An access pass only unlocks events that fall on one of the calendar days
// it covers — not "any event, as long as you join while the pass is live".
function isEventCoveredByPass(meetup, accessPass) {
  if (!accessPass || !meetup?.startsAt) return false;
  return meetup.startsAt >= accessPass.windowStart && meetup.startsAt <= accessPass.windowEnd;
}

// Derives the displayed "when" label from startsAt so it always includes
// the actual date (see formatEventWhenFromTimestamp) and can't drift out
// of sync with the timestamp used for access-pass coverage checks.
function withWhen(meetup) {
  return { ...meetup, when: formatEventWhenFromTimestamp(meetup.startsAt) };
}

const INITIAL_MEETUPS = [
  withWhen({
    id: 1, title: "Sunrise Run Club", category: "Running", color: coral,
    where: "Riverside Park, East Gate", distance: 2.1, lat: 38.7412, lng: -9.1393, city: "Lisbon",
    ageRange: [20, 45], groupType: "Mixed", spotsTotal: 15,
    host: "Marcus Lee", hostInitial: "M",
    description: "Easy 5K pace along the river, done before work starts. All paces welcome, we regroup every mile. Coffee after for anyone who wants to stick around.",
    attendees: [
      { name: "Marcus Lee", contact: "marcus@lecelia-app.com" },
      { name: "Jenna Cole" },
      { name: "Theo Martins" },
      { name: "Rosa Diaz" },
    ],
    free: true, startsAt: daysFromNow(1, 6, 30),
    creatorName: "Marcus Lee", creatorContact: "marcus@lecelia-app.com",
  }),
  withWhen({
    id: 2, title: "Women's Hiking Circle", category: "Hiking", color: forest,
    where: "Overlook Trailhead", distance: 4.5, lat: 38.6819, lng: -9.1393, city: "Lisbon",
    ageRange: [25, 60], groupType: "Women", spotsTotal: 12,
    host: "Priya Nair", hostInitial: "P",
    description: "A women-only group for anyone who's felt hesitant hiking alone. Moderate 4-mile loop, we go at the pace of the slowest hiker. New faces always welcome.",
    attendees: [
      { name: "Priya Nair", contact: "priya@lecelia-app.com" },
      { name: "Lucia Fernandes" },
      { name: "Kira Owens" },
      { name: "Sara Bianchi" },
    ],
    free: true, startsAt: daysFromNow(3, 8, 0),
    creatorName: "Priya Nair", creatorContact: "priya@lecelia-app.com",
  }),
  withWhen({
    id: 3, title: "Photography Walk: Downtown", category: "Photography", color: "#7A4FB5",
    where: "Old Town Square", distance: 1.3, lat: 38.7223, lng: -9.1243, city: "Lisbon",
    ageRange: [18, 99], groupType: "Mixed", spotsTotal: 10,
    host: "Deion Walker", hostInitial: "D",
    description: "Golden hour walk through downtown's best corners. Bring any camera, phone included. We'll share shots in the group chat after.",
    attendees: [
      { name: "Deion Walker", contact: "deion@lecelia-app.com" },
      { name: "Ana Souza" },
      { name: "Sam Cole" },
    ],
    free: true, startsAt: daysFromNow(2, 17, 0),
    creatorName: "Deion Walker", creatorContact: "deion@lecelia-app.com",
  }),
  withWhen({
    id: 4, title: "Pickleball Drop-In", category: "Sports", color: "#2E6FB5",
    where: "Community Rec Courts", distance: 6.8, lat: 38.7223, lng: -9.2176, city: "Lisbon",
    ageRange: [30, 65], groupType: "Mixed", spotsTotal: 16,
    host: "Jordan Blake", hostInitial: "J",
    description: "Casual rotating doubles, all levels. We bring extra paddles for beginners. Usually wraps up by noon.",
    attendees: [
      { name: "Jordan Blake", contact: "jordan@lecelia-app.com" },
      { name: "Ben Ortiz" },
      { name: "Chloe Kim" },
      { name: "Hana Suzuki" },
    ],
    free: true, startsAt: daysFromNow(4, 10, 0),
    creatorName: "Jordan Blake", creatorContact: "jordan@lecelia-app.com",
  }),
  withWhen({
    id: 5, title: "Fiction Lovers Book Club", category: "Book Club", color: "#B5822E",
    where: "Corner Cafe, Back Room", distance: 3.0, lat: 38.7493, lng: -9.1393, city: "Lisbon",
    ageRange: [25, 50], groupType: "Mixed", spotsTotal: 10,
    host: "Sam Ortiz", hostInitial: "S",
    description: "This month we're discussing a contemporary novel — link in the group chat if you want to read along. New members always get a warm welcome.",
    attendees: [
      { name: "Sam Ortiz", contact: "sam@lecelia-app.com" },
      { name: "Omar Farouk" },
      { name: "Ines Costa" },
      { name: "Uma Patel" },
    ],
    free: true, startsAt: daysFromNow(5, 19, 0),
    creatorName: "Sam Ortiz", creatorContact: "sam@lecelia-app.com",
  }),
  withWhen({
    id: 6, title: "Men's Poker Night", category: "Games", color: "#3A3A3A",
    where: "Private residence, Maple St.", distance: 5.5, lat: 38.6729, lng: -9.1393, city: "Lisbon",
    ageRange: [21, 60], groupType: "Men", spotsTotal: 8,
    host: "Tom Reyes", hostInitial: "T",
    description: "Low-stakes home game, beginners welcome. We keep buy-ins small — this is about the company more than the cards.",
    attendees: [
      { name: "Tom Reyes", contact: "tom@lecelia-app.com" },
      { name: "Rick Nguyen" },
      { name: "Nadia Torres" },
      { name: "Felix Grant" },
    ],
    free: false, startsAt: daysFromNow(6, 20, 0),
    creatorName: "Tom Reyes", creatorContact: "tom@lecelia-app.com",
  }),
];

// Seed one pending submission from someone else, so the admin panel isn't empty on first look.
const INITIAL_PENDING = [
  withWhen({
    id: 9001, title: "Sunset Yoga Session", category: "Yoga", color: colorForCategory("Yoga"),
    where: "Belém, Riverside Lawn", distance: 3.4, lat: 38.7223, lng: -9.1002, city: "Lisbon",
    ageRange: [18, 99], groupType: "Mixed", spotsTotal: 12,
    host: "Priya Nair", hostInitial: "P",
    description: "Gentle flow facing the river as the sun goes down. Bring your own mat — a few spares if you forget.",
    attendees: [{ name: "Priya Nair", contact: "priya@lecelia-app.com" }],
    free: true, startsAt: daysFromNow(7, 18, 30),
    creatorName: "Priya Nair", creatorContact: "priya@lecelia-app.com",
  }),
];

const CHAT_MESSAGES = {
  1: [
    { from: "Marcus Lee", me: false, text: "Meeting at the east gate, not the main entrance — easier parking there." },
    { from: "Jenna", me: false, text: "Bringing an extra water bottle if anyone forgets one" },
    { from: "You", me: true, text: "See everyone at 6:30" },
  ],
};

// ---------- Small building blocks ----------
function StatusBar({ showLangToggle = true }) {
  if (!showLangToggle) {
    return (
      <div className="flex items-center justify-end px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: ink, fontFamily: bodyFont }}>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2.5 rounded-sm" style={{ background: ink }} />
          <div className="w-4 h-2.5 rounded-sm" style={{ background: ink }} />
          <div className="w-5 h-2.5 rounded-sm border-2" style={{ borderColor: ink }} />
        </div>
      </div>
    );
  }
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center justify-end px-6 pt-3 pb-1 text-xs font-semibold" style={{ color: ink, fontFamily: bodyFont }}>
      <div className="flex items-center rounded-full border-2 overflow-hidden" style={{ borderColor: ink }}>
        <button onClick={() => setLang("en")} className="px-2 py-0.5 text-[10px] font-bold" style={{ background: lang === "en" ? ink : "transparent", color: lang === "en" ? paper : ink, fontFamily: bodyFont }}>EN</button>
        <button onClick={() => setLang("es")} className="px-2 py-0.5 text-[10px] font-bold" style={{ background: lang === "es" ? ink : "transparent", color: lang === "es" ? paper : ink, fontFamily: bodyFont }}>ES</button>
      </div>
    </div>
  );
}

function HomeIndicator() {
  return <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1.5 rounded-full" style={{ background: ink, opacity: 0.85 }} />;
}

function Chip({ label, selected, onClick, small }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full font-medium border-2 transition-colors whitespace-nowrap ${small ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm"}`}
      style={{ fontFamily: bodyFont, borderColor: ink, background: selected ? highlighter : "transparent", color: ink }}
    >
      {label}
    </button>
  );
}

function Avatar({ letter, size = 28, bg = ink, fg = paper }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: bg, color: fg, fontFamily: displayFont, fontSize: size * 0.42 }}>
      {letter}
    </div>
  );
}

function GroupTag({ groupType, otherText }) {
  const { t } = useLang();
  if (groupType === "Mixed") return null;
  const colors = { "Women": "#C1568A", "Men": "#3A6EA5", "Other": "#7A4FB5" };
  const label = groupType === "Other" && otherText ? t("other_format", { text: otherText }) : groupType;
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: colors[groupType] || inkMuted, color: paper, fontFamily: bodyFont }}>
      {label}
    </span>
  );
}

function FreeTag() {
  const { t } = useLang();
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border-2" style={{ borderColor: forest, color: forest, fontFamily: bodyFont }}>
      {t("tag_free")}
    </span>
  );
}

function KidsTag() {
  const { t } = useLang();
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border-2" style={{ borderColor: "#2E6FB5", color: "#2E6FB5", fontFamily: bodyFont }}>
      {t("tag_kid_friendly")}
    </span>
  );
}

// An event with no minimum set is always considered confirmed; one with a
// minimum only counts as confirmed once enough people have joined.
function isEventConfirmed(meetup) {
  return meetup.minParticipants == null || meetup.attendees.length >= meetup.minParticipants;
}

function MinNeededTag({ needed }) {
  const { t } = useLang();
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border-2" style={{ borderColor: coral, color: coral, fontFamily: bodyFont }}>
      {t("tag_needs_more", { n: needed })}
    </span>
  );
}

function ConfirmedTag() {
  const { t } = useLang();
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: forest, color: paper, fontFamily: bodyFont }}>
      {t("tag_confirmed")}
    </span>
  );
}

function MeetupCard({ meetup, onOpen }) {
  const { t } = useLang();
  return (
    <button onClick={() => onOpen(meetup)} className="w-full text-left rounded-2xl border-2 p-4 mb-3 relative overflow-hidden" style={{ borderColor: ink, background: paper }}>
      <div className="absolute top-0 right-0 w-7 h-7" style={{ background: meetup.color, clipPath: "polygon(100% 0, 0 0, 100% 100%)" }} />
      {meetup.photoUrl && (
        <img src={meetup.photoUrl} alt="" className="w-full h-32 object-cover rounded-xl mb-3" />
      )}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: meetup.color, color: paper, fontFamily: bodyFont }}>{meetup.category}</span>
        <GroupTag groupType={meetup.groupType} otherText={meetup.audienceOther} />
        {meetup.free && <FreeTag />}
        {meetup.suitableForChildren && <KidsTag />}
        {meetup.minParticipants != null && (
          isEventConfirmed(meetup) ? <ConfirmedTag /> : <MinNeededTag needed={meetup.minParticipants - meetup.attendees.length} />
        )}
      </div>
      <h3 className="text-lg font-bold leading-snug mb-1.5" style={{ color: ink, fontFamily: displayFont }}>{meetup.title}</h3>
      <div className="flex flex-col gap-1 mb-2.5" style={{ color: inkMuted, fontFamily: bodyFont }}>
        <div className="flex items-center gap-1.5 text-sm"><Clock size={14} /> {meetup.when}</div>
        <div className="flex items-center gap-1.5 text-sm"><MapPin size={14} /> {meetup.where} · {meetup.distance} {t("km_away")}</div>
        <div className="flex items-center gap-1.5 text-sm"><Users size={14} /> {ageLabel(meetup.ageRange)}</div>
        <div className="flex items-center gap-1.5 text-sm"><User size={14} /> {genderLabel(meetup, t)}</div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          {meetup.attendees.slice(0, 4).map((a, i) => (
            <div key={i} style={{ border: `2px solid ${paper}`, borderRadius: "9999px" }}>
              {a.photoUrl ? (
                <img src={a.photoUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <Avatar letter={a.name?.[0] || "?"} size={24} />
              )}
            </div>
          ))}
        </div>
        <span className="text-xs font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("card_spots_format", { filled: meetup.attendees.length, total: meetup.spotsTotal })}</span>
      </div>
    </button>
  );
}

function TopHeader({ title, subtitle, right }) {
  return (
    <div className="px-5 pt-2 pb-3 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: ink, fontFamily: displayFont }}>{title}</h1>
        {subtitle && <p className="text-sm mt-1" style={{ color: inkMuted, fontFamily: bodyFont }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Banner({ text, tone = "success", onDismiss }) {
  if (!text) return null;
  const bg = tone === "success" ? forest : tone === "warn" ? coral : ink;
  return (
    <div className="mx-5 mb-3 rounded-xl px-4 py-3 flex items-start gap-2.5" style={{ background: bg }}>
      <div className="flex-1"><p className="text-sm font-semibold leading-snug" style={{ color: paper, fontFamily: bodyFont }}>{text}</p></div>
      <button onClick={onDismiss} className="shrink-0 mt-0.5"><X size={16} color={paper} /></button>
    </div>
  );
}

function TextField({ label, ...props }) {
  return (
    <div>
      {label && <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{label}</label>}
      <input {...props} className="w-full rounded-xl border-2 px-4 py-3 text-sm font-medium outline-none disabled:opacity-40"
        style={{ borderColor: ink, color: ink, fontFamily: bodyFont, background: paper }} />
    </div>
  );
}

function SearchSelect({ label, options, value, onSelect, placeholder, disabled }) {
  const { t } = useLang();
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const filtered = query.length >= 3 ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : [];
  return (
    <div className="relative">
      {label && <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{label}</label>}
      <input
        value={query} disabled={disabled}
        onChange={(e) => { const v = e.target.value; setQuery(v); setOpen(true); onSelect(v); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || t("search_default_placeholder")}
        className="w-full rounded-xl border-2 px-4 py-3 text-sm font-medium outline-none disabled:opacity-40"
        style={{ borderColor: ink, color: ink, fontFamily: bodyFont, background: paper }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border-2 overflow-hidden" style={{ borderColor: ink, background: paper }}>
          {filtered.map((opt) => (
            <button key={opt} onMouseDown={() => { onSelect(opt); setQuery(opt); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm border-b last:border-b-0" style={{ fontFamily: bodyFont, color: ink, borderColor: lineColor }}>
              {opt}
            </button>
          ))}
        </div>
      )}
      {query.length > 0 && query.length < 3 && (
        <p className="text-[11px] mt-1" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("search_type_hint")}</p>
      )}
    </div>
  );
}

function PhotoPicker({ label, value, onChange, shape = "square" }) {
  const { t } = useLang();
  const round = shape === "round";
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const boxClass = round ? "w-16 h-16 rounded-full" : "w-20 h-20 rounded-xl";
  return (
    <div>
      {label && <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{label}</label>}
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="" className={`${boxClass} object-cover border-2`} style={{ borderColor: ink }} />
        ) : (
          <div className={`${boxClass} border-2 border-dashed flex items-center justify-center shrink-0`} style={{ borderColor: inkMuted }}>
            <Camera size={20} color={inkMuted} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold px-3 py-2 rounded-full border-2 cursor-pointer text-center" style={{ borderColor: ink, color: ink, fontFamily: bodyFont }}>
            {value ? t("photo_change") : t("photo_add")}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
          {value && (
            <button onClick={() => onChange(null)} className="text-xs font-semibold text-left" style={{ color: coral, fontFamily: bodyFont }}>{t("photo_remove")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleCard({ label, description, icon: IconComp, selected, onClick }) {
  return (
    <button onClick={onClick} className="flex-1 rounded-xl border-2 p-4 text-left flex flex-col gap-2" style={{ borderColor: ink, background: selected ? highlighter : paper }}>
      <IconComp size={22} color={ink} />
      <p className="text-sm font-bold" style={{ color: ink, fontFamily: displayFont }}>{label}</p>
      <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>{description}</p>
    </button>
  );
}

function StepDots({ step, total }) {
  return (
    <div className="flex gap-1.5 px-6 pb-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? ink : lineColor }} />
      ))}
    </div>
  );
}

function AuthShell({ children, onBack, step, totalSteps }) {
  return (
    <div className="h-full flex flex-col" style={mapBg}>
      <StatusBar />
      {step !== undefined && <StepDots step={step} total={totalSteps} />}
      <div className="px-5 pt-3 pb-2 flex items-center gap-3">
        {onBack ? <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button> : <div className="w-5" />}
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col">{children}</div>
    </div>
  );
}

// ---------- Auth: welcome / login / register ----------
function AuthWelcome({ onLogin, onRegister, onAdmin }) {
  const { t } = useLang();
  return (
    <div className="h-full flex flex-col" style={mapBg}>
      <StatusBar />
      <div className="flex-1 flex flex-col justify-center px-7">
        <div className="mb-2 text-sm font-bold tracking-wide" style={{ color: coral, fontFamily: bodyFont }}>LeCeLia</div>
        <h1 className="text-4xl font-bold leading-tight mb-3" style={{ color: ink, fontFamily: displayFont }}>
          {t("auth_welcome_tagline")}
        </h1>
        <p className="text-sm mb-10" style={{ color: inkMuted, fontFamily: bodyFont }}>
          {t("auth_welcome_subtitle")}
        </p>
        <button onClick={onLogin} className="w-full py-3.5 rounded-xl font-bold text-base mb-3" style={{ background: ink, color: paper, fontFamily: displayFont }}>
          {t("auth_login_button")}
        </button>
        <button onClick={onRegister} className="w-full py-3.5 rounded-xl font-bold text-base border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
          {t("auth_create_account_button")}
        </button>
      </div>
      <button onClick={onAdmin} className="pb-8 pt-2 text-xs font-semibold self-center" style={{ color: inkMuted, fontFamily: bodyFont }}>
        {t("auth_admin_login_link")}
      </button>
    </div>
  );
}

function ContactFields({ email, setEmail }) {
  const { t } = useLang();
  return (
    <div>
      <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("auth_contact_label")}</label>
      <TextField type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth_email_placeholder")} />
    </div>
  );
}

function RegisterBasic({ onBack, onContinue }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const contact = email.trim();
  const canContinue = name.trim().length > 1 && email.includes("@");

  return (
    <AuthShell onBack={onBack} step={0} totalSteps={3}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{t("register_title")}</h1>
      <p className="text-sm mb-5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("register_subtitle")}</p>
      <div className="flex flex-col gap-4">
        <TextField label={t("register_fullname_label")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("register_fullname_placeholder")} />
        <ContactFields email={email} setEmail={setEmail} />
      </div>
      <div className="flex-1" />
      <button disabled={!canContinue} onClick={() => onContinue({ name: name.trim(), contact })}
        className="w-full py-3.5 rounded-xl font-bold text-base mt-6 disabled:opacity-40" style={{ background: ink, color: paper, fontFamily: displayFont }}>
        {t("register_send_code_button")}
      </button>
    </AuthShell>
  );
}

function LoginContact({ onBack, onContinue }) {
  const { t } = useLang();
  const [email, setEmail] = useState("");

  const contact = email.trim();
  const canContinue = email.includes("@");

  return (
    <AuthShell onBack={onBack}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{t("login_title")}</h1>
      <p className="text-sm mb-5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("login_subtitle")}</p>
      <ContactFields email={email} setEmail={setEmail} />
      <div className="flex-1" />
      <button disabled={!canContinue} onClick={() => onContinue({ contact })}
        className="w-full py-3.5 rounded-xl font-bold text-base mt-6 disabled:opacity-40" style={{ background: ink, color: paper, fontFamily: displayFont }}>
        {t("login_send_code_button")}
      </button>
    </AuthShell>
  );
}

function VerifyCode({ contact, code, onBack, onVerify, onResend, step, totalSteps }) {
  const { t } = useLang();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [activeCode, setActiveCode] = useState(code);

  const submit = () => {
    if (input.trim() === activeCode) { setError(""); onVerify(); }
    else setError(t("verify_error"));
  };

  return (
    <AuthShell onBack={onBack} step={step} totalSteps={totalSteps}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{t("verify_title")}</h1>
      <p className="text-sm mb-5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("verify_subtitle_prefix")}<strong>{contact}</strong>{t("verify_subtitle_suffix")}</p>
      <TextField
        value={input}
        onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        inputMode="numeric"
        style={{ letterSpacing: "0.4em", textAlign: "center", fontSize: "1.25rem" }}
      />
      {error && <p className="text-xs font-semibold mt-2" style={{ color: coral, fontFamily: bodyFont }}>{error}</p>}
      <div className="rounded-xl p-3 mt-4" style={{ background: "rgba(28,43,57,0.06)" }}>
        <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>
          {t("verify_prototype_note_prefix")}<strong>{activeCode}</strong>{t("verify_prototype_note_suffix")}
        </p>
      </div>
      <button onClick={() => setActiveCode(onResend())} className="text-xs font-bold mt-3 self-start" style={{ color: ink, fontFamily: bodyFont }}>
        {t("verify_resend")}
      </button>
      <div className="flex-1" />
      <button disabled={input.length !== 6} onClick={submit}
        className="w-full py-3.5 rounded-xl font-bold text-base mt-6 disabled:opacity-40" style={{ background: ink, color: paper, fontFamily: displayFont }}>
        {t("verify_button")}
      </button>
    </AuthShell>
  );
}

function RegisterLocation({ onBack, onContinue }) {
  const { t } = useLang();
  const [country, setCountry] = useState("Portugal");
  const [city, setCity] = useState("Lisbon");
  const [area, setArea] = useState("Baixa");

  return (
    <AuthShell onBack={onBack} step={2} totalSteps={3}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{t("location_title")}</h1>
      <p className="text-sm mb-5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("location_subtitle")}</p>
      <div className="flex flex-col gap-3">
        <SearchSelect options={Object.keys(COUNTRIES)} value={country} placeholder={t("location_country_placeholder")}
          onSelect={(c) => {
            setCountry(c);
            const cities = Object.keys(COUNTRIES[c] || {});
            const firstCity = cities[0] || "";
            setCity(firstCity);
            setArea(firstCity ? (COUNTRIES[c][firstCity][0] || "") : "");
          }} />
        <SearchSelect options={Object.keys(COUNTRIES[country] || {})} value={city} placeholder={t("location_city_placeholder")} disabled={!country}
          onSelect={(c) => { setCity(c); setArea(COUNTRIES[country]?.[c]?.[0] || ""); }} />
        <SearchSelect label={t("area_of_city", { city })} options={COUNTRIES[country]?.[city] || []} value={area} placeholder={t("location_area_placeholder")} disabled={!city}
          onSelect={(a) => setArea(a)} />
      </div>
      <div className="flex-1" />
      <button onClick={() => onContinue({ country, city, area })} className="w-full py-3.5 rounded-xl font-bold text-base mt-6 flex items-center justify-center gap-2" style={{ background: ink, color: paper, fontFamily: displayFont }}>
        {t("interests_finish_button")} <ChevronRight size={18} />
      </button>
    </AuthShell>
  );
}

function InterestsScreen({ initialPicked, onBack, onSave }) {
  const { t } = useLang();
  const [picked, setPicked] = useState(initialPicked || []);
  const toggle = (label) => setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));

  return (
    <div className="h-full flex flex-col" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("editprofile_back")}</span>
      </div>
      <TopHeader title={t("interests_label")} subtitle={t("interests_screen_subtitle")} />
      <div className="flex-1 overflow-y-auto px-5">
        <div className="flex flex-wrap gap-2 mb-6">
          {INTERESTS.map((label) => <Chip key={label} label={label} selected={picked.includes(label)} onClick={() => toggle(label)} />)}
        </div>
      </div>
      <div className="px-5 pb-8 pt-3">
        <button onClick={() => onSave(picked)} className="w-full py-3.5 rounded-xl font-bold text-base" style={{ background: ink, color: paper, fontFamily: displayFont }}>
          {t("interests_save_button")}
        </button>
      </div>
    </div>
  );
}

// ---------- Admin ----------
function AdminLoginModal({ onClose, onSuccess }) {
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [error, setError] = useState("");

  const sendCode = () => {
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError("That email isn't recognized as a LeCeLia admin.");
      return;
    }
    setError("");
    setSentCode(generateCode());
    setCode("");
    setStep("code");
  };

  const verify = () => {
    if (code.trim() === sentCode) { setError(""); onSuccess(); }
    else setError("That code doesn't match. Check it and try again.");
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28,43,57,0.55)" }}>
      <div className="w-full rounded-t-3xl p-6 pb-8" style={{ background: paper }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: ink, fontFamily: displayFont }}>
            <Lock size={18} /> Admin login
          </h2>
          <button onClick={onClose}><X size={22} color={ink} /></button>
        </div>

        {step === "email" ? (
          <>
            <p className="text-sm mb-4" style={{ color: inkMuted, fontFamily: bodyFont }}>Enter your LeCeLia admin email and we'll send a one-time code.</p>
            <TextField label="Admin email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@lecelia-app.com" />
            {error && <p className="text-xs font-semibold mt-2" style={{ color: coral, fontFamily: bodyFont }}>{error}</p>}
            <div className="rounded-xl p-3 mt-4" style={{ background: "rgba(28,43,57,0.06)" }}>
              <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>
                Prototype only — demo admin email: <strong>{ADMIN_EMAIL}</strong>
              </p>
            </div>
            <button disabled={!email.includes("@")} onClick={sendCode}
              className="w-full py-3.5 rounded-xl font-bold text-base mt-6 disabled:opacity-40" style={{ background: ink, color: paper, fontFamily: displayFont }}>
              Send code
            </button>
          </>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: inkMuted, fontFamily: bodyFont }}>We sent a 6-digit code to <strong>{email}</strong>.</p>
            <TextField
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              style={{ letterSpacing: "0.4em", textAlign: "center", fontSize: "1.25rem" }}
            />
            {error && <p className="text-xs font-semibold mt-2" style={{ color: coral, fontFamily: bodyFont }}>{error}</p>}
            <div className="rounded-xl p-3 mt-4" style={{ background: "rgba(28,43,57,0.06)" }}>
              <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>
                This is a design prototype with no real message sending, so here's the code we "sent": <strong>{sentCode}</strong>
              </p>
            </div>
            <button onClick={() => setSentCode(generateCode())} className="text-xs font-bold mt-3 self-start" style={{ color: ink, fontFamily: bodyFont }}>
              Resend code
            </button>
            <button disabled={code.length !== 6} onClick={verify}
              className="w-full py-3.5 rounded-xl font-bold text-base mt-6 disabled:opacity-40" style={{ background: ink, color: paper, fontFamily: displayFont }}>
              Verify & log in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AdminApprovals({ pendingMeetups, onApprove, onDecline, onBack, onLogout }) {
  const [reasons, setReasons] = useState({});
  const [decliningId, setDecliningId] = useState(null);

  const setReason = (id, text) => setReasons((prev) => ({ ...prev, [id]: text }));
  const confirmDecline = (id) => {
    const reason = (reasons[id] || "").trim();
    if (!reason) return;
    onDecline(id, reason);
    setDecliningId(null);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2"><ArrowLeft size={22} color={ink} /><span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back</span></button>
        <button onClick={onLogout} className="flex items-center gap-1.5"><LogOut size={16} color={inkMuted} /><span className="text-xs font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Log out</span></button>
      </div>
      <TopHeader title="Admin panel" subtitle={pendingMeetups.length ? `${pendingMeetups.length} event${pendingMeetups.length > 1 ? "s" : ""} waiting for review.` : "Nothing waiting right now."} />
      <div className="px-5 pb-8">
        {pendingMeetups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>New events submitted by hosts will show up here for review.</p>
          </div>
        ) : (
          pendingMeetups.map((m) => (
            <div key={m.id} className="rounded-2xl border-2 p-4 mb-3" style={{ borderColor: ink }}>
              {m.photoUrl && (
                <img src={m.photoUrl} alt="" className="w-full h-32 object-cover rounded-xl mb-3" />
              )}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: m.color, color: paper, fontFamily: bodyFont }}>{m.category}</span>
                <GroupTag groupType={m.groupType} otherText={m.audienceOther} />
                {m.free && <FreeTag />}
              </div>
              <h3 className="text-lg font-bold leading-snug mb-1.5" style={{ color: ink, fontFamily: displayFont }}>{m.title}</h3>
              <div className="flex flex-col gap-1 mb-2.5" style={{ color: inkMuted, fontFamily: bodyFont }}>
                <div className="flex items-center gap-1.5 text-sm"><Clock size={14} /> {m.when}</div>
                <div className="flex items-center gap-1.5 text-sm"><MapPin size={14} /> {m.where}</div>
                <div className="flex items-center gap-1.5 text-sm"><Users size={14} /> Up to {m.spotsTotal} people</div>
                <div className="flex items-center gap-1.5 text-sm"><User size={14} /> {m.creatorName} · {m.creatorContact}</div>
              </div>
              <p className="text-sm leading-relaxed mb-3" style={{ color: ink, fontFamily: bodyFont }}>{m.description}</p>

              {decliningId === m.id ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold" style={{ color: ink, fontFamily: bodyFont }}>Reason for rejection (shown to the host)</label>
                  <textarea
                    rows={2} autoFocus value={reasons[m.id] || ""} onChange={(e) => setReason(m.id, e.target.value)}
                    placeholder="e.g. Meeting point is unclear — please add a specific address."
                    className="w-full rounded-xl border-2 px-3 py-2.5 text-sm outline-none resize-none"
                    style={{ borderColor: ink, fontFamily: bodyFont, color: ink }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => confirmDecline(m.id)} disabled={!(reasons[m.id] || "").trim()}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-40" style={{ background: coral, color: paper, fontFamily: displayFont }}>
                      <Ban size={16} /> Confirm rejection
                    </button>
                    <button onClick={() => setDecliningId(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => onApprove(m.id)} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5" style={{ background: forest, color: paper, fontFamily: displayFont }}>
                    <Check size={16} /> Approve
                  </button>
                  <button onClick={() => setDecliningId(m.id)} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
                    <Ban size={16} /> Decline
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AdminHome({ pendingCount, creatorsCount, usersCount, deletedCount, onOpenApprovals, onOpenCreators, onOpenUsers, onOpenDeletedAccounts, onLogout }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center justify-end">
        <button onClick={onLogout} className="flex items-center gap-1.5"><LogOut size={16} color={inkMuted} /><span className="text-xs font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Log out</span></button>
      </div>
      <TopHeader title="Admin panel" subtitle="Manage approvals, creators, and users." />
      <div className="px-5 pb-8 flex flex-col gap-3">
        <button onClick={onOpenApprovals} className="w-full text-left rounded-2xl border-2 p-5 flex items-center justify-between" style={{ borderColor: ink }}>
          <div>
            <p className="text-base font-bold" style={{ color: ink, fontFamily: displayFont }}>Pending approvals</p>
            <p className="text-xs mt-0.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{pendingCount} event{pendingCount === 1 ? "" : "s"} waiting for review</p>
          </div>
          <ChevronRight size={20} color={inkMuted} />
        </button>
        <button onClick={onOpenCreators} className="w-full text-left rounded-2xl border-2 p-5 flex items-center justify-between" style={{ borderColor: ink }}>
          <div>
            <p className="text-base font-bold" style={{ color: ink, fontFamily: displayFont }}>Creators</p>
            <p className="text-xs mt-0.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{creatorsCount} creator{creatorsCount === 1 ? "" : "s"} — message or cancel their events</p>
          </div>
          <ChevronRight size={20} color={inkMuted} />
        </button>
        <button onClick={onOpenUsers} className="w-full text-left rounded-2xl border-2 p-5 flex items-center justify-between" style={{ borderColor: ink }}>
          <div>
            <p className="text-base font-bold" style={{ color: ink, fontFamily: displayFont }}>Users</p>
            <p className="text-xs mt-0.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{usersCount} user{usersCount === 1 ? "" : "s"} — message or remove them from events</p>
          </div>
          <ChevronRight size={20} color={inkMuted} />
        </button>
        <button onClick={onOpenDeletedAccounts} className="w-full text-left rounded-2xl border-2 p-5 flex items-center justify-between" style={{ borderColor: coral }}>
          <div>
            <p className="text-base font-bold" style={{ color: coral, fontFamily: displayFont }}>Deleted accounts</p>
            <p className="text-xs mt-0.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{deletedCount} account{deletedCount === 1 ? "" : "s"} awaiting permanent data removal</p>
          </div>
          <ChevronRight size={20} color={inkMuted} />
        </button>
      </div>
    </div>
  );
}

function CreatorsList({ creators, onSelect, onBack }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back to Admin panel</span>
      </div>
      <TopHeader title="Creators" subtitle={`${creators.length} creator${creators.length === 1 ? "" : "s"} have hosted events.`} />
      <div className="px-5 pb-8">
        {creators.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>No one has created an event yet.</p>
          </div>
        ) : creators.map((c) => (
          <button key={c.contact} onClick={() => onSelect(c)} className="w-full flex items-center gap-3 py-3 border-b-2 text-left" style={{ borderColor: lineColor }}>
            <Avatar letter={c.name?.[0] || "?"} size={40} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: ink, fontFamily: bodyFont }}>{c.name}</p>
              <p className="text-xs truncate" style={{ color: inkMuted, fontFamily: bodyFont }}>{c.contact} · {c.eventCount} event{c.eventCount === 1 ? "" : "s"}</p>
            </div>
            <ChevronRight size={18} color={inkMuted} />
          </button>
        ))}
      </div>
    </div>
  );
}

function UsersList({ users, onSelect, onBack }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back to Admin panel</span>
      </div>
      <TopHeader title="Users" subtitle={`${users.length} user${users.length === 1 ? "" : "s"} have joined events.`} />
      <div className="px-5 pb-8">
        {users.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>No one has joined an event yet.</p>
          </div>
        ) : users.map((u) => (
          <button key={u.key} onClick={() => onSelect(u)} className="w-full flex items-center gap-3 py-3 border-b-2 text-left" style={{ borderColor: lineColor }}>
            {u.photoUrl ? (
              <img src={u.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
            ) : (
              <Avatar letter={u.name?.[0] || "?"} size={40} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: ink, fontFamily: bodyFont }}>{u.name}</p>
              <p className="text-xs truncate" style={{ color: inkMuted, fontFamily: bodyFont }}>{u.contact || "No contact on file"} · {u.eventCount} event{u.eventCount === 1 ? "" : "s"}</p>
            </div>
            <ChevronRight size={18} color={inkMuted} />
          </button>
        ))}
      </div>
    </div>
  );
}

function DeletedAccountsList({ accounts, onSelect, onBack }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back to Admin panel</span>
      </div>
      <TopHeader title="Deleted accounts" subtitle={`${accounts.length} account${accounts.length === 1 ? "" : "s"} waiting for their data to be permanently removed.`} />
      <div className="px-5 pb-8">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>No deleted accounts right now.</p>
          </div>
        ) : accounts.map((a) => (
          <button key={a.contact} onClick={() => onSelect(a)} className="w-full flex items-center gap-3 py-3 border-b-2 text-left" style={{ borderColor: lineColor }}>
            <Avatar letter={a.name?.[0] || "?"} size={40} bg={coral} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: ink, fontFamily: bodyFont }}>{a.name}</p>
              <p className="text-xs truncate" style={{ color: inkMuted, fontFamily: bodyFont }}>{a.contact} · deleted {new Date(a.deletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
            <ChevronRight size={18} color={inkMuted} />
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminDeletedAccountDetail({ account, onBack, onPurge }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back</span>
      </div>
      <div className="px-5 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <Avatar letter={account.name?.[0] || "?"} size={48} bg={coral} />
          <div>
            <p className="text-base font-bold" style={{ color: ink, fontFamily: displayFont }}>{account.name}</p>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{account.contact}</p>
          </div>
        </div>
        <div className="rounded-xl border-2 p-4 mb-5" style={{ borderColor: inkMuted }}>
          <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>
            This account deleted itself on {new Date(account.deletedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}. It's logged out and hidden from Creators/Users, but its data — events it created, its RSVPs, saved preferences — is still stored until you permanently remove it below.
          </p>
        </div>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: coral, color: paper, fontFamily: displayFont }}>
            <Ban size={16} /> Permanently delete all data
          </button>
        ) : (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: coral }}>
            <p className="text-sm font-semibold mb-3" style={{ color: ink, fontFamily: bodyFont }}>This can't be undone: any events {account.name} created will be cancelled (attendees notified), their RSVPs removed from other events, and their saved profile deleted. Continue?</p>
            <div className="flex gap-2">
              <button onClick={onPurge} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: coral, color: paper, fontFamily: displayFont }}>Yes, delete everything</button>
              <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>Never mind</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonEventsList({ personName, events, onSelectEvent, onBack, backLabel, emptyText, subtitle }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{backLabel}</span>
      </div>
      <TopHeader title={personName} subtitle={subtitle} />
      <div className="px-5 pb-8">
        {events.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{emptyText}</p>
          </div>
        ) : events.map((m) => (
          <button key={`${m._status || "live"}-${m.id}`} onClick={() => onSelectEvent(m)} className="w-full text-left rounded-xl border-2 p-3.5 mb-2.5" style={{ borderColor: ink }}>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: m.color, color: paper, fontFamily: bodyFont }}>{m.category}</span>
              {m._status === "pending" && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border-2" style={{ borderColor: inkMuted, color: inkMuted, fontFamily: bodyFont }}>Pending approval</span>
              )}
            </div>
            <p className="text-sm font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{m.title}</p>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{m.when} · {m.where}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminCreatorEventDetail({ event, onBack, onMessage, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back</span>
      </div>
      <div className="px-5 pb-8">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: event.color, color: paper, fontFamily: bodyFont }}>{event.category}</span>
          {event._status === "pending" && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border-2" style={{ borderColor: inkMuted, color: inkMuted, fontFamily: bodyFont }}>Pending approval</span>
          )}
        </div>
        <h1 className="text-xl font-bold mb-3" style={{ color: ink, fontFamily: displayFont }}>{event.title}</h1>
        <div className="flex flex-col gap-1.5 mb-5 rounded-xl border-2 p-4" style={{ borderColor: ink }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: ink, fontFamily: bodyFont }}><Clock size={14} /> {event.when}</div>
          <div className="flex items-center gap-2 text-sm" style={{ color: ink, fontFamily: bodyFont }}><MapPin size={14} /> {event.where}</div>
          <div className="flex items-center gap-2 text-sm" style={{ color: ink, fontFamily: bodyFont }}><Users size={14} /> {event.attendees.length}/{event.spotsTotal} going</div>
        </div>
        <button onClick={onMessage} className="w-full mb-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
          <MessageCircle size={16} /> Message creator
        </button>
        {!confirming ? (
          <button onClick={() => setConfirming(true)} className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: coral, color: paper, fontFamily: displayFont }}>
            <Ban size={16} /> Cancel event
          </button>
        ) : (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: coral }}>
            <p className="text-sm font-semibold mb-3" style={{ color: ink, fontFamily: bodyFont }}>Cancel this event? Everyone already registered will be notified.</p>
            <div className="flex gap-2">
              <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: coral, color: paper, fontFamily: displayFont }}>Yes, cancel it</button>
              <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>Never mind</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminUserEventDetail({ event, person, isHost, onBack, onMessage, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>Back</span>
      </div>
      <div className="px-5 pb-8">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: event.color, color: paper, fontFamily: bodyFont }}>{event.category}</span>
        </div>
        <h1 className="text-xl font-bold mb-3" style={{ color: ink, fontFamily: displayFont }}>{event.title}</h1>
        <div className="flex flex-col gap-1.5 mb-5 rounded-xl border-2 p-4" style={{ borderColor: ink }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: ink, fontFamily: bodyFont }}><Clock size={14} /> {event.when}</div>
          <div className="flex items-center gap-2 text-sm" style={{ color: ink, fontFamily: bodyFont }}><MapPin size={14} /> {event.where}</div>
          <div className="flex items-center gap-2 text-sm" style={{ color: ink, fontFamily: bodyFont }}><Users size={14} /> {event.attendees.length}/{event.spotsTotal} going</div>
        </div>
        <button onClick={onMessage} className="w-full mb-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
          <MessageCircle size={16} /> Message {person.name}
        </button>
        {isHost ? (
          <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: inkMuted }}>
            <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>{person.name} is hosting this event, so they can't be removed from it here. Use Creators to cancel the event instead.</p>
          </div>
        ) : !confirming ? (
          <button onClick={() => setConfirming(true)} className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2" style={{ background: coral, color: paper, fontFamily: displayFont }}>
            <Ban size={16} /> Remove from event
          </button>
        ) : (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: coral }}>
            <p className="text-sm font-semibold mb-3" style={{ color: ink, fontFamily: bodyFont }}>Remove {person.name} from this event? They'll be notified.</p>
            <div className="flex gap-2">
              <button onClick={onRemove} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: coral, color: paper, fontFamily: displayFont }}>Yes, remove them</button>
              <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>Never mind</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DirectChatThread({ personName, messages, onSend, onBack }) {
  const [text, setText] = useState("");
  const send = () => { if (!text.trim()) return; onSend(text.trim()); setText(""); };
  return (
    <div className="h-full flex flex-col" style={{ background: paper }}>
      <StatusBar showLangToggle={false} />
      <div className="px-5 pt-2 pb-3 flex items-center gap-3 border-b-2" style={{ borderColor: lineColor }}>
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <Avatar letter={personName?.[0] || "?"} size={32} />
        <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{personName}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: inkMuted, fontFamily: bodyFont }}>No messages yet — say hello.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[75%] rounded-2xl px-3.5 py-2.5" style={{ background: m.sender === "admin" ? ink : "white", color: m.sender === "admin" ? paper : ink, border: m.sender === "admin" ? "none" : `2px solid ${ink}`, fontFamily: bodyFont }}>
              <p className="text-[11px] font-bold mb-0.5" style={{ color: m.sender === "admin" ? highlighter : inkMuted }}>{m.sender === "admin" ? "Admin" : personName}</p>
              <p className="text-sm leading-snug">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-8 pt-2 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={`Message ${personName}`}
          className="flex-1 rounded-full border-2 px-4 py-2.5 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
        <button onClick={send} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: highlighter }}><Send size={18} color={ink} /></button>
      </div>
    </div>
  );
}

// ---------- Main app screens ----------
function FilterBar({ distance, setDistance, ageKey, setAgeKey, groupType, setGroupType }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 mb-2">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>
        <SlidersHorizontal size={16} /> Filters {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="flex flex-col gap-3 mb-3 p-3 rounded-xl border-2" style={{ borderColor: ink }}>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>Distance</p>
            <div className="flex gap-2 overflow-x-auto">{DISTANCES.map((d) => <Chip key={d} small label={`${d} km`} selected={distance === d} onClick={() => setDistance(d)} />)}</div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>Age range</p>
            <div className="flex gap-2 overflow-x-auto">
              <Chip small label="All ages" selected={ageKey === null} onClick={() => setAgeKey(null)} />
              {AGE_BRACKETS.map((b) => <Chip key={b.key} small label={b.key} selected={ageKey === b.key} onClick={() => setAgeKey(b.key)} />)}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>Group type</p>
            <div className="flex gap-2 overflow-x-auto">{GROUP_TYPES.map((g) => <Chip key={g} small label={g} selected={groupType === g} onClick={() => setGroupType(g)} />)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiscoverList({ meetups, onOpen }) {
  const [distance, setDistance] = useState(10);
  const [ageKey, setAgeKey] = useState(null);
  const [groupType, setGroupType] = useState("Anyone");

  const filtered = meetups.filter((m) => {
    if (m.distance > distance) return false;
    if (ageKey) {
      const bracket = AGE_BRACKETS.find((b) => b.key === ageKey);
      if (!(m.ageRange[0] <= bracket.max && m.ageRange[1] >= bracket.min)) return false;
    }
    if (groupType === "Women" && !["Mixed", "Women"].includes(m.groupType)) return false;
    if (groupType === "Men" && !["Mixed", "Men"].includes(m.groupType)) return false;
    if (groupType === "Other" && !["Mixed", "Other"].includes(m.groupType)) return false;
    return true;
  });

  return (
    <div className="pb-2">
      <FilterBar distance={distance} setDistance={setDistance} ageKey={ageKey} setAgeKey={setAgeKey} groupType={groupType} setGroupType={setGroupType} />
      <div className="px-5">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>Nothing matches those filters yet. Try widening your distance or age range.</p>
          </div>
        ) : filtered.map((m) => <MeetupCard key={m.id} meetup={m} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function HomeHub({ onJoin, onHost, joinCount, hostedCount }) {
  const { t, tn } = useLang();
  return (
    <div className="px-5 pt-2 pb-6 flex flex-col gap-4">
      <button onClick={onJoin} className="w-full text-left rounded-3xl border-2 p-6 relative overflow-hidden" style={{ borderColor: ink, background: highlighter }}>
        <div className="absolute -right-4 -bottom-4 opacity-20"><Users size={110} color={ink} /></div>
        <Users size={26} color={ink} className="mb-3" />
        <h2 className="text-2xl font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{t("home_join_title")}</h2>
        <p className="text-sm leading-snug mb-3" style={{ color: ink, fontFamily: bodyFont, opacity: 0.75 }}>
          {t("home_join_desc")}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: ink, fontFamily: bodyFont }}>
          {joinCount} {tn("home_topics", joinCount)} <ChevronRight size={14} />
        </span>
      </button>
      <button onClick={onHost} className="w-full text-left rounded-3xl border-2 p-6 relative overflow-hidden" style={{ borderColor: ink, background: paper }}>
        <div className="absolute -right-4 -bottom-4 opacity-10"><Plus size={110} color={ink} /></div>
        <Plus size={26} color={ink} className="mb-3" />
        <h2 className="text-2xl font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{t("home_host_title")}</h2>
        <p className="text-sm leading-snug mb-3" style={{ color: inkMuted, fontFamily: bodyFont }}>
          {t("home_host_desc")}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: ink, fontFamily: bodyFont }}>
          {hostedCount} {t("home_hosted_suffix")} <ChevronRight size={14} />
        </span>
      </button>
    </div>
  );
}

function TopicsGrid({
  filteredMeetups, onSelectTopic, onBack,
  dateFilter, setDateFilter, timeFilter, setTimeFilter,
  distanceFilter, setDistanceFilter, genderFilter, setGenderFilter,
  ageFilter, setAgeFilter, interestFilter, setInterestFilter, onClearFilters,
  usingLiveLocation, onLocationShared, onResetLocation,
}) {
  const { t } = useLang();
  const [locStatus, setLocStatus] = useState(null); // null | "loading" | "error" | "unsupported"
  // Filters only narrow the topic list once one is actually engaged — with
  // nothing set, Topics shows the full standard taxonomy (same as the
  // interests picker), not just whatever categories happen to have events.
  const filtersActive = Boolean(dateFilter) || timeFilter.size > 0 || genderFilter.size > 0
    || ageFilter.size > 0 || interestFilter.size > 0 || distanceFilter < 50;
  const topicMap = new Map();
  if (!filtersActive) {
    INTERESTS.forEach((name) => {
      topicMap.set(name, { count: 0, color: colorForCategory(name) });
    });
  }
  filteredMeetups.forEach((m) => {
    const entry = topicMap.get(m.category) || { count: 0, color: m.color };
    entry.count += 1;
    topicMap.set(m.category, entry);
  });
  const topics = Array.from(topicMap.entries());

  const shareLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocStatus("unsupported");
      return;
    }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocStatus(null);
        const { latitude, longitude } = pos.coords;
        onLocationShared({ lat: latitude, lng: longitude });
        window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, "_blank");
      },
      () => setLocStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="pb-4">
      <div className="px-5 pt-1 pb-2 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("topics_back")}</span>
      </div>
      <TopHeader title={t("topics_title")} subtitle={t("topics_subtitle")} />
      <div className="px-5 mb-3 flex items-center gap-2 flex-wrap">
        <button onClick={shareLocation} disabled={locStatus === "loading"} className="inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-xs font-bold disabled:opacity-60" style={{ borderColor: ink, color: ink, fontFamily: bodyFont, background: usingLiveLocation ? highlighter : "transparent" }}>
          <MapPin size={14} /> {locStatus === "loading" ? t("share_location_loading") : usingLiveLocation ? t("share_location_active") : t("share_location_button")}
        </button>
        {usingLiveLocation && (
          <button onClick={onResetLocation} className="text-xs font-bold" style={{ color: coral, fontFamily: bodyFont }}>{t("share_location_reset")}</button>
        )}
        {(locStatus === "error" || locStatus === "unsupported") && (
          <p className="w-full text-[11px] mt-1" style={{ color: coral, fontFamily: bodyFont }}>
            {locStatus === "unsupported" ? t("share_location_unsupported") : t("share_location_error")}
          </p>
        )}
      </div>
      <DiscoverFilters
        dateFilter={dateFilter} setDateFilter={setDateFilter}
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        distanceFilter={distanceFilter} setDistanceFilter={setDistanceFilter}
        genderFilter={genderFilter} setGenderFilter={setGenderFilter}
        ageFilter={ageFilter} setAgeFilter={setAgeFilter}
        interestFilter={interestFilter} setInterestFilter={setInterestFilter}
        onClear={onClearFilters}
      />
      <div className="px-5 flex flex-wrap gap-2">
        {topics.length === 0 ? (
          <div className="w-full rounded-2xl border-2 border-dashed p-6 text-center" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("topics_empty")}</p>
          </div>
        ) : topics.map(([name]) => (
          <Chip key={name} label={name} selected={false} onClick={() => onSelectTopic(name)} />
        ))}
      </div>
    </div>
  );
}

function toggleInSet(setter, value) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}

// Shared filter logic used on the Topics screen (counts) and within a topic's event list.
function matchesDiscoverFilters(m, { dateFilter, timeFilter, distanceFilter, genderFilter, ageFilter, interestFilter }) {
  if (m.distance > distanceFilter) return false;
  if (interestFilter && interestFilter.size > 0 && !interestFilter.has(m.category)) return false;
  if (dateFilter && m.startsAt) {
    const d = new Date(m.startsAt);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (local !== dateFilter) return false;
  } else if (dateFilter && !m.startsAt) return false;
  if (timeFilter.size === 1 && m.startsAt) {
    const hour = new Date(m.startsAt).getHours();
    const isAM = hour < 12;
    if (timeFilter.has("AM") && !isAM) return false;
    if (timeFilter.has("PM") && isAM) return false;
  }
  if (genderFilter.size > 0 && m.groupType !== "Mixed" && !genderFilter.has(m.groupType)) return false;
  if (ageFilter.size > 0) {
    const overlapsAny = Array.from(ageFilter).some((key) => {
      const b = AGE_BRACKETS.find((x) => x.key === key);
      return b && m.ageRange[0] <= b.max && m.ageRange[1] >= b.min;
    });
    if (!overlapsAny) return false;
  }
  return true;
}

function DiscoverFilters({ dateFilter, setDateFilter, timeFilter, setTimeFilter, distanceFilter, setDistanceFilter, genderFilter, setGenderFilter, ageFilter, setAgeFilter, interestFilter, setInterestFilter, onClear }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const activeCount = (dateFilter ? 1 : 0) + timeFilter.size + genderFilter.size + ageFilter.size + interestFilter.size + (distanceFilter < 50 ? 1 : 0);
  return (
    <div className="px-5 mb-2">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-sm font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>
        <SlidersHorizontal size={16} /> {t("filters_label")}{activeCount > 0 ? ` (${activeCount})` : ""} {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="flex flex-col gap-4 mb-3 p-3.5 rounded-xl border-2" style={{ borderColor: ink }}>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("filters_your_interests")}</p>
            <div className="flex flex-wrap gap-2">
              <Chip small label={t("filters_all")} selected={interestFilter.size === 0} onClick={() => setInterestFilter(new Set())} />
              {INTERESTS.map((label) => <Chip key={label} small label={label} selected={interestFilter.has(label)} onClick={() => toggleInSet(setInterestFilter, label)} />)}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("filters_date")}</p>
            <div className="flex items-center gap-2">
              <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                className="flex-1 rounded-lg border-2 px-3 py-2 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
              {dateFilter && <button onClick={() => setDateFilter("")} className="text-xs font-bold" style={{ color: coral, fontFamily: bodyFont }}>{t("filters_clear")}</button>}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("filters_time_of_day")}</p>
            <div className="flex gap-2">
              <Chip small label={t("filters_morning")} selected={timeFilter.has("AM")} onClick={() => toggleInSet(setTimeFilter, "AM")} />
              <Chip small label={t("filters_afternoon")} selected={timeFilter.has("PM")} onClick={() => toggleInSet(setTimeFilter, "PM")} />
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("filters_distance")}</p>
            <div className="flex gap-2 overflow-x-auto">{DISTANCES.map((d) => <Chip key={d} small label={t("filters_up_to_km", { n: d })} selected={distanceFilter === d} onClick={() => setDistanceFilter(d)} />)}</div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("filters_gender")}</p>
            <div className="flex flex-wrap gap-2">
              {["Mixed", "Women", "Men", "Other"].map((g) => <Chip key={g} small label={g} selected={genderFilter.has(g)} onClick={() => toggleInSet(setGenderFilter, g)} />)}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("filters_age")}</p>
            <div className="flex flex-wrap gap-2">
              <Chip small label={t("filters_any_age")} selected={ageFilter.size === 0} onClick={() => setAgeFilter(new Set())} />
              {AGE_BRACKETS.map((b) => <Chip key={b.key} small label={b.key} selected={ageFilter.has(b.key)} onClick={() => toggleInSet(setAgeFilter, b.key)} />)}
            </div>
          </div>
          {activeCount > 0 && (
            <button onClick={onClear} className="self-start text-xs font-bold" style={{ color: coral, fontFamily: bodyFont }}>{t("filters_clear_all")}</button>
          )}
        </div>
      )}
    </div>
  );
}

function TopicEvents({ filteredMeetups, topic, onOpen, onBack }) {
  const { t, tn } = useLang();
  const events = filteredMeetups.filter((m) => m.category === topic);

  return (
    <div className="pb-2">
      <div className="px-5 pt-1 pb-2 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("topicevents_back")}</span>
      </div>
      <TopHeader title={topic} subtitle={`${events.length} ${tn("topicevents_suffix", events.length)}`} />
      <div className="px-5">
        {events.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("topicevents_empty")}</p>
          </div>
        ) : events.map((m) => <MeetupCard key={m.id} meetup={m} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function MeetupDetail({ meetup, joined, isCreator, onToggleJoin, onBack, onOpenChat, banner, onDismissBanner, isFollowingHost, onToggleFollowHost }) {
  const { t } = useLang();
  const spotsFilled = meetup.attendees.length;
  const pct = Math.round((spotsFilled / meetup.spotsTotal) * 100);
  const isFull = spotsFilled >= meetup.spotsTotal;
  const needMore = meetup.minParticipants - spotsFilled;
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("detail_back")}</span>
      </div>
      <Banner text={banner?.text} tone={banner?.tone} onDismiss={onDismissBanner} />
      {meetup.photoUrl && (
        <div className="px-5 mb-4">
          <img src={meetup.photoUrl} alt="" className="w-full h-48 object-cover rounded-2xl border-2" style={{ borderColor: ink }} />
        </div>
      )}
      <div className="px-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: meetup.color, color: paper, fontFamily: bodyFont }}>{meetup.category}</span>
          <GroupTag groupType={meetup.groupType} otherText={meetup.audienceOther} />
          {meetup.free && <FreeTag />}
          {meetup.suitableForChildren && <KidsTag />}
          {meetup.minParticipants != null && (
            isEventConfirmed(meetup) ? <ConfirmedTag /> : <MinNeededTag needed={needMore} />
          )}
        </div>
        <h1 className="text-2xl font-bold mb-4 leading-snug" style={{ color: ink, fontFamily: displayFont }}>{meetup.title}</h1>
        {meetup.minParticipants != null && (
          <div className="rounded-xl border-2 p-4 mb-4" style={{ borderColor: isEventConfirmed(meetup) ? forest : coral }}>
            {isEventConfirmed(meetup) ? (
              <p className="text-sm font-semibold" style={{ color: forest, fontFamily: bodyFont }}>
                {t("detail_confirmed_msg", { n: meetup.minParticipants })}
              </p>
            ) : (
              <p className="text-sm font-semibold" style={{ color: coral, fontFamily: bodyFont }}>
                {t("detail_needs_more_msg", { n: needMore, word: needMore === 1 ? t("detail_needs_more_person") : t("detail_needs_more_people"), min: meetup.minParticipants })}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 mb-5 rounded-xl border-2 p-4" style={{ borderColor: ink }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: ink, fontFamily: bodyFont }}><Clock size={16} /> {meetup.when}</div>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: ink, fontFamily: bodyFont }}><MapPin size={16} /> {meetup.where} · {meetup.distance} {t("km_away")}</div>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: ink, fontFamily: bodyFont }}><Users size={16} /> {ageLabel(meetup.ageRange)} · {t("detail_spots_filled_format", { filled: spotsFilled, total: meetup.spotsTotal, pct })}</div>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: ink, fontFamily: bodyFont }}><User size={16} /> {genderLabel(meetup, t)}</div>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: meetup.free ? forest : ink, fontFamily: bodyFont }}><Check size={16} /> {meetup.free ? t("tag_free") : t("tag_paid")}</div>
        </div>
        <div className="flex items-center gap-2.5 mb-5">
          <Avatar letter={meetup.hostInitial} size={36} bg={meetup.color} />
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{meetup.host}</p>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("detail_hosting_this")}</p>
          </div>
          {!isCreator && (
            <button
              onClick={onToggleFollowHost}
              className="text-xs font-bold px-3 py-2 rounded-full border-2 shrink-0"
              style={{ borderColor: ink, background: isFollowingHost ? ink : "transparent", color: isFollowingHost ? paper : ink, fontFamily: bodyFont }}
            >
              {isFollowingHost ? t("detail_following") : t("detail_follow")}
            </button>
          )}
        </div>
        <p className="text-sm leading-relaxed mb-6" style={{ color: ink, fontFamily: bodyFont }}>{meetup.description}</p>
        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("detail_whos_going_format", { filled: spotsFilled, total: meetup.spotsTotal })}</p>
        <div className="flex flex-col gap-2.5 mb-6">
          {meetup.attendees.map((a, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {a.photoUrl ? (
                <img src={a.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border-2 shrink-0" style={{ borderColor: ink }} />
              ) : (
                <Avatar letter={a.name?.[0] || "?"} size={32} />
              )}
              <p className="text-sm font-medium" style={{ color: ink, fontFamily: bodyFont }}>{a.name}</p>
            </div>
          ))}
        </div>
        {joined && (
          <button onClick={() => onOpenChat(meetup)} className="w-full mb-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
            <MessageCircle size={16} /> {t("detail_open_chat")}
          </button>
        )}
      </div>
      <div className="px-5 pb-8 pt-2 sticky bottom-0" style={{ background: paper }}>
        {joined && isCreator ? (
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("detail_your_rsvp")}</p>
            <div className="rounded-xl border-2 py-3 flex items-center justify-center gap-2" style={{ borderColor: forest, background: forest }}>
              <ShieldCheck size={16} color={paper} />
              <span className="font-bold text-sm" style={{ color: paper, fontFamily: displayFont }}>{t("detail_hosting_always")}</span>
            </div>
          </div>
        ) : joined ? (
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("detail_your_rsvp")}</p>
            <div className="flex rounded-xl border-2 overflow-hidden" style={{ borderColor: ink }}>
              <button className="flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2" style={{ background: forest, color: paper, fontFamily: displayFont }}>
                <Check size={16} /> {t("detail_going")}
              </button>
              <button onClick={() => onToggleJoin(meetup.id)} className="flex-1 py-3 font-bold text-sm flex items-center justify-center gap-2 border-l-2" style={{ borderColor: ink, background: paper, color: ink, fontFamily: displayFont }}>
                <X size={16} /> {t("detail_not_going")}
              </button>
            </div>
          </div>
        ) : isFull ? (
          <button disabled className="w-full py-3.5 rounded-xl font-bold text-base cursor-not-allowed" style={{ background: lineColor, color: inkMuted, fontFamily: displayFont }}>
            {t("detail_event_full")}
          </button>
        ) : (
          <button onClick={() => onToggleJoin(meetup.id)} className="w-full py-3.5 rounded-xl font-bold text-base" style={{ background: highlighter, color: ink, fontFamily: displayFont }}>
            {t("detail_im_in")}
          </button>
        )}
      </div>
    </div>
  );
}

function MyMeetups({ joinedMeetups, myPendingMeetups, onOpen }) {
  const { t } = useLang();
  return (
    <div className="pb-2">
      {myPendingMeetups.length > 0 && (
        <div className="px-5 mb-4">
          <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("mymeetups_awaiting")}</p>
          {myPendingMeetups.map((m) => (
            <div key={m.id} className="rounded-2xl border-2 border-dashed p-4 mb-3" style={{ borderColor: inkMuted }}>
              <div className="flex items-center gap-2 mb-2"><Hourglass size={14} color={inkMuted} /><span className="text-xs font-bold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("mymeetups_pending_badge")}</span></div>
              <h3 className="text-base font-bold mb-1" style={{ color: ink, fontFamily: displayFont }}>{m.title}</h3>
              <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{m.when} · {m.where}</p>
            </div>
          ))}
        </div>
      )}
      <div className="px-5">
        {joinedMeetups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("mymeetups_empty")}</p>
          </div>
        ) : joinedMeetups.map((m) => <MeetupCard key={m.id} meetup={m} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function ChatList({ joinedMeetups, onOpenThread }) {
  const { t } = useLang();
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar />
      <TopHeader title={t("chat_title")} subtitle={t("chat_subtitle")} />
      <div className="px-5 pb-24">
        {joinedMeetups.length === 0 && <p className="text-sm mt-4" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("chat_empty")}</p>}
        {joinedMeetups.map((m) => {
          const msgs = CHAT_MESSAGES[m.id] || [];
          const last = msgs[msgs.length - 1];
          return (
            <button key={m.id} onClick={() => onOpenThread(m)} className="w-full flex items-center gap-3 py-3 border-b-2 text-left" style={{ borderColor: lineColor }}>
              <Avatar letter={m.hostInitial} size={40} bg={m.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: ink, fontFamily: bodyFont }}>{m.title}</p>
                <p className="text-xs truncate" style={{ color: inkMuted, fontFamily: bodyFont }}>{last ? last.text : t("chat_say_hi")}</p>
              </div>
              <ChevronRight size={18} color={inkMuted} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatThread({ meetup, onBack, currentUser }) {
  const { t } = useLang();
  const [messages, setMessages] = useState(CHAT_MESSAGES[meetup.id] || []);
  const [text, setText] = useState("");
  const send = () => { if (!text.trim()) return; setMessages((m) => [...m, { from: currentUser?.name || "You", me: true, text }]); setText(""); };
  return (
    <div className="h-full flex flex-col" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-3 flex items-center gap-3 border-b-2" style={{ borderColor: lineColor }}>
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <Avatar letter={meetup.hostInitial} size={32} bg={meetup.color} />
        <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{meetup.title}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[75%] rounded-2xl px-3.5 py-2.5" style={{ background: m.me ? ink : "white", color: m.me ? paper : ink, border: m.me ? "none" : `2px solid ${ink}`, fontFamily: bodyFont }}>
              <p className="text-[11px] font-bold mb-0.5" style={{ color: m.me ? highlighter : inkMuted }}>{m.from}</p>
              <p className="text-sm leading-snug">{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-8 pt-2 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("chat_placeholder")}
          className="flex-1 rounded-full border-2 px-4 py-2.5 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
        <button onClick={send} className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: highlighter }}><Send size={18} color={ink} /></button>
      </div>
    </div>
  );
}

function NotificationsScreen({ notifications, onBack, onMarkAllRead }) {
  const { t } = useLang();
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-1 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2"><ArrowLeft size={22} color={ink} /><span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("notif_back")}</span></button>
        {notifications.some((n) => !n.read) && (
          <button onClick={onMarkAllRead} className="text-xs font-bold" style={{ color: ink, fontFamily: bodyFont }}>{t("notif_mark_all_read")}</button>
        )}
      </div>
      <TopHeader title={t("notif_title")} />
      <div className="px-5 pb-8">
        {notifications.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("notif_empty")}</p>
          </div>
        ) : notifications.map((n) => (
          <div key={n.id} className="rounded-xl border-2 p-3.5 mb-2.5 flex items-start gap-2.5" style={{ borderColor: ink, background: n.read ? paper : highlighter }}>
            {n.tone === "success" ? <Check size={16} color={forest} className="mt-0.5 shrink-0" /> : <Ban size={16} color={coral} className="mt-0.5 shrink-0" />}
            <p className="text-sm leading-snug" style={{ color: ink, fontFamily: bodyFont }}>{n.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Profile({ currentUser, onLogout, onEditProfile, joinedCount, hostedCount, myUpcomingMeetups, onOpen, accessPass, passStatus, onOpenPaywall, eventNotices, onDismissNotice, onOpenJoined, onOpenHosted, onContactAdmin, onDeleteAccount, myInterests, onOpenInterests }) {
  const { t } = useLang();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBlockedMsg, setDeleteBlockedMsg] = useState(false);
  const [pushStatus, setPushStatus] = useState(() => {
    if (typeof window !== "undefined" && "Notification" in window) return Notification.permission;
    return "unsupported";
  });
  const requestPush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) { setPushStatus("unsupported"); return; }
    try {
      const perm = await Notification.requestPermission();
      setPushStatus(perm);
      if (perm === "granted") new Notification(t("push_test_title"), { body: t("push_test_body") });
    } catch (e) { /* best effort */ }
  };
  return (
    <div className="h-full overflow-y-auto" style={mapBg}>
      <StatusBar />
      <div className="px-5 pt-4 pb-6 flex items-start gap-4">
        {currentUser.photoUrl ? (
          <img src={currentUser.photoUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 shrink-0" style={{ borderColor: ink }} />
        ) : (
          <Avatar letter={currentUser.name?.[0] || "A"} size={64} bg={coral} />
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: ink, fontFamily: displayFont }}>{currentUser.name}</h1>
          <p className="text-sm" style={{ color: inkMuted, fontFamily: bodyFont }}>{currentUser.area}, {currentUser.city}, {currentUser.country}</p>
          <p className="text-xs mt-0.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{currentUser.contact}</p>
        </div>
        <button onClick={onEditProfile} className="text-xs font-bold px-3 py-2 rounded-full border-2 shrink-0" style={{ borderColor: ink, color: ink, fontFamily: bodyFont }}>
          {t("profile_edit")}
        </button>
      </div>

      {eventNotices.length > 0 && (
        <div className="px-5 mb-5 flex flex-col gap-2.5">
          {eventNotices.map((n) => (
            <div key={n.id} className="rounded-xl border-2 p-3.5 flex items-start gap-2.5" style={{ borderColor: n.tone === "success" ? forest : coral, background: paper }}>
              {n.tone === "success" ? <Check size={16} color={forest} className="mt-0.5 shrink-0" /> : <Ban size={16} color={coral} className="mt-0.5 shrink-0" />}
              <p className="flex-1 text-sm leading-snug" style={{ color: ink, fontFamily: bodyFont }}>{n.text}</p>
              <button onClick={() => onDismissNotice(n.id)} className="shrink-0 mt-0.5"><X size={14} color={inkMuted} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 flex gap-3 mb-6">
        <button onClick={onOpenJoined} className="flex-1 rounded-xl border-2 p-3 text-center" style={{ borderColor: ink }}><p className="text-xl font-bold" style={{ color: ink, fontFamily: displayFont }}>{joinedCount}</p><p className="text-xs font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("profile_joined")}</p></button>
        <button onClick={onOpenHosted} className="flex-1 rounded-xl border-2 p-3 text-center" style={{ borderColor: ink }}><p className="text-xl font-bold" style={{ color: ink, fontFamily: displayFont }}>{hostedCount}</p><p className="text-xs font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("profile_hosted")}</p></button>
      </div>

      <div className="px-5 mb-6">
        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("profile_access_pass")}</p>
        {passStatus === "active" && (
          <div className="rounded-2xl border-2 p-4" style={{ borderColor: forest }}>
            <div className="flex items-center gap-2 mb-1.5">
              <ShieldCheck size={16} color={forest} />
              <p className="text-sm font-bold" style={{ color: forest, fontFamily: bodyFont }}>{t("profile_pass_active_format", { label: accessPass.label })}</p>
            </div>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>
              {formatDateRange(accessPass.windowStart, accessPass.windowEnd)} · {t("profile_pass_expires")} {new Date(accessPass.windowEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          </div>
        )}
        {passStatus === "upcoming" && (
          <div className="rounded-2xl border-2 p-4" style={{ borderColor: ink }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Hourglass size={16} color={ink} />
              <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{t("profile_pass_scheduled_format", { label: accessPass.label })}</p>
            </div>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>
              {t("profile_pass_starts")} {new Date(accessPass.windowStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {formatDateRange(accessPass.windowStart, accessPass.windowEnd)}
            </p>
          </div>
        )}
        {(passStatus === "expired" || passStatus === "none") && (
          <button onClick={onOpenPaywall} className="w-full rounded-2xl border-2 border-dashed p-4 text-left" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-bold mb-1" style={{ color: ink, fontFamily: bodyFont }}>
              {passStatus === "expired" ? t("profile_pass_expired") : t("profile_pass_none")}
            </p>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("profile_pass_tap")}</p>
          </button>
        )}
      </div>

      <div className="px-5 mb-6">
        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("interests_label")}</p>
        <button onClick={onOpenInterests} className="w-full rounded-2xl border-2 p-4 text-left flex items-center justify-between gap-3" style={{ borderColor: ink }}>
          <p className="text-xs flex-1" style={{ color: myInterests.length > 0 ? ink : inkMuted, fontFamily: bodyFont }}>
            {myInterests.length > 0 ? myInterests.join(", ") : t("interests_none_selected")}
          </p>
          <ChevronRight size={18} color={inkMuted} className="shrink-0" />
        </button>
      </div>

      <div className="px-5 mb-6">
        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("profile_push_notifications")}</p>
        {pushStatus === "granted" ? (
          <div className="rounded-2xl border-2 p-4" style={{ borderColor: forest }}>
            <div className="flex items-center gap-2 mb-1">
              <Bell size={16} color={forest} />
              <p className="text-sm font-bold" style={{ color: forest, fontFamily: bodyFont }}>{t("push_status_granted_title")}</p>
            </div>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("push_status_granted_desc")}</p>
          </div>
        ) : pushStatus === "denied" ? (
          <div className="rounded-2xl border-2 border-dashed p-4" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-bold mb-1" style={{ color: ink, fontFamily: bodyFont }}>{t("push_status_denied_title")}</p>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("push_status_denied_desc")}</p>
          </div>
        ) : pushStatus === "unsupported" ? (
          <div className="rounded-2xl border-2 border-dashed p-4" style={{ borderColor: inkMuted }}>
            <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("push_unsupported")}</p>
          </div>
        ) : (
          <button onClick={requestPush} className="w-full rounded-2xl border-2 p-4 text-left flex items-center gap-3" style={{ borderColor: ink }}>
            <Bell size={18} color={ink} className="shrink-0" />
            <div>
              <p className="text-sm font-bold mb-0.5" style={{ color: ink, fontFamily: bodyFont }}>{t("push_enable_button")}</p>
              <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("push_status_default_desc")}</p>
            </div>
          </button>
        )}
      </div>

      <div className="px-5 mb-6">
        <p className="text-xs font-bold mb-2" style={{ color: ink, fontFamily: bodyFont }}>{t("profile_events_joining")}</p>
        {myUpcomingMeetups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("profile_events_joining_empty")}</p>
          </div>
        ) : (
          myUpcomingMeetups.map((m) => <MeetupCard key={m.id} meetup={m} onOpen={onOpen} />)
        )}
      </div>

      <div className="px-5 pb-32 flex flex-col gap-2.5">
        <button onClick={onContactAdmin} className="w-full rounded-xl border-2 p-3.5 flex items-center justify-center gap-2 font-bold text-sm" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
          <Mail size={16} /> {t("profile_contact_admin")}
        </button>
        <button onClick={onLogout} className="w-full rounded-xl border-2 p-3.5 flex items-center justify-center gap-2 font-bold text-sm" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>
          <LogOut size={16} /> {t("profile_logout")}
        </button>
        {!confirmingDelete ? (
          <button onClick={() => { setDeleteBlockedMsg(false); setConfirmingDelete(true); }} className="w-full rounded-xl border-2 p-3.5 flex items-center justify-center gap-2 font-bold text-sm" style={{ borderColor: coral, color: coral, fontFamily: displayFont }}>
            <Ban size={16} /> {t("profile_delete_account")}
          </button>
        ) : deleteBlockedMsg ? (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: coral }}>
            <p className="text-sm font-semibold mb-3" style={{ color: ink, fontFamily: bodyFont }}>{t("profile_delete_blocked_hosting")}</p>
            <div className="flex gap-2">
              <button onClick={onContactAdmin} className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5" style={{ background: ink, color: paper, fontFamily: displayFont }}><Mail size={14} /> {t("profile_contact_admin")}</button>
              <button onClick={() => { setConfirmingDelete(false); setDeleteBlockedMsg(false); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>{t("profile_delete_cancel_button")}</button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: coral }}>
            <p className="text-sm font-semibold mb-3" style={{ color: ink, fontFamily: bodyFont }}>{t("profile_delete_confirm_text")}</p>
            <div className="flex gap-2">
              <button onClick={async () => {
                const result = await onDeleteAccount();
                if (result?.blocked) setDeleteBlockedMsg(true);
              }} className="flex-1 py-2.5 rounded-xl font-bold text-sm" style={{ background: coral, color: paper, fontFamily: displayFont }}>{t("profile_delete_confirm_button")}</button>
              <button onClick={() => setConfirmingDelete(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2" style={{ borderColor: ink, color: ink, fontFamily: displayFont }}>{t("profile_delete_cancel_button")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileEventsList({ title, subtitle, meetups, onOpen, onBack, emptyText }) {
  const { t } = useLang();
  return (
    <div className="h-full overflow-y-auto" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-1 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("profile_events_list_back")}</span>
      </div>
      <TopHeader title={title} subtitle={subtitle} />
      <div className="px-5 pb-8">
        {meetups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-6 text-center mt-2" style={{ borderColor: inkMuted }}>
            <p className="text-sm font-medium" style={{ color: inkMuted, fontFamily: bodyFont }}>{emptyText}</p>
          </div>
        ) : meetups.map((m) => <MeetupCard key={m.id} meetup={m} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function EditProfile({ initial, onBack, onSave }) {
  const { t } = useLang();
  const [name, setName] = useState(initial.name || "");
  const [email, setEmail] = useState(initial.email ?? initial.contact ?? "");
  const [country, setCountry] = useState(initial.country || "");
  const [city, setCity] = useState(initial.city || "");
  const [area, setArea] = useState(initial.area || "");
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl || null);

  const canSave = name.trim().length > 1 && email.includes("@") && Boolean(country) && Boolean(city) && Boolean(area);
  const emailChanged = email.trim() !== (initial.contact ?? "");

  return (
    <div className="h-full flex flex-col" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="p-1 -ml-1"><ArrowLeft size={22} color={ink} /></button>
        <span className="text-sm font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("editprofile_back")}</span>
      </div>
      <TopHeader title={t("editprofile_title")} subtitle={t("editprofile_subtitle")} />
      <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-4">
        <PhotoPicker label={t("editprofile_photo_label")} value={photoUrl} onChange={setPhotoUrl} shape="round" />
        <TextField label={t("editprofile_fullname_label")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("editprofile_fullname_placeholder")} />
        <TextField label={t("editprofile_email_label")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth_email_placeholder")} />
        {emailChanged && (
          <p className="text-[11px] -mt-2" style={{ color: coral, fontFamily: bodyFont }}>
            {t("editprofile_email_changed_note")}
          </p>
        )}
        <div>
          <p className="text-xs font-bold mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("editprofile_location_label")}</p>
          <div className="flex flex-col gap-3">
            <SearchSelect options={Object.keys(COUNTRIES)} value={country} placeholder={t("create_country_placeholder")}
              onSelect={(c) => {
                setCountry(c);
                const cities = Object.keys(COUNTRIES[c] || {});
                const firstCity = cities[0] || "";
                setCity(firstCity);
                setArea(firstCity ? (COUNTRIES[c][firstCity][0] || "") : "");
              }} />
            <SearchSelect options={country ? Object.keys(COUNTRIES[country] || {}) : []} value={city} placeholder={t("create_city_placeholder")} disabled={!country}
              onSelect={(c) => { setCity(c); setArea(COUNTRIES[country]?.[c]?.[0] || ""); }} />
            <SearchSelect label={t("area_of_city", { city: city || "..." })} options={COUNTRIES[country]?.[city] || []} value={area} placeholder={t("create_area_placeholder")} disabled={!city}
              onSelect={(a) => setArea(a)} />
          </div>
        </div>
      </div>
      <div className="px-5 pb-8 pt-3">
        <button
          disabled={!canSave}
          onClick={() => onSave({ name: name.trim(), email: email.trim(), country, city, area, photoUrl })}
          className="w-full py-3.5 rounded-xl font-bold text-base disabled:opacity-40"
          style={{ background: ink, color: paper, fontFamily: displayFont }}
        >
          {emailChanged ? t("editprofile_save_confirm") : t("editprofile_save")}
        </button>
      </div>
    </div>
  );
}

function CreateMeetup({ onClose, onSubmit }) {
  const { t } = useLang();
  const [title, setTitle] = useState("");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [category, setCategory] = useState("Hiking");
  const [addingCategory, setAddingCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [maxPeople, setMaxPeople] = useState(10);
  const [minParticipants, setMinParticipants] = useState(2);
  const [ageMode, setAgeMode] = useState("any"); // "any" | "range"
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(65);
  const [audience, setAudience] = useState("Mixed");
  const [audienceOtherText, setAudienceOtherText] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [suitableForChildren, setSuitableForChildren] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [sharedCoords, setSharedCoords] = useState(null); // { lat, lng } | null — set via "Share your location"
  const [locStatus, setLocStatus] = useState(null); // null | "loading" | "error" | "unsupported"

  const shareLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocStatus("unsupported");
      return;
    }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocStatus(null);
        setSharedCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const clearSharedLocation = () => { setSharedCoords(null); setLocStatus(null); };

  const confirmCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) { setAddingCategory(false); return; }
    if (!categories.includes(trimmed)) setCategories((c) => [...c, trimmed]);
    setCategory(trimmed);
    setCustomCategory("");
    setAddingCategory(false);
  };

  const hasManualLocation = Boolean(country) && Boolean(city) && Boolean(area);
  const canSubmit = title.trim().length > 0 && Boolean(date) && Boolean(time) && meetingPoint.trim().length > 0
    && (hasManualLocation || Boolean(sharedCoords))
    && (ageMode === "any" || (Number(minAge) > 0 && Number(maxAge) >= Number(minAge)))
    && Number(minParticipants) > 0 && Number(minParticipants) <= Number(maxPeople)
    && description.trim().length > 0
    && isFree
    && (audience !== "Other" || audienceOtherText.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const startsAt = date && time ? new Date(`${date}T${time}`).getTime() : undefined;
    const ageRange = ageMode === "any" ? [0, 99] : [Number(minAge), Number(maxAge)];
    // Coordinates come from whichever the creator actually used: their
    // shared live location (precise), or an approximation of their chosen
    // city's center (with a small jitter so same-city events don't stack
    // exactly on top of each other) — either way, whoever browses later
    // gets a real computed distance instead of a fixed guessed number.
    const cityCoords = CITY_COORDS[city];
    const jitter = () => (Math.random() - 0.5) * 0.01;
    const coords = sharedCoords || (cityCoords ? { lat: cityCoords.lat + jitter(), lng: cityCoords.lng + jitter() } : null);
    onSubmit({
      id: Date.now(),
      title: title.trim(), category, color: colorForCategory(category),
      when: formatEventWhen(date, time), where: [meetingPoint.trim(), area, city].filter(Boolean).join(", ") || meetingPoint.trim(),
      city: city || null,
      distance: 0.5, ageRange, groupType: audience,
      lat: coords?.lat,
      lng: coords?.lng,
      audienceOther: audience === "Other" ? audienceOtherText.trim() : null,
      spotsTotal: Number(maxPeople) || 2,
      minParticipants: Number(minParticipants) || 1,
      description: description.trim() || "No description provided yet.",
      free: isFree,
      suitableForChildren,
      startsAt,
      photoUrl,
    });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: paper }}>
      <StatusBar />
      <div className="px-5 pt-2 pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: ink, fontFamily: displayFont }}>{t("create_header_title")}</h1>
        <button onClick={onClose}><X size={22} color={ink} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-4">
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_title_label")} <span style={{ color: coral }}>*</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("create_title_placeholder")}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
        </div>
        <PhotoPicker label={t("create_photo_label")} value={photoUrl} onChange={setPhotoUrl} />
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_category_label")} <span style={{ color: coral }}>*</span></label>
          <div className="flex flex-wrap gap-2 mb-2">
            {categories.map((c) => <Chip key={c} label={c} selected={category === c} onClick={() => setCategory(c)} />)}
            {!addingCategory && (
              <button onClick={() => setAddingCategory(true)} className="rounded-full font-medium border-2 border-dashed px-3.5 py-2 text-sm flex items-center gap-1" style={{ fontFamily: bodyFont, borderColor: inkMuted, color: inkMuted }}>
                <Plus size={14} /> {t("create_add_own")}
              </button>
            )}
          </div>
          {addingCategory && (
            <div className="flex items-center gap-2">
              <input autoFocus value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmCustomCategory()}
                placeholder={t("create_category_placeholder")} className="flex-1 rounded-xl border-2 px-4 py-2.5 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
              <button onClick={confirmCustomCategory} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: highlighter }}><Check size={18} color={ink} /></button>
              <button onClick={() => { setAddingCategory(false); setCustomCategory(""); }} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-2" style={{ borderColor: ink }}><X size={18} color={ink} /></button>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_datetime_label")} <span style={{ color: coral }}>*</span></label>
          <div className="flex gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="flex-1 rounded-xl border-2 px-4 py-3 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="flex-1 rounded-xl border-2 px-4 py-3 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
          </div>
          {date && time && (
            <p className="text-[11px] mt-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("create_will_show_as", { value: formatEventWhen(date, time) })}</p>
          )}
        </div>
        <div>
          <p className="text-xs font-bold mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_location_label")} <span style={{ color: coral }}>*</span></p>
          {sharedCoords ? (
            <div className="rounded-xl border-2 p-3.5 flex items-center justify-between gap-3" style={{ borderColor: forest, background: highlighter }}>
              <div className="flex items-center gap-2">
                <MapPin size={16} color={ink} />
                <p className="text-sm font-bold" style={{ color: ink, fontFamily: bodyFont }}>{t("create_location_shared")}</p>
              </div>
              <button onClick={clearSharedLocation} className="text-xs font-bold" style={{ color: coral, fontFamily: bodyFont }}>{t("create_location_use_manual")}</button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 mb-3">
                <SearchSelect options={Object.keys(COUNTRIES)} value={country} placeholder={t("create_country_placeholder")} onSelect={(c) => { setCountry(c); setCity(""); setArea(""); }} />
                <SearchSelect options={country ? Object.keys(COUNTRIES[country] || {}) : []} value={city} placeholder={t("create_city_placeholder")} disabled={!country} onSelect={(c) => { setCity(c); setArea(""); }} />
                <SearchSelect options={COUNTRIES[country]?.[city] || []} value={area} placeholder={t("create_area_placeholder")} disabled={!city} onSelect={(a) => setArea(a)} />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px" style={{ background: lineColor }} />
                <span className="text-[11px] font-bold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("word_or")}</span>
                <div className="flex-1 h-px" style={{ background: lineColor }} />
              </div>
              <button onClick={shareLocation} disabled={locStatus === "loading"} className="inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-xs font-bold disabled:opacity-60" style={{ borderColor: ink, color: ink, fontFamily: bodyFont }}>
                <MapPin size={14} /> {locStatus === "loading" ? t("share_location_loading") : t("share_location_button")}
              </button>
              {(locStatus === "error" || locStatus === "unsupported") && (
                <p className="text-[11px] mt-1.5" style={{ color: coral, fontFamily: bodyFont }}>
                  {locStatus === "unsupported" ? t("share_location_unsupported") : t("share_location_error")}
                </p>
              )}
            </>
          )}
        </div>
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_meeting_point_label")} <span style={{ color: coral }}>*</span></label>
          <input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} placeholder={t("create_meeting_point_placeholder")} className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
        </div>
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_people_label")} <span style={{ color: coral }}>*</span></label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[11px] font-semibold mb-1" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("create_minimum")}</p>
              <input type="number" min={1} value={minParticipants} onChange={(e) => setMinParticipants(e.target.value)}
                className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none text-center" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
            </div>
            <span className="text-sm font-bold mt-4" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("word_to")}</span>
            <div className="flex-1">
              <p className="text-[11px] font-semibold mb-1" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("create_maximum")}</p>
              <input type="number" min={1} value={maxPeople} onChange={(e) => setMaxPeople(e.target.value)}
                className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none text-center" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
            </div>
          </div>
          {Number(minParticipants) > Number(maxPeople) && (
            <p className="text-[11px] mt-1.5 font-semibold" style={{ color: coral, fontFamily: bodyFont }}>{t("create_min_max_error")}</p>
          )}
          <p className="text-[11px] mt-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("create_min_note")}</p>
        </div>
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_age_label")} <span style={{ color: coral }}>*</span></label>
          <div className="flex gap-2 mb-2">
            <Chip small label={t("create_age_any")} selected={ageMode === "any"} onClick={() => setAgeMode("any")} />
            <Chip small label={t("create_age_range")} selected={ageMode === "range"} onClick={() => setAgeMode("range")} />
          </div>
          {ageMode === "range" && (
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={99} value={minAge} onChange={(e) => setMinAge(e.target.value)}
                className="flex-1 rounded-xl border-2 px-4 py-3 text-sm outline-none text-center" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
              <span className="text-sm font-bold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("word_to")}</span>
              <input type="number" min={0} max={99} value={maxAge} onChange={(e) => setMaxAge(e.target.value)}
                className="flex-1 rounded-xl border-2 px-4 py-3 text-sm outline-none text-center" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
            </div>
          )}
          {ageMode === "range" && Number(maxAge) < Number(minAge) && (
            <p className="text-[11px] mt-1.5 font-semibold" style={{ color: coral, fontFamily: bodyFont }}>{t("create_age_error")}</p>
          )}
        </div>
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_who_can_join_label")} <span style={{ color: coral }}>*</span></label>
          <div className="flex flex-wrap gap-2">{AUDIENCE_OPTIONS.map((g) => <Chip key={g} label={g} selected={audience === g} onClick={() => setAudience(g)} />)}</div>
          {audience === "Other" && (
            <div className="mt-2.5">
              <input value={audienceOtherText} onChange={(e) => setAudienceOtherText(e.target.value)} placeholder={t("create_other_placeholder")}
                className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
              <p className="text-[11px] mt-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("create_other_note")}</p>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("create_description_label")} <span style={{ color: coral }}>*</span></label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("create_description_placeholder")} className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none resize-none" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
        </div>
        <button onClick={() => setIsFree((f) => !f)} className="flex items-start gap-3 rounded-xl border-2 p-4 text-left mb-2" style={{ borderColor: ink, background: isFree ? highlighter : paper }}>
          <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: ink, background: isFree ? ink : "transparent" }}>{isFree && <Check size={14} color={paper} />}</div>
          <span className="text-sm font-medium leading-snug" style={{ color: ink, fontFamily: bodyFont }}>{t("create_free_label")} <span style={{ color: coral }}>*</span></span>
        </button>
        <button onClick={() => setSuitableForChildren((s) => !s)} className="flex items-start gap-3 rounded-xl border-2 p-4 text-left mb-2" style={{ borderColor: ink, background: suitableForChildren ? highlighter : paper }}>
          <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: ink, background: suitableForChildren ? ink : "transparent" }}>{suitableForChildren && <Check size={14} color={paper} />}</div>
          <span className="text-sm font-medium leading-snug" style={{ color: ink, fontFamily: bodyFont }}>{t("create_children_label")}</span>
        </button>
        <div className="flex items-start gap-2 rounded-xl p-3 mb-2" style={{ background: "rgba(28,43,57,0.06)" }}>
          <Hourglass size={16} color={inkMuted} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("create_admin_note")}</p>
        </div>
      </div>
      <div className="px-5 pb-8 pt-3">
        <button onClick={handleSubmit} disabled={!canSubmit} className="w-full py-3.5 rounded-xl font-bold text-base disabled:opacity-40" style={{ background: highlighter, color: ink, fontFamily: displayFont }}>
          {t("create_submit")}
        </button>
      </div>
    </div>
  );
}

function PaywallModal({ onClose, onPurchase, isPurchasing, note, defaultDate }) {
  const { t } = useLang();
  const [selected, setSelected] = useState("day");
  const [startDate, setStartDate] = useState(defaultDate || todayDateStr());
  const plan = PAYMENT_PLANS.find((p) => p.key === selected);
  const preview = startDate ? buildPassWindow(plan, startDate) : null;
  const canConfirm = Boolean(startDate) && !isPurchasing;

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28,43,57,0.55)" }}>
      <div className="w-full rounded-t-3xl p-6 pb-8" style={{ background: paper }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: ink, fontFamily: displayFont }}>{t("paywall_title")}</h2>
          <button onClick={onClose}><X size={22} color={ink} /></button>
        </div>
        {note ? (
          <p className="text-sm mb-5 font-medium" style={{ color: coral, fontFamily: bodyFont }}>{note}</p>
        ) : (
          <p className="text-sm mb-5" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("paywall_default_note")}</p>
        )}
        <div className="flex flex-col gap-3 mb-4">
          {PAYMENT_PLANS.map((p) => (
            <button key={p.key} onClick={() => setSelected(p.key)} disabled={isPurchasing}
              className="flex items-center justify-between rounded-xl border-2 p-4 text-left disabled:opacity-60" style={{ borderColor: ink, background: selected === p.key ? highlighter : paper }}>
              <div>
                <p className="text-sm font-bold" style={{ color: ink, fontFamily: displayFont }}>{p.label}</p>
                <p className="text-xs" style={{ color: inkMuted, fontFamily: bodyFont }}>{p.blurb}</p>
              </div>
              <p className="text-lg font-bold" style={{ color: ink, fontFamily: displayFont }}>{p.price}</p>
            </button>
          ))}
        </div>
        <div className="mb-4">
          <label className="text-xs font-bold block mb-1.5" style={{ color: ink, fontFamily: bodyFont }}>{t("paywall_starting_date")}</label>
          <input type="date" value={startDate} disabled={isPurchasing} onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none disabled:opacity-60" style={{ borderColor: ink, fontFamily: bodyFont, color: ink }} />
          {preview && (
            <p className="text-[11px] mt-1.5" style={{ color: inkMuted, fontFamily: bodyFont }}>
              {t("paywall_access_window", { range: formatDateRange(preview.start, preview.end) })}
            </p>
          )}
        </div>
        <p className="text-[11px] mb-4 text-center" style={{ color: inkMuted, fontFamily: bodyFont }}>
          {t("paywall_disclaimer")}
        </p>
        <button disabled={!canConfirm} onClick={() => onPurchase(plan, startDate)}
          className="w-full py-3.5 rounded-xl font-bold text-base disabled:opacity-40" style={{ background: ink, color: paper, fontFamily: displayFont }}>
          {isPurchasing ? t("paywall_processing") : t("paywall_pay_button", { price: plan.price })}
        </button>
      </div>
    </div>
  );
}

function ContactAdminModal({ onClose }) {
  const { t } = useLang();
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(28,43,57,0.55)" }}>
      <div className="w-full rounded-t-3xl p-6 pb-8" style={{ background: paper }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: ink, fontFamily: displayFont }}>
            <Mail size={18} /> {t("contact_title")}
          </h2>
          <button onClick={onClose}><X size={22} color={ink} /></button>
        </div>
        <p className="text-sm leading-relaxed mb-5" style={{ color: ink, fontFamily: bodyFont }}>
          {t("contact_body_prefix")}<strong>{SUPPORT_EMAIL}</strong>{t("contact_body_suffix")}
        </p>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2" style={{ background: ink, color: paper, fontFamily: displayFont }}>
          <Mail size={16} /> {t("contact_email_button", { email: SUPPORT_EMAIL })}
        </a>
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, onCreate, onHelpClick, helpActive }) {
  const { t } = useLang();
  const items = [
    { key: "discover", icon: Compass, label: t("nav_discover") },
    { key: "mymeetups", icon: CalendarDays, label: t("nav_mymeetups") },
    { key: "create", icon: Plus, label: "" },
    { key: "chat", icon: MessageCircle, label: t("nav_chat") },
    { key: "help", icon: HelpCircle, label: t("nav_help") },
    { key: "profile", icon: User, label: t("nav_profile") },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around pt-2 pb-6" style={{ background: ink }}>
      {items.map((it) => {
        if (it.key === "create") {
          return <button key={it.key} onClick={onCreate} className="-mt-6 w-14 h-14 rounded-full flex items-center justify-center border-4" style={{ background: highlighter, borderColor: ink }}><Plus size={26} color={ink} /></button>;
        }
        if (it.key === "help") {
          return (
            <button key={it.key} onClick={onHelpClick} className="flex flex-col items-center gap-1 px-2">
              <it.icon size={22} color={helpActive ? highlighter : paper} />
              <span className="text-[10px] font-semibold" style={{ color: helpActive ? highlighter : paper, fontFamily: bodyFont }}>{it.label}</span>
            </button>
          );
        }
        const active = tab === it.key;
        return (
          <button key={it.key} onClick={() => setTab(it.key)} className="flex flex-col items-center gap-1 px-2">
            <it.icon size={22} color={active ? highlighter : paper} />
            <span className="text-[10px] font-semibold" style={{ color: active ? highlighter : paper, fontFamily: bodyFont }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Root ----------
export default function App() {
  // language (member-facing screens only; admin panel always renders in English)
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem("lecelia_lang") || "en"; } catch (e) { return "en"; }
  });
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem("lecelia_lang", l); } catch (e) { /* ignore */ }
  };
  const t = makeT(lang);
  const tn = makeTn(t);

  // auth
  const [phase, setPhase] = useState("auth"); // "auth" | "app"
  const [authView, setAuthView] = useState("welcome");
  const [pendingAuth, setPendingAuth] = useState({});
  const [currentUser, setCurrentUser] = useState(null);

  // admin
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminView, setAdminView] = useState("home"); // "home" | "approvals" | "creators" | "creatorEvents" | "creatorEventDetail" | "users" | "userEvents" | "userEventDetail"
  const [selectedCreator, setSelectedCreator] = useState(null); // { name, contact, eventCount }
  const [selectedUser, setSelectedUser] = useState(null); // { name, contact, key, eventCount, photoUrl }
  const [selectedDeletedAccount, setSelectedDeletedAccount] = useState(null); // { contact, name, deletedAt }
  const [selectedAdminEvent, setSelectedAdminEvent] = useState(null); // meetup (+_status) being viewed
  const [adminChatPerson, setAdminChatPerson] = useState(null); // { key, name } currently being messaged
  const [directThreads, setDirectThreads] = useState({}); // personKey -> [{ sender: "admin" | "user", text }]

  // app
  const [tab, setTab] = useState("discover");
  const [profileView, setProfileView] = useState("home"); // "home" | "joined" | "hosted" | "edit" | "edit-verify"
  const [profileEditDraft, setProfileEditDraft] = useState(null); // pending profile edits awaiting email confirmation
  const [discoverView, setDiscoverView] = useState("home"); // "home" | "topics" | "topicEvents"
  const [activeTopic, setActiveTopic] = useState(null);
  const [selectedMeetup, setSelectedMeetup] = useState(null);
  const [chatThread, setChatThread] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // A location shared via the Topics page's "Share your location" button
  // overrides the profile city for distance calculations until cleared.
  const [liveLocation, setLiveLocation] = useState(null); // { lat, lng } | null
  // ---- Live shared backend (Claude `db` capability) ----
  const dbRef = useRef(null);
  const allEventsRef = useRef([]);
  // Attendee changes made locally that the server hasn't confirmed yet,
  // keyed by event id — so the UI updates the instant someone joins or
  // leaves, instead of waiting on the network round trip.
  const optimisticRef = useRef({});
  const [dbReady, setDbReady] = useState(false);
  const [dbUnavailable, setDbUnavailable] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [allEvents, setAllEvents] = useState([]); // every event doc, {id, ...fields, status: "pending" | "live"}
  const [userPrefsDocs, setUserPrefsDocs] = useState({}); // contact -> { name, country, city, area, photoUrl, interests, followedCreators }
  const [myNotifications, setMyNotifications] = useState([]); // this logged-in account's own notifications, live from db

  // Whichever location we actually know for the person browsing right now:
  // a shared live location takes priority, otherwise their profile city.
  const effectiveLocation = liveLocation || (currentUser && CITY_COORDS[currentUser.city]) || null;
  const usingLiveLocation = Boolean(liveLocation);

  // Attaches a real, live-computed "distance from me" to every event when
  // we know where "me" is; otherwise falls back to the event's own stored
  // placeholder distance (e.g. for logged-out/admin views).
  const withLiveDistance = (m) => {
    if (!effectiveLocation || m.lat == null || m.lng == null) return m;
    const km = haversineKm(effectiveLocation.lat, effectiveLocation.lng, m.lat, m.lng);
    return { ...m, distance: Math.round(km * 10) / 10 };
  };

  const meetups = allEvents.filter((e) => e.status === "live").map(withLiveDistance);
  const pendingMeetups = allEvents.filter((e) => e.status === "pending").map(withLiveDistance);
  const myPrefs = currentUser ? (userPrefsDocs[currentUser.contact] || { interests: [], followedCreators: [] }) : { interests: [], followedCreators: [] };
  const isAttending = (m) => Boolean(currentUser && m.attendees.some((a) => a.contact === currentUser.contact));

  // Connect once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let database = null;
      try { database = await claude.use("db"); } catch (e) { database = null; }
      if (cancelled) return;
      dbRef.current = database;
      if (database) setDbReady(true);
      else setDbUnavailable(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Seed the shared store once (first-ever load only), then subscribe live
  // to every event — every viewer who opens this page after that reads and
  // writes the same shared documents.
  useEffect(() => {
    if (!dbReady) return;
    const database = dbRef.current;
    let unsub = () => {};
    (async () => {
      try {
        const existing = await database.collection("events").limit(1).get();
        if (existing.empty) {
          const seedList = [
            ...INITIAL_MEETUPS.map((m) => ({ ...m, status: "live" })),
            ...INITIAL_PENDING.map((m) => ({ ...m, status: "pending" })),
          ];
          await Promise.all(seedList.map((m) => {
            const { id, ...rest } = m;
            return database.doc(`events/${id}`).set(rest);
          }));
        }
      } catch (e) { /* seeding is best-effort; the subscription below still works if it partially failed */ }
      unsub = database.collection("events").onSnapshot(
        (snap) => {
          setAllEvents(snap.docs.map((d) => {
            const data = { ...d.data(), id: d.id };
            const ov = optimisticRef.current[d.id];
            if (ov) {
              const keyOf = (list) => (list || []).map((a) => a.contact || `name:${a.name}`).sort().join("|");
              // Server has caught up (or the override is stale): drop it.
              // Otherwise keep showing the local change so the UI doesn't flicker back.
              if (keyOf(data.attendees) === keyOf(ov.attendees) || Date.now() - ov.ts > 5000) delete optimisticRef.current[d.id];
              else data.attendees = ov.attendees;
            }
            return data;
          }));
          setEventsLoaded(true);
        },
        () => setEventsLoaded(true),
      );
    })();
    return () => unsub();
  }, [dbReady]);

  useEffect(() => { allEventsRef.current = allEvents; }, [allEvents]);

  // Every account's saved profile + prefs (name/photo/location/interests/follows).
  useEffect(() => {
    if (!dbReady) return;
    const unsub = dbRef.current.collection("userPrefs").onSnapshot((snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setUserPrefsDocs(map);
    });
    return unsub;
  }, [dbReady]);

  // The logged-in account's own notification inbox — resubscribes when who's logged in changes.
  useEffect(() => {
    if (!dbReady || !currentUser) { setMyNotifications([]); return; }
    const unsub = dbRef.current.doc(`notifications/${currentUser.contact}`).onSnapshot((snap) => {
      setMyNotifications(snap.exists ? (snap.data().items || []) : []);
    });
    return unsub;
  }, [dbReady, currentUser?.contact]);

  // Appends one notification to an account's shared inbox, trimmed to the
  // most recent 50 so a single account's mailbox can't grow unbounded.
  const pushNotification = async (contact, notif) => {
    if (!dbRef.current) return;
    const ref = dbRef.current.doc(`notifications/${contact}`);
    let existing = [];
    try {
      const snap = await ref.get();
      existing = snap.exists ? (snap.data().items || []) : [];
    } catch (e) { existing = []; }
    const items = [...existing, { id: Date.now() + Math.random(), read: false, ...notif }].slice(-50);
    await ref.set({ items });
  };

  // Merge-writes onto an account's prefs doc, using the locally-subscribed
  // copy as the read side (fine for a prototype; concurrent edits to the
  // very same account from two devices at the same instant can race).
  const upsertUserPrefs = async (contact, patch) => {
    if (!dbRef.current) return;
    const existing = userPrefsDocs[contact] || { interests: [], followedCreators: [] };
    await dbRef.current.doc(`userPrefs/${contact}`).set({ ...existing, ...patch });
  };

  // { key, productId, label, windowStart, windowEnd, purchasedAt, transactionId }
  const [accessPass, setAccessPass] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showContactAdmin, setShowContactAdmin] = useState(false);
  const [pendingJoinId, setPendingJoinId] = useState(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [banner, setBanner] = useState(null);


  // Discover filters — set on the Topics screen, applied to whichever topic is opened
  const [filterDate, setFilterDate] = useState("");
  const [filterTime, setFilterTime] = useState(new Set());
  const [filterDistance, setFilterDistance] = useState(50);
  const [filterGender, setFilterGender] = useState(new Set());
  const [filterAge, setFilterAge] = useState(new Set());
  const [filterInterests, setFilterInterests] = useState(new Set());
  const clearDiscoverFilters = () => {
    setFilterDate("");
    setFilterTime(new Set());
    setFilterDistance(50);
    setFilterGender(new Set());
    setFilterAge(new Set());
    setFilterInterests(new Set());
  };
  const filteredMeetups = meetups.filter((m) => matchesDiscoverFilters(m, {
    dateFilter: filterDate, timeFilter: filterTime, distanceFilter: filterDistance,
    genderFilter: filterGender, ageFilter: filterAge, interestFilter: filterInterests,
  }));

  // Events delete themselves automatically 24 hours after their start
  // time — e.g. an event starting on the 24th disappears on the 25th, not
  // the instant it begins. Checked right away and then re-checked every
  // minute so a page left open doesn't keep showing an event that's
  // already past its expiry window. Deletes go straight to the shared
  // store, so this is authoritative for every viewer, not just the
  // browser tab that happens to notice first.
  useEffect(() => {
    if (!dbReady) return;
    const EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000;
    const pruneExpired = () => {
      const now = Date.now();
      allEventsRef.current.forEach((m) => {
        if (m.startsAt && m.startsAt + EXPIRY_GRACE_MS <= now) {
          dbRef.current.doc(`events/${m.id}`).delete().catch(() => {});
        }
      });
    };
    pruneExpired();
    const interval = setInterval(pruneExpired, 60000);
    return () => clearInterval(interval);
  }, [dbReady]);

  // If the event currently open in any detail view just got pruned (expired
  // or removed by an admin), back out of it instead of showing stale data.
  useEffect(() => {
    if (selectedMeetup && !meetups.some((m) => m.id === selectedMeetup.id)) {
      setSelectedMeetup(null);
    }
  }, [meetups]);
  useEffect(() => {
    if (selectedAdminEvent && !meetups.some((m) => m.id === selectedAdminEvent.id) && !pendingMeetups.some((m) => m.id === selectedAdminEvent.id)) {
      setSelectedAdminEvent(null);
      setAdminView((v) => (v === "creatorEventDetail" ? "creatorEvents" : v === "userEventDetail" ? "userEvents" : v));
    }
  }, [meetups, pendingMeetups]);

  const openAdmin = () => { setShowAdmin(true); setAdminLoggedIn(false); };
  const closeAdmin = () => {
    setShowAdmin(false); setAdminLoggedIn(false); setAdminView("home");
    setSelectedCreator(null); setSelectedUser(null); setSelectedAdminEvent(null); setAdminChatPerson(null); setSelectedDeletedAccount(null);
  };

  // Every creator with at least one live or pending event, deduped by contact.
  const creatorsDirectory = (() => {
    const map = new Map();
    [...meetups, ...pendingMeetups].forEach((m) => {
      if (!m.creatorContact) return;
      if (userPrefsDocs[m.creatorContact]?.deletedAt) return;
      const entry = map.get(m.creatorContact) || { name: m.creatorName || m.host, contact: m.creatorContact, eventCount: 0 };
      entry.eventCount += 1;
      map.set(m.creatorContact, entry);
    });
    return Array.from(map.values());
  })();

  // Every attendee across live events, deduped by contact (or by name for
  // seed attendees that don't carry a contact). Deleted accounts are moved
  // out of here and into deletedAccountsDirectory instead.
  const usersDirectory = (() => {
    const map = new Map();
    meetups.forEach((m) => {
      m.attendees.forEach((a) => {
        if (a.contact && userPrefsDocs[a.contact]?.deletedAt) return;
        const key = a.contact || `name:${a.name}`;
        const entry = map.get(key) || { name: a.name, contact: a.contact || null, photoUrl: a.photoUrl || null, key, eventCount: 0 };
        entry.eventCount += 1;
        map.set(key, entry);
      });
    });
    return Array.from(map.values());
  })();

  // Accounts the person themselves deleted, awaiting an admin to
  // permanently purge their data.
  const deletedAccountsDirectory = Object.entries(userPrefsDocs)
    .filter(([, prefs]) => prefs.deletedAt)
    .map(([contact, prefs]) => ({ contact, name: prefs.name || contact, deletedAt: prefs.deletedAt }))
    .sort((a, b) => b.deletedAt - a.deletedAt);

  const creatorEvents = selectedCreator
    ? [
        ...meetups.filter((m) => m.creatorContact === selectedCreator.contact).map((m) => ({ ...m, _status: "live" })),
        ...pendingMeetups.filter((m) => m.creatorContact === selectedCreator.contact).map((m) => ({ ...m, _status: "pending" })),
      ]
    : [];

  const userEvents = selectedUser
    ? meetups.filter((m) => m.attendees.some((a) => (a.contact || `name:${a.name}`) === selectedUser.key))
    : [];

  // Cancelling deletes the shared event doc and notifies every attendee
  // (creator included) that already registered for it.
  const cancelAdminEvent = async (event) => {
    if (!dbRef.current) return;
    await dbRef.current.doc(`events/${event.id}`).delete();
    await Promise.all(event.attendees.filter((a) => a.contact).map((a) => pushNotification(a.contact, {
      text: a.contact === event.creatorContact
        ? `Your event "${event.title}" was cancelled by an admin.`
        : `"${event.title}", which you joined, has been cancelled by the organizer.`,
      tone: "warn",
    })));
    setSelectedAdminEvent(null);
    setAdminView("creatorEvents");
  };

  // Removing a user from an event drops their attendee record (freeing a
  // spot) and, if they have a contact on file, notifies them.
  const removeUserFromEvent = async (event, person) => {
    if (!dbRef.current) return;
    const nextAttendees = event.attendees.filter((a) => (a.contact || `name:${a.name}`) !== person.key);
    await dbRef.current.doc(`events/${event.id}`).update({ attendees: nextAttendees });
    if (person.contact) {
      await pushNotification(person.contact, { text: `You've been removed from "${event.title}" by an admin.`, tone: "warn" });
    }
    setSelectedAdminEvent(null);
    setAdminView("userEvents");
  };

  // User-triggered: if they're hosting any event (live or still pending),
  // deletion is blocked — that has to go through an admin first (Creators
  // → their event → Cancel). Otherwise, pulls them out of every event
  // they'd joined as an attendee, marks their account deleted (moving them
  // into the admin's "Deleted accounts" list), and logs them out.
  const deleteMyAccount = async () => {
    if (!currentUser) return { blocked: false };
    const hosting = allEvents.some((m) => m.creatorContact === currentUser.contact);
    if (hosting) return { blocked: true };
    if (dbRef.current) {
      const attended = allEvents.filter((m) =>
        m.creatorContact !== currentUser.contact && m.attendees.some((a) => a.contact === currentUser.contact));
      await Promise.all(attended.map((m) => {
        const nextAttendees = m.attendees.filter((a) => a.contact !== currentUser.contact);
        return dbRef.current.doc(`events/${m.id}`).update({ attendees: nextAttendees }).catch(() => {});
      }));
    }
    await upsertUserPrefs(currentUser.contact, { deletedAt: Date.now() });
    logout();
    return { blocked: false };
  };

  // Admin-triggered, from a deleted account's detail view: permanently
  // removes everything tied to that contact — cancelling (and notifying
  // attendees of) any event they created, dropping their attendee record
  // from every event they'd joined, and deleting their saved prefs and
  // notification inbox.
  const purgeAccountData = async (contact) => {
    if (!dbRef.current) return;
    const created = allEvents.filter((m) => m.creatorContact === contact);
    await Promise.all(created.map(async (event) => {
      try { await dbRef.current.doc(`events/${event.id}`).delete(); } catch (e) { /* best effort */ }
      await Promise.all(event.attendees.filter((a) => a.contact && a.contact !== contact).map((a) =>
        pushNotification(a.contact, { text: `"${event.title}", which you joined, has been cancelled because its host's account was deleted.`, tone: "warn" }).catch(() => {})
      ));
    }));
    const attended = allEvents.filter((m) => m.creatorContact !== contact && m.attendees.some((a) => a.contact === contact));
    await Promise.all(attended.map((m) => {
      const nextAttendees = m.attendees.filter((a) => a.contact !== contact);
      return dbRef.current.doc(`events/${m.id}`).update({ attendees: nextAttendees }).catch(() => {});
    }));
    try { await dbRef.current.doc(`userPrefs/${contact}`).delete(); } catch (e) { /* best effort */ }
    try { await dbRef.current.doc(`notifications/${contact}`).delete(); } catch (e) { /* best effort */ }
    setDirectThreads((prev) => { const next = { ...prev }; delete next[contact]; return next; });
    setSelectedDeletedAccount(null);
    setAdminView("deletedAccounts");
  };

  const sendAdminMessage = (personKey, text) => {
    setDirectThreads((prev) => ({ ...prev, [personKey]: [...(prev[personKey] || []), { sender: "admin", text }] }));
  };

  const submitMeetup = async (draft) => {
    if (!dbRef.current) return;
    const { id: _draftId, ...draftFields } = draft;
    const full = {
      ...draftFields, host: currentUser.name, hostInitial: currentUser.name[0],
      attendees: [{ name: currentUser.name, photoUrl: currentUser.photoUrl || null, contact: currentUser.contact }],
      creatorName: currentUser.name, creatorContact: currentUser.contact,
      status: "pending", createdAt: Date.now(),
    };
    await dbRef.current.collection("events").add(full);
    setShowCreate(false);
  };

  // Best-effort real device notification via the browser's Notification
  // API — this raises an actual OS-level banner on Android and desktop
  // browsers. iOS Safari only allows it for a site added to the Home
  // Screen as an installed web app (iOS 16.4+); in an ordinary browser
  // tab iOS blocks it outright, so the in-app Notifications tab stays the
  // reliable fallback there regardless of platform.
  const sendDeviceNotification = (title, body) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body });
      });
    }
  };

  const toggleFollow = async (creatorContact) => {
    if (!currentUser) return;
    const mine = userPrefsDocs[currentUser.contact] || { interests: [], followedCreators: [] };
    const already = mine.followedCreators.includes(creatorContact);
    const nextFollowed = already
      ? mine.followedCreators.filter((c) => c !== creatorContact)
      : [...mine.followedCreators, creatorContact];
    if (!already && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      // Ask for notification permission as soon as they follow someone,
      // so the device is already able to alert them by the time that
      // creator's next event goes live.
      Notification.requestPermission();
    }
    await upsertUserPrefs(currentUser.contact, { followedCreators: nextFollowed });
  };

  const approveMeetup = async (id) => {
    if (!dbRef.current) return;
    const found = pendingMeetups.find((m) => m.id === id);
    if (!found) return;
    await dbRef.current.doc(`events/${id}`).update({ status: "live" });
    const approvedText = `Your event "${found.title}" has been approved and is now live.`;
    await pushNotification(found.creatorContact, { text: approvedText, tone: "success" });
    if (currentUser && currentUser.contact === found.creatorContact) {
      sendDeviceNotification("Your event was approved", approvedText);
    }

    // Notify every registered account that either follows this creator, or
    // picked this event's category as an interest at sign-up AND is based
    // in the same city as the event — as an in-app notification for all of
    // them, plus a real device notification for whichever one happens to
    // be the active session right now.
    const targets = Object.entries(userPrefsDocs).filter(([contact, prefs]) => {
      if (contact === found.creatorContact) return false;
      const followsCreator = (prefs.followedCreators || []).includes(found.creatorContact);
      const interestedInTopic = (prefs.interests || []).includes(found.category)
        && Boolean(found.city) && prefs.city === found.city;
      return followsCreator || interestedInTopic;
    });
    await Promise.all(targets.map(([contact, prefs]) => {
      const followsCreator = (prefs.followedCreators || []).includes(found.creatorContact);
      const reason = followsCreator ? `${found.host} — a creator you follow` : `"${found.category}" — a topic you're interested in`;
      const text = `${reason} — just posted a new event: "${found.title}".`;
      if (currentUser && currentUser.contact === contact) {
        sendDeviceNotification(followsCreator ? "New event from someone you follow" : "New event in a topic you follow", text);
      }
      return pushNotification(contact, { text, tone: "success" });
    }));
  };

  const declineMeetup = async (id, reason) => {
    if (!dbRef.current) return;
    const found = pendingMeetups.find((m) => m.id === id);
    if (!found) return;
    await dbRef.current.doc(`events/${id}`).delete();
    const declinedText = `Your event "${found.title}" has been rejected. Admin note: "${reason}"`;
    await pushNotification(found.creatorContact, { text: declinedText, tone: "warn" });
    if (currentUser && currentUser.contact === found.creatorContact) {
      sendDeviceNotification("Your event was rejected", declinedText);
    }
  };

  const dismissNotification = async (id) => {
    if (!dbRef.current || !currentUser) return;
    const items = myNotifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    await dbRef.current.doc(`notifications/${currentUser.contact}`).set({ items });
  };

  // Keeps a user's display name in sync everywhere it was captured at
  // join/creation time: their attendee record on every event they've
  // joined, and (if they're the host) the event's host/creator fields.
  const propagateNameChange = async (contact, newName) => {
    if (!dbRef.current) return;
    const initial = newName?.[0] || "?";
    const affected = allEvents.filter((m) => m.creatorContact === contact || m.attendees.some((a) => a.contact === contact));
    await Promise.all(affected.map((m) => {
      const patch = {};
      if (m.creatorContact === contact) {
        patch.host = newName; patch.hostInitial = initial; patch.creatorName = newName;
      }
      if (m.attendees.some((a) => a.contact === contact)) {
        patch.attendees = m.attendees.map((a) => (a.contact === contact ? { ...a, name: newName } : a));
      }
      return dbRef.current.doc(`events/${m.id}`).update(patch);
    }));
  };

  // Name/location save immediately, whether or not the email changed. A
  // changed email is held separately and only takes effect once its code
  // is confirmed — everything else on the form is unaffected by that.
  const submitProfileEdit = async (draft) => {
    if (draft.name !== currentUser.name) {
      await propagateNameChange(currentUser.contact, draft.name);
    }
    await upsertUserPrefs(currentUser.contact, { name: draft.name, country: draft.country, city: draft.city, area: draft.area, photoUrl: draft.photoUrl });
    setCurrentUser((u) => ({ ...u, name: draft.name, country: draft.country, city: draft.city, area: draft.area, photoUrl: draft.photoUrl }));
    if (draft.email === currentUser.contact) {
      setProfileEditDraft(null);
      setProfileView("home");
    } else {
      setProfileEditDraft({ email: draft.email, code: generateCode() });
      setProfileView("edit-verify");
    }
  };

  // Moving to a new email means moving that account's identity key: copy
  // its saved prefs to the new contact and re-point every event doc that
  // referenced the old one. The old notifications inbox is left behind —
  // a known gap in this prototype's contact-change handling.
  const confirmProfileEdit = async () => {
    const oldContact = currentUser.contact;
    const newContact = profileEditDraft.email;
    if (dbRef.current) {
      const prefs = userPrefsDocs[oldContact] || { interests: [], followedCreators: [] };
      await dbRef.current.doc(`userPrefs/${newContact}`).set({ ...prefs });
      const affected = allEvents.filter((m) => m.creatorContact === oldContact || m.attendees.some((a) => a.contact === oldContact));
      await Promise.all(affected.map((m) => {
        const patch = {};
        if (m.creatorContact === oldContact) patch.creatorContact = newContact;
        if (m.attendees.some((a) => a.contact === oldContact)) {
          patch.attendees = m.attendees.map((a) => (a.contact === oldContact ? { ...a, contact: newContact } : a));
        }
        return dbRef.current.doc(`events/${m.id}`).update(patch);
      }));
    }
    setCurrentUser((u) => ({ ...u, contact: newContact }));
    setProfileEditDraft(null);
    setProfileView("home");
  };

  // Derives the pass's current status from its stored window each render,
  // so expiry (and prompting for a new pass) happens automatically with
  // no timers to manage.
  const now = Date.now();
  const passStatus = !accessPass ? "none"
    : now < accessPass.windowStart ? "upcoming"
    : now > accessPass.windowEnd ? "expired"
    : "active";

  const toggleJoin = async (id) => {
    if (!dbRef.current || !currentUser) return;
    const meetup = meetups.find((m) => m.id === id);
    if (!meetup) return;
    // Creators are always "in" their own event — no access pass required,
    // and they can't mark themselves "not going" on it either.
    const isCreator = meetup.creatorContact === currentUser.contact;
    if (isAttending(meetup)) {
      if (isCreator) return;
      // Leaving frees up a spot: drop the user's own record from the
      // attendee list, which also decrements the displayed count by 1.
      const nextAttendees = meetup.attendees.filter((a) => a.contact !== currentUser.contact);
      optimisticRef.current[id] = { attendees: nextAttendees, ts: Date.now() };
      setAllEvents((prev) => prev.map((m) => (m.id === id ? { ...m, attendees: nextAttendees } : m)));
      await dbRef.current.doc(`events/${id}`).update({ attendees: nextAttendees });
      return;
    }
    // Once the event has reached its accepted headcount, no further joins
    // are allowed — not even by buying a new access pass.
    if (!isCreator && meetup.attendees.length >= meetup.spotsTotal) {
      setBanner({ text: `"${meetup.title}" is full — there are no spots left to join.`, tone: "warn" });
      return;
    }
    if (!isCreator && !isEventCoveredByPass(meetup, accessPass)) {
      setPendingJoinId(id);
      setShowPaywall(true);
      return;
    }
    // Joining adds the user's real name (and photo, if they've set one) to
    // the event's attendee list, which increments the displayed count by 1.
    // Applied to local state immediately so the button/count update on the
    // spot, not only once the server round trip finishes.
    const nextAttendees = [...meetup.attendees, { name: currentUser.name, photoUrl: currentUser.photoUrl || null, contact: currentUser.contact }];
    optimisticRef.current[id] = { attendees: nextAttendees, ts: Date.now() };
    setAllEvents((prev) => prev.map((m) => (m.id === id ? { ...m, attendees: nextAttendees } : m)));
    await dbRef.current.doc(`events/${id}`).update({ attendees: nextAttendees });
  };

  // Runs the mock purchase flow, then grants a local entitlement covering
  // the chosen window. In a native build this same function would await
  // the store's purchase callback and a backend's receipt verification
  // before setting accessPass — nothing else in the app needs to change.
  const purchaseAccessPass = async (plan, startDateStr) => {
    setIsPurchasing(true);
    const result = await MockBillingProvider.purchase(plan.productId);
    setIsPurchasing(false);
    if (!result.success) {
      setBanner({ text: "Payment didn't go through — please try again.", tone: "warn" });
      return;
    }
    const { start, end } = buildPassWindow(plan, startDateStr);
    const newPass = {
      key: plan.key, productId: plan.productId, label: plan.label,
      windowStart: start, windowEnd: end,
      purchasedAt: result.purchasedAt, transactionId: result.transactionId,
    };
    setAccessPass(newPass);
    setShowPaywall(false);
    const id = pendingJoinId;
    setPendingJoinId(null);
    const target = id != null ? meetups.find((m) => m.id === id) : null;
    if (target && isEventCoveredByPass(target, newPass) && target.attendees.length >= target.spotsTotal) {
      setBanner({ text: `${plan.label} activated, but "${target.title}" filled up in the meantime — no spots left to join.`, tone: "warn" });
    } else if (target && isEventCoveredByPass(target, newPass)) {
      const nextAttendees = [...target.attendees, { name: currentUser.name, photoUrl: currentUser.photoUrl || null, contact: currentUser.contact }];
      optimisticRef.current[id] = { attendees: nextAttendees, ts: Date.now() };
      setAllEvents((prev) => prev.map((m) => (m.id === id ? { ...m, attendees: nextAttendees } : m)));
      if (dbRef.current) await dbRef.current.doc(`events/${id}`).update({ attendees: nextAttendees });
      setBanner({ text: `${plan.label} activated — you're in for "${target.title}". Access runs ${formatDateRange(start, end)}.`, tone: "success" });
    } else if (target) {
      setBanner({ text: `${plan.label} activated for ${formatDateRange(start, end)}, but that doesn't cover "${target.title}" on ${formatDateShort(target.startsAt)}. Pick a pass that covers that day to join it.`, tone: "warn" });
    } else {
      setBanner({ text: `${plan.label} activated — access runs ${formatDateRange(start, end)}.`, tone: "success" });
    }
  };

  const goTab = (t) => {
    setTab(t);
    setSelectedMeetup(null);
    setProfileView("home");
    if (t === "discover") { setDiscoverView("home"); setActiveTopic(null); }
  };

  const finishAuth = (user) => { setCurrentUser(user); setPhase("app"); setAuthView("welcome"); setPendingAuth({}); };
  const logout = () => { setCurrentUser(null); setPhase("auth"); setAuthView("welcome"); setTab("discover"); clearDiscoverFilters(); };

  // A creator is always counted as "in" their own approved event, regardless
  // of whether they happened to be logged in at the moment an admin approved
  // it (admin approval now runs as a separate session from the creator's).
  const isOwnEvent = (m) => Boolean(currentUser && m.creatorContact === currentUser.contact);
  const joinedMeetups = meetups.filter((m) => isAttending(m) || isOwnEvent(m));
  const myUpcomingJoinedMeetups = joinedMeetups.filter((m) => !m.startsAt || m.startsAt > Date.now());
  const hostedCount = currentUser ? meetups.filter((m) => m.creatorContact === currentUser.contact).length : 0;
  const myPendingMeetups = currentUser ? pendingMeetups.filter((m) => m.creatorContact === currentUser.contact) : [];
  const unreadCount = myNotifications.filter((n) => !n.read).length;
  const markAllRead = async () => {
    if (!dbRef.current || !currentUser) return;
    const items = myNotifications.map((n) => ({ ...n, read: true }));
    await dbRef.current.doc(`notifications/${currentUser.contact}`).set({ items });
  };

  const BellButton = (
    <button onClick={() => setShowNotifications(true)} className="relative p-1.5 rounded-full border-2 mt-1" style={{ borderColor: ink }}>
      <Bell size={18} color={ink} />
      {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: coral, color: paper }}>{unreadCount}</span>}
    </button>
  );

  // The event that triggered the paywall (if any), so it can explain *why*
  // it's showing again — e.g. an existing pass that doesn't cover this day.
  const targetMeetup = pendingJoinId != null ? meetups.find((m) => m.id === pendingJoinId) : null;
  const paywallNote = !targetMeetup ? null
    : passStatus === "expired"
      ? `Your ${accessPass.label.toLowerCase()} expired on ${formatDateShort(accessPass.windowEnd)}. Choose a new pass to keep joining events.`
      : accessPass && !isEventCoveredByPass(targetMeetup, accessPass)
        ? `Your ${accessPass.label.toLowerCase()} covers ${formatDateRange(accessPass.windowStart, accessPass.windowEnd)}. "${targetMeetup.title}" is on ${formatDateShort(targetMeetup.startsAt)} — choose a pass that covers that day.`
        : null;

  let content;

  if (dbUnavailable) {
    content = (
      <div className="h-full flex flex-col items-center justify-center px-8 text-center gap-3" style={{ background: paper }}>
        <Ban size={28} color={coral} />
        <p className="text-sm font-bold" style={{ color: ink, fontFamily: displayFont }}>{t("loading_unavailable_title")}</p>
        <p className="text-xs leading-snug" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("loading_unavailable_desc")}</p>
      </div>
    );
  } else if (!dbReady || !eventsLoaded) {
    content = (
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ background: paper }}>
        <Hourglass size={24} color={inkMuted} />
        <p className="text-xs font-semibold" style={{ color: inkMuted, fontFamily: bodyFont }}>{t("loading_app")}</p>
      </div>
    );
  } else if (showAdmin && adminLoggedIn) {
    if (adminChatPerson) {
      content = (
        <DirectChatThread
          personName={adminChatPerson.name}
          messages={directThreads[adminChatPerson.key] || []}
          onSend={(text) => sendAdminMessage(adminChatPerson.key, text)}
          onBack={() => setAdminChatPerson(null)}
        />
      );
    } else if (adminView === "creatorEventDetail" && selectedAdminEvent && selectedCreator) {
      content = (
        <AdminCreatorEventDetail
          event={selectedAdminEvent}
          onBack={() => { setSelectedAdminEvent(null); setAdminView("creatorEvents"); }}
          onMessage={() => setAdminChatPerson({ key: selectedCreator.contact, name: selectedCreator.name })}
          onCancel={() => cancelAdminEvent(selectedAdminEvent)}
        />
      );
    } else if (adminView === "creatorEvents" && selectedCreator) {
      content = (
        <PersonEventsList
          personName={selectedCreator.name}
          events={creatorEvents}
          onSelectEvent={(m) => { setSelectedAdminEvent(m); setAdminView("creatorEventDetail"); }}
          onBack={() => { setSelectedCreator(null); setAdminView("creators"); }}
          backLabel="Back to Creators"
          emptyText="This creator has no events."
          subtitle={`${creatorEvents.length} event${creatorEvents.length === 1 ? "" : "s"} created.`}
        />
      );
    } else if (adminView === "creators") {
      content = <CreatorsList creators={creatorsDirectory} onSelect={(c) => { setSelectedCreator(c); setAdminView("creatorEvents"); }} onBack={() => setAdminView("home")} />;
    } else if (adminView === "userEventDetail" && selectedAdminEvent && selectedUser) {
      content = (
        <AdminUserEventDetail
          event={selectedAdminEvent}
          person={selectedUser}
          isHost={selectedAdminEvent.creatorContact === selectedUser.contact && Boolean(selectedUser.contact)}
          onBack={() => { setSelectedAdminEvent(null); setAdminView("userEvents"); }}
          onMessage={() => setAdminChatPerson({ key: selectedUser.key, name: selectedUser.name })}
          onRemove={() => removeUserFromEvent(selectedAdminEvent, selectedUser)}
        />
      );
    } else if (adminView === "userEvents" && selectedUser) {
      content = (
        <PersonEventsList
          personName={selectedUser.name}
          events={userEvents}
          onSelectEvent={(m) => { setSelectedAdminEvent(m); setAdminView("userEventDetail"); }}
          onBack={() => { setSelectedUser(null); setAdminView("users"); }}
          backLabel="Back to Users"
          emptyText="This user hasn't joined any events."
          subtitle={`${userEvents.length} event${userEvents.length === 1 ? "" : "s"} joined.`}
        />
      );
    } else if (adminView === "users") {
      content = <UsersList users={usersDirectory} onSelect={(u) => { setSelectedUser(u); setAdminView("userEvents"); }} onBack={() => setAdminView("home")} />;
    } else if (adminView === "approvals") {
      content = <AdminApprovals pendingMeetups={pendingMeetups} onApprove={approveMeetup} onDecline={declineMeetup} onBack={() => setAdminView("home")} onLogout={closeAdmin} />;
    } else if (adminView === "deletedAccountDetail" && selectedDeletedAccount) {
      content = (
        <AdminDeletedAccountDetail
          account={selectedDeletedAccount}
          onBack={() => { setSelectedDeletedAccount(null); setAdminView("deletedAccounts"); }}
          onPurge={() => purgeAccountData(selectedDeletedAccount.contact)}
        />
      );
    } else if (adminView === "deletedAccounts") {
      content = <DeletedAccountsList accounts={deletedAccountsDirectory} onSelect={(a) => { setSelectedDeletedAccount(a); setAdminView("deletedAccountDetail"); }} onBack={() => setAdminView("home")} />;
    } else {
      content = (
        <AdminHome
          pendingCount={pendingMeetups.length}
          creatorsCount={creatorsDirectory.length}
          usersCount={usersDirectory.length}
          deletedCount={deletedAccountsDirectory.length}
          onOpenApprovals={() => setAdminView("approvals")}
          onOpenCreators={() => setAdminView("creators")}
          onOpenUsers={() => setAdminView("users")}
          onOpenDeletedAccounts={() => setAdminView("deletedAccounts")}
          onLogout={closeAdmin}
        />
      );
    }
  } else if (phase === "auth") {
    if (authView === "welcome") content = <AuthWelcome onLogin={() => setAuthView("login-contact")} onRegister={() => setAuthView("register-basic")} onAdmin={openAdmin} />;
    else if (authView === "login-contact") content = (
      <LoginContact onBack={() => setAuthView("welcome")} onContinue={({ contact }) => {
        setPendingAuth({ contact, code: generateCode() });
        setAuthView("login-verify");
      }} />
    );
    else if (authView === "login-verify") content = (
      <VerifyCode contact={pendingAuth.contact} code={pendingAuth.code}
        onBack={() => setAuthView("login-contact")}
        onResend={() => { const c = generateCode(); setPendingAuth((p) => ({ ...p, code: c })); return c; }}
        onVerify={() => {
          const saved = userPrefsDocs[pendingAuth.contact];
          finishAuth(saved
            ? { name: saved.name, contact: pendingAuth.contact, country: saved.country, city: saved.city, area: saved.area, photoUrl: saved.photoUrl || null, interests: saved.interests || [] }
            : { ...DEMO_ACCOUNT, contact: pendingAuth.contact, interests: [] });
        }}
      />
    );
    else if (authView === "register-basic") content = (
      <RegisterBasic onBack={() => setAuthView("welcome")} onContinue={(data) => { setPendingAuth({ ...data, code: generateCode() }); setAuthView("register-verify"); }} />
    );
    else if (authView === "register-verify") content = (
      <VerifyCode contact={pendingAuth.contact} code={pendingAuth.code} step={1} totalSteps={3}
        onBack={() => setAuthView("register-basic")}
        onResend={() => { const c = generateCode(); setPendingAuth((p) => ({ ...p, code: c })); return c; }}
        onVerify={() => setAuthView("register-location")}
      />
    );
    else if (authView === "register-location") content = (
      <RegisterLocation onBack={() => setAuthView("register-verify")} onContinue={async (loc) => {
        finishAuth({ name: pendingAuth.name, contact: pendingAuth.contact, ...loc, interests: [] });
        if (dbRef.current) {
          await dbRef.current.doc(`userPrefs/${pendingAuth.contact}`).set({
            name: pendingAuth.name, ...loc,
            photoUrl: null, interests: [], followedCreators: [],
          });
        }
        clearDiscoverFilters();
        setDiscoverView("home");
      }} />
    );
  } else if (chatThread) {
    content = <ChatThread meetup={chatThread} onBack={() => setChatThread(null)} currentUser={currentUser} />;
  } else if (showCreate) {
    content = <CreateMeetup onClose={() => setShowCreate(false)} onSubmit={submitMeetup} />;
  } else if (showNotifications) {
    content = <NotificationsScreen notifications={myNotifications} onBack={() => setShowNotifications(false)} onMarkAllRead={markAllRead} />;
  } else if (showHelp) {
    content = <HelpScreen onBack={() => setShowHelp(false)} />;
  } else if (selectedMeetup) {
    // Resolve the live version of whichever event is open, rather than the
    // snapshot object captured the moment it was tapped — otherwise joins,
    // leaves, and attendee-count changes wouldn't show up here until the
    // person backed out and reopened the event.
    const liveSelectedMeetup = meetups.find((m) => m.id === selectedMeetup.id) || selectedMeetup;
    content = (
      <MeetupDetail meetup={liveSelectedMeetup} joined={isAttending(liveSelectedMeetup) || isOwnEvent(liveSelectedMeetup)}
        isCreator={Boolean(currentUser && liveSelectedMeetup.creatorContact === currentUser.contact)}
        onToggleJoin={toggleJoin}
        isFollowingHost={myPrefs.followedCreators.includes(liveSelectedMeetup.creatorContact)}
        onToggleFollowHost={() => toggleFollow(liveSelectedMeetup.creatorContact)}
        onBack={() => setSelectedMeetup(null)} onOpenChat={(m) => { setSelectedMeetup(null); setChatThread(m); }}
        banner={banner} onDismissBanner={() => setBanner(null)} />
    );
  } else if (tab === "discover") {
    const allCategories = Array.from(new Set(meetups.map((m) => m.category)));
    let discoverBody;
    if (discoverView === "home") {
      discoverBody = (
        <>
          <TopHeader title="LeCeLia" subtitle={t("home_subtitle")} right={BellButton} />
          <HomeHub
            onJoin={() => setDiscoverView("topics")}
            onHost={() => setShowCreate(true)}
            joinCount={allCategories.length}
            hostedCount={hostedCount}
          />
        </>
      );
    } else if (discoverView === "topics") {
      discoverBody = (
        <TopicsGrid
          filteredMeetups={filteredMeetups}
          onSelectTopic={(name) => { setActiveTopic(name); setDiscoverView("topicEvents"); }}
          onBack={() => setDiscoverView("home")}
          dateFilter={filterDate} setDateFilter={setFilterDate}
          timeFilter={filterTime} setTimeFilter={setFilterTime}
          distanceFilter={filterDistance} setDistanceFilter={setFilterDistance}
          genderFilter={filterGender} setGenderFilter={setFilterGender}
          ageFilter={filterAge} setAgeFilter={setFilterAge}
          interestFilter={filterInterests} setInterestFilter={setFilterInterests}
          onClearFilters={clearDiscoverFilters}
          usingLiveLocation={usingLiveLocation}
          onLocationShared={(coords) => setLiveLocation(coords)}
          onResetLocation={() => setLiveLocation(null)}
        />
      );
    } else {
      discoverBody = (
        <TopicEvents
          filteredMeetups={filteredMeetups}
          topic={activeTopic}
          onOpen={setSelectedMeetup}
          onBack={() => { setDiscoverView("topics"); setActiveTopic(null); }}
        />
      );
    }
    content = (
      <div className="h-full flex flex-col" style={mapBg}>
        <StatusBar />
        <Banner text={banner?.text} tone={banner?.tone} onDismiss={() => setBanner(null)} />
        <div className="flex-1 overflow-y-auto pb-24">{discoverBody}</div>
      </div>
    );
  } else if (tab === "mymeetups") {
    content = (
      <div className="h-full flex flex-col" style={mapBg}>
        <StatusBar />
        <Banner text={banner?.text} tone={banner?.tone} onDismiss={() => setBanner(null)} />
        <TopHeader title={t("mymeetups_title")} subtitle={joinedMeetups.length ? tn("mymeetups_suffix", joinedMeetups.length) : t("mymeetups_subtitle_empty")} />
        <div className="flex-1 overflow-y-auto pb-24"><MyMeetups joinedMeetups={joinedMeetups} myPendingMeetups={myPendingMeetups} onOpen={setSelectedMeetup} /></div>
      </div>
    );
  } else if (tab === "chat") {
    content = <ChatList joinedMeetups={joinedMeetups} onOpenThread={setChatThread} />;
  } else if (tab === "profile") {
    let profileBody;
    if (profileView === "joined") {
      profileBody = (
        <ProfileEventsList
          title={t("profile_joined_events_title")}
          subtitle={joinedMeetups.length ? tn("profile_joined_suffix", joinedMeetups.length) : t("profile_joined_events_empty")}
          meetups={joinedMeetups}
          onOpen={setSelectedMeetup}
          onBack={() => setProfileView("home")}
          emptyText={t("profile_joined_events_empty_text")}
        />
      );
    } else if (profileView === "hosted") {
      const hostedMeetups = currentUser ? meetups.filter((m) => m.creatorContact === currentUser.contact) : [];
      profileBody = (
        <ProfileEventsList
          title={t("profile_hosted_events_title")}
          subtitle={hostedMeetups.length ? tn("profile_hosted_suffix", hostedMeetups.length) : t("profile_hosted_events_empty")}
          meetups={hostedMeetups}
          onOpen={setSelectedMeetup}
          onBack={() => setProfileView("home")}
          emptyText={t("profile_hosted_events_empty_text")}
        />
      );
    } else if (profileView === "edit") {
      profileBody = (
        <EditProfile
          initial={profileEditDraft ? { ...currentUser, email: profileEditDraft.email } : currentUser}
          onBack={() => { setProfileEditDraft(null); setProfileView("home"); }}
          onSave={submitProfileEdit}
        />
      );
    } else if (profileView === "edit-verify") {
      profileBody = (
        <VerifyCode
          contact={profileEditDraft.email}
          code={profileEditDraft.code}
          onBack={() => setProfileView("edit")}
          onResend={() => { const c = generateCode(); setProfileEditDraft((d) => ({ ...d, code: c })); return c; }}
          onVerify={confirmProfileEdit}
        />
      );
    } else if (profileView === "interests") {
      profileBody = (
        <InterestsScreen
          initialPicked={myPrefs.interests}
          onBack={() => setProfileView("home")}
          onSave={async (picked) => {
            if (currentUser) await upsertUserPrefs(currentUser.contact, { interests: picked });
            setProfileView("home");
          }}
        />
      );
    } else {
      profileBody = (
        <Profile
          currentUser={currentUser}
          onLogout={logout}
          onEditProfile={() => { setProfileEditDraft(null); setProfileView("edit"); }}
          joinedCount={joinedMeetups.length}
          hostedCount={hostedCount}
          myUpcomingMeetups={myUpcomingJoinedMeetups}
          onOpen={setSelectedMeetup}
          accessPass={accessPass}
          passStatus={passStatus}
          onOpenPaywall={() => setShowPaywall(true)}
          eventNotices={myNotifications.filter((n) => !n.read)}
          onDismissNotice={dismissNotification}
          onOpenJoined={() => setProfileView("joined")}
          onOpenHosted={() => setProfileView("hosted")}
          onContactAdmin={() => setShowContactAdmin(true)}
          onDeleteAccount={deleteMyAccount}
          myInterests={myPrefs.interests}
          onOpenInterests={() => setProfileView("interests")}
        />
      );
    }
    content = (
      <div className="h-full flex flex-col">
        <Banner text={banner?.text} tone={banner?.tone} onDismiss={() => setBanner(null)} />
        <div className="flex-1 overflow-y-auto pb-24">{profileBody}</div>
      </div>
    );
  }

  const isEditingProfile = tab === "profile" && (profileView === "edit" || profileView === "edit-verify" || profileView === "interests");
  const showNav = phase === "app" && !showAdmin && !chatThread && !showCreate && !showNotifications && !showHelp && !selectedMeetup && !isEditingProfile;

  return (
    <LangContext.Provider value={{ lang, setLang, t, tn }}>
    <div className="w-full min-h-screen flex items-center justify-center py-10" style={{ background: "#EDE9DC" }}>
      <div className="relative" style={{ width: 390, height: 844, borderRadius: 54, background: ink, padding: 12, boxShadow: "0 30px 60px rgba(28,43,57,0.25)" }}>
        <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: 42, background: paper }}>
          {content}
          {showNav && <BottomNav tab={tab} setTab={goTab} onCreate={() => setShowCreate(true)} onHelpClick={() => setShowHelp(true)} helpActive={showHelp} />}
          {phase === "app" && !chatThread && !showAdmin && <HomeIndicator />}
          {showPaywall && (
            <PaywallModal
              onClose={() => { setShowPaywall(false); setPendingJoinId(null); }}
              onPurchase={purchaseAccessPass}
              isPurchasing={isPurchasing}
              note={paywallNote}
              defaultDate={targetMeetup ? dateStrFromTimestamp(targetMeetup.startsAt) : todayDateStr()}
            />
          )}
          {showAdmin && !adminLoggedIn && (
            <AdminLoginModal onClose={closeAdmin} onSuccess={() => setAdminLoggedIn(true)} />
          )}
          {showContactAdmin && (
            <ContactAdminModal onClose={() => setShowContactAdmin(false)} />
          )}
        </div>
      </div>
    </div>
    </LangContext.Provider>
  );
}



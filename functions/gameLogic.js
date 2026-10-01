// ============================================================================
// SERVER-SIDE GAME LOGIC — a deliberate copy of the matching logic in
// src/App.jsx (applyMatchResult, quest selection/progress, shop costs,
// bonus-card picking). It has to be a copy, not a shared import, because
// App.jsx is a browser bundle (JSX, Firebase client SDK) and this is a
// separate Node project (Cloud Functions, Firebase Admin SDK) with no build
// step connecting the two.
//
// IMPORTANT: if you ever change quest targets, tier thresholds, unlock
// costs, or the card list in App.jsx, mirror the same change here, or the
// client's displayed numbers and the server's actually-enforced numbers
// will drift apart. cardData.js is generated straight from CARD_DB in
// App.jsx — see the comment at the top of that file for how to regenerate
// it after adding/renaming/re-costing cards.
// ============================================================================

const CARD_DB = require("./cardData.js");

const HEROES = ["Wanderer", "Prepper", "Mutant", "Scientist", "Bandit", "Cyborg"];
const TIERS = ["Bronze", "Silver", "Gold", "Legendary"];

const HERO_UNLOCK_COST = 2250;
const UNLOCK_ALL_COST = 7500;
const CARD_UNLOCK_COST = { common: 50, rare: 100, epic: 200, unique: 400 };

function findCard(id) {
  return CARD_DB.find((c) => c.id === id);
}

function isCardUnlocked(card, profile) {
  if (!profile) return false;
  if (profile.unlockedAll) return true;
  if (card.hero) {
    return (profile.unlockedHeroes || []).includes(card.hero) || (profile.unlockedCardIds || []).includes(card.id);
  }
  if (card.rarity === "common" || card.rarity === "rare") return true;
  return (profile.unlockedCardIds || []).includes(card.id);
}

function isHeroUnlocked(hero, profile) {
  if (!profile) return false;
  return !!profile.unlockedAll || (profile.unlockedHeroes || []).includes(hero);
}

function pickRandomN(arr, n) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function randomNeutralBonusCardIds() {
  const epics = CARD_DB.filter((c) => !c.hero && c.rarity === "epic");
  const uniques = CARD_DB.filter((c) => !c.hero && c.rarity === "unique");
  const ids = [];
  if (epics.length) ids.push(pickRandomN(epics, 1)[0].id);
  if (uniques.length) ids.push(pickRandomN(uniques, 1)[0].id);
  return ids;
}

/* ---------- ranked tiers ---------- */
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function applyMatchResult(profile, won) {
  const mk = currentMonthKey();
  const sameMonth = profile.monthKey === mk;
  const p = {
    wins: profile.wins || 0, losses: profile.losses || 0,
    winStreak: profile.winStreak || 0, lossStreak: profile.lossStreak || 0,
    tier: profile.tier || "Bronze",
    highestTier: profile.highestTier || profile.tier || "Bronze",
    monthKey: mk,
    monthWins: sameMonth ? (profile.monthWins || 0) : 0,
    monthLosses: sameMonth ? (profile.monthLosses || 0) : 0,
  };
  if (won) {
    p.wins += 1; p.monthWins += 1;
    p.winStreak += 1; p.lossStreak = 0;
    if (p.winStreak >= 5 && TIERS.indexOf(p.tier) < TIERS.length - 1) {
      p.tier = TIERS[TIERS.indexOf(p.tier) + 1];
      p.winStreak = 0;
      if (TIERS.indexOf(p.tier) > TIERS.indexOf(p.highestTier)) p.highestTier = p.tier;
    }
  } else {
    p.losses += 1; p.monthLosses += 1;
    p.lossStreak += 1; p.winStreak = 0;
    if (p.lossStreak >= 5 && TIERS.indexOf(p.tier) > 0) {
      p.tier = TIERS[TIERS.indexOf(p.tier) - 1];
      p.lossStreak = 0;
    }
  }
  return p;
}

/* =========================================================================
   QUESTS — same deterministic seeded selection as the client, so the
   server always agrees with what the player was shown.
   ========================================================================= */
const QUEST_POOL = [
  { id: "grinder", title: "Atomic Grinder", type: "gamesPlayed", min: 25, max: 35, verb: "Play", noun: "games" },
  { id: "warrior", title: "Feared Warrior", type: "wins", min: 15, max: 20, verb: "Win", noun: "games" },
  { id: "shuffler", title: "Casino Shuffler", type: "neutralCardsPlayed", min: 500, max: 600, verb: "Play", noun: "neutral cards" },
  { id: "overpowered", title: "Overpowered", type: "uniqueCardsPlayed", min: 60, max: 80, verb: "Play", noun: "unique cards" },
  { id: "purple", title: "Purple Monster", type: "epicCardsPlayed", min: 200, max: 250, verb: "Play", noun: "epic cards" },
  { id: "medalist", title: "Wasteland Medalist", type: "tier" },
  { id: "nemesis", title: "Nemesis", type: "heroDefeats", min: 5, max: 8, randomHero: true, verb: "Defeat", noun: "times" },
  { id: "comedy", title: "Comedy Gold", type: "cardPlays", cardName: "Jim, King of Comedy", min: 10, max: 15, verb: "Play", noun: "times" },
  { id: "armored", title: "Armored", type: "armorGained", min: 150, max: 175, verb: "Gain", noun: "armor" },
  { id: "firstaid", title: "First Aid Expert", type: "healthRestored", min: 200, max: 250, verb: "Restore", noun: "health" },
];
const QUEST_BULLET_REWARD = 100;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function questWeekId(date = new Date()) {
  const et = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const shifted = new Date(et.getTime() - 20 * 60 * 60 * 1000);
  const day = shifted.getDay();
  const sunday = new Date(shifted);
  sunday.setDate(shifted.getDate() - day);
  sunday.setHours(0, 0, 0, 0);
  const epoch = new Date(2020, 0, 1);
  return Math.floor((sunday - epoch) / (7 * 24 * 60 * 60 * 1000));
}
function selectWeeklyQuests(weekId) {
  const rng = mulberry32(weekId);
  const pool = QUEST_POOL.map((q) => ({ ...q }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5).map((q, i) => ({
    ...q,
    target: q.min !== undefined ? q.min + Math.floor(rng() * (q.max - q.min + 1)) : null,
    hero: q.randomHero ? HEROES[Math.floor(rng() * HEROES.length)] : null,
  }));
}
function questProgress(q, weeklyProgress, tier) {
  if (q.type === "tier") {
    const done = TIERS.indexOf(tier || "Bronze") >= TIERS.indexOf("Gold");
    return { current: done ? 1 : 0, target: 1, done };
  }
  if (q.type === "heroDefeats") {
    const current = (weeklyProgress.heroDefeats && weeklyProgress.heroDefeats[q.hero]) || 0;
    return { current, target: q.target, done: current >= q.target };
  }
  if (q.type === "cardPlays") {
    const current = (weeklyProgress.cardPlays && weeklyProgress.cardPlays[q.cardName]) || 0;
    return { current, target: q.target, done: current >= q.target };
  }
  const current = weeklyProgress[q.type] || 0;
  return { current, target: q.target, done: current >= q.target };
}
function freshWeeklyProgress(weekId) {
  return { weekId, gamesPlayed: 0, wins: 0, neutralCardsPlayed: 0, epicCardsPlayed: 0, uniqueCardsPlayed: 0, armorGained: 0, healthRestored: 0, heroDefeats: {}, cardPlays: {}, claimedQuestIds: [] };
}
function weeklyProgressFor(profile) {
  const wk = questWeekId();
  if (!profile || !profile.weeklyProgress || profile.weeklyProgress.weekId !== wk) return freshWeeklyProgress(wk);
  return profile.weeklyProgress;
}

module.exports = {
  CARD_DB, HEROES, TIERS,
  HERO_UNLOCK_COST, UNLOCK_ALL_COST, CARD_UNLOCK_COST,
  findCard, isCardUnlocked, isHeroUnlocked, randomNeutralBonusCardIds,
  applyMatchResult, currentMonthKey,
  QUEST_BULLET_REWARD, selectWeeklyQuests, questProgress, weeklyProgressFor, questWeekId,
};

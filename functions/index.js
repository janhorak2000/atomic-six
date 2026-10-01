// ============================================================================
// CLOUD FUNCTIONS — the server-side gatekeeper for Bullets and unlocks.
//
// Why this file exists: before this, the browser wrote `bullets`,
// `unlockedHeroes`, `unlockedCardIds`, `wins`, `losses`, `tier`, etc.
// directly to Firestore. Firestore rules could only check "is this your own
// document", never "is this value legitimate" - so anyone could open
// devtools and set their own bullets to 999999. Every function below runs
// on Google's servers using the Firebase Admin SDK, which is NOT subject to
// Firestore security rules at all. The client can no longer write any of
// those fields directly (see firestore.rules) - it can only ask one of
// these functions to do it, and each function independently recomputes the
// result from data it trusts (the match document both players already
// wrote to, or the player's own current server-side balance) rather than
// trusting whatever the client claims.
//
// IMPORTANT — this does not need to be deployed to make the app work for
// development/testing against the free Spark plan; it DOES need to be
// deployed (which requires the pay-as-you-go Blaze plan) before you ship
// this to real users, because without it the client has nothing to call
// and nothing stops the old vulnerability. See DEPLOYMENT_GUIDE.md.
//
// COST PROTECTION — two independent guards against a traffic flood running
// up a bill, on top of the Firebase Spend Caps you set in the console (see
// DEPLOYMENT_GUIDE.md), which can't be set from code:
//   1. setGlobalOptions({ maxInstances }) below puts a hard ceiling on how
//      many copies of these functions can ever run at once, no matter how
//      much traffic arrives - cost from these functions is bounded by that
//      number, period, not by whatever a flood sends.
//   2. enforceAppCheck: true on every function below rejects any call that
//      doesn't come with a valid App Check token - i.e. a request from
//      something that isn't actually your deployed app (a script hitting
//      the function URL directly, which is the realistic way someone would
//      generate "crazy traffic" cheaply). This requires App Check to be set
//      up for this project (console step) and initialized in src/firebase.js
//      (already done) - see DEPLOYMENT_GUIDE.md for the console side.
// ============================================================================

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const {
  HEROES,
  HERO_UNLOCK_COST, UNLOCK_ALL_COST, CARD_UNLOCK_COST,
  findCard, isCardUnlocked, isHeroUnlocked, randomNeutralBonusCardIds,
  applyMatchResult,
  QUEST_BULLET_REWARD, selectWeeklyQuests, questProgress, weeklyProgressFor,
} = require("./gameLogic.js");

// A generous ceiling for an indie-scale game - raise it later if you
// genuinely have enough concurrent players to need to, but the whole point
// is that it's a deliberate, known number rather than "however much a flood
// sends." 20 concurrent instances comfortably covers far more than a real
// traffic spike from your actual players would ever need at once.
setGlobalOptions({ maxInstances: 20 });

initializeApp();
const db = getFirestore();

// Keep this in sync with ADMIN_EMAILS in src/App.jsx - that list only
// controls whether the Shop UI SHOWS the admin panel to someone; this list
// is what actually lets a grant go through. Replace the placeholder with
// your real Google account email before deploying.
const ADMIN_EMAILS = ["janhorak2000@gmail.com"];

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return request.auth.uid;
}

/* =========================================================================
   claimMatchReward — the big one. Called once by each player right after a
   real (non-CPU) match ends. Recomputes wins/losses/tier/streak and weekly
   quest/bullet progress purely from:
     (a) the match document (which both players already had legitimate
         write access to as participants, and which records who actually
         won), and
     (b) the player's own current server-side profile.
   Never trusts a number the client sends - the client only sends which
   match to settle.
   ========================================================================= */
exports.claimMatchReward = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const gameId = request.data && request.data.gameId;
  if (!gameId || typeof gameId !== "string") {
    throw new HttpsError("invalid-argument", "gameId is required.");
  }

  const matchRef = db.collection("matches").doc(gameId);
  const userRef = db.collection("users").doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Match not found.");
    const match = matchSnap.data();

    if (!Array.isArray(match.playerIds) || !match.playerIds.includes(uid)) {
      throw new HttpsError("permission-denied", "You weren't a player in this match.");
    }
    if (match.winner === null || match.winner === undefined) {
      throw new HttpsError("failed-precondition", "This match hasn't finished yet.");
    }
    const myIdx = (match.players || []).findIndex((p) => p.sessionId === uid);
    if (myIdx === -1) throw new HttpsError("failed-precondition", "Couldn't find your seat in this match.");

    // Already settled for this player — return success quietly instead of
    // erroring, so a client retry (e.g. after a dropped connection) never
    // double-credits and never shows the player a scary failure either.
    if (match.rewardsClaimed && match.rewardsClaimed[uid]) {
      const existingSnap = await tx.get(userRef);
      return { alreadyClaimed: true, profile: existingSnap.exists ? existingSnap.data() : null };
    }

    const won = match.winner === myIdx;
    const me = match.players[myIdx] || {};
    const opp = match.players[myIdx === 0 ? 1 : 0] || {};

    const userSnap = await tx.get(userRef);
    const existing = userSnap.exists ? userSnap.data() : {};

    let profile = applyMatchResult(existing, won);

    let wp = { ...weeklyProgressFor(existing) };
    wp.gamesPlayed += 1;
    if (won) {
      wp.wins += 1;
      wp.heroDefeats = { ...wp.heroDefeats, [opp.hero]: (wp.heroDefeats[opp.hero] || 0) + 1 };
    }
    const ms = me.matchStats || {};
    wp.neutralCardsPlayed += ms.neutralCardsPlayed || 0;
    wp.epicCardsPlayed += ms.epicCardsPlayed || 0;
    wp.uniqueCardsPlayed += ms.uniqueCardsPlayed || 0;
    wp.armorGained += ms.armorGained || 0;
    wp.healthRestored += ms.healthRestored || 0;
    const mergedCardPlays = { ...wp.cardPlays };
    Object.entries(ms.cardPlays || {}).forEach(([name, count]) => {
      mergedCardPlays[name] = (mergedCardPlays[name] || 0) + count;
    });
    wp.cardPlays = mergedCardPlays;

    const activeQuests = selectWeeklyQuests(wp.weekId);
    const tierForQuests = profile.tier || existing.tier || "Bronze";
    let bullets = existing.bullets || 0;
    const claimed = new Set(wp.claimedQuestIds || []);
    activeQuests.forEach((q) => {
      if (claimed.has(q.id)) return;
      if (questProgress(q, wp, tierForQuests).done) {
        claimed.add(q.id);
        bullets += QUEST_BULLET_REWARD;
      }
    });
    wp.claimedQuestIds = Array.from(claimed);

    profile = {
      ...existing,
      ...profile,
      weeklyProgress: wp,
      bullets,
      displayName: existing.displayName || me.displayName || "Player",
      email: existing.email || null,
    };

    tx.set(userRef, profile, { merge: true });
    tx.update(matchRef, { [`rewardsClaimed.${uid}`]: true });

    return { alreadyClaimed: false, profile };
  });

  return result;
});

/* =========================================================================
   claimFirstHero — the one-time free hero pick at onboarding. Refuses to
   run twice, so repeated calls can't be used to "re-roll" extra heroes or
   extra bonus cards for free.
   ========================================================================= */
exports.claimFirstHero = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const hero = request.data && request.data.hero;
  if (!HEROES.includes(hero)) throw new HttpsError("invalid-argument", "Unknown hero.");

  const userRef = db.collection("users").doc(uid);
  const auth = request.auth;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const existing = snap.exists ? snap.data() : {};
    if ((existing.unlockedHeroes || []).length > 0 || existing.unlockedAll) {
      throw new HttpsError("failed-precondition", "You already picked your first hero.");
    }
    const bonusIds = randomNeutralBonusCardIds();
    const profile = {
      ...existing,
      email: (auth.token && auth.token.email) || existing.email || null,
      displayName: (auth.token && auth.token.name) || existing.displayName || "Player",
      unlockedHeroes: [hero],
      unlockedCardIds: bonusIds,
      bullets: existing.bullets || 0,
    };
    tx.set(userRef, profile, { merge: true });
    return profile;
  });
});

/* =========================================================================
   buyHeroUnlock / buyCardUnlock / buyUnlockAll — every Shop purchase.
   Each one re-reads the player's CURRENT server-side bullet balance inside
   the transaction and re-checks the cost itself (never trusts a cost or
   balance the client sends), so there's no window for a race or a replayed
   request to buy something twice or go negative.
   ========================================================================= */
exports.buyHeroUnlock = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const hero = request.data && request.data.hero;
  if (!HEROES.includes(hero)) throw new HttpsError("invalid-argument", "Unknown hero.");

  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "No profile yet.");
    const profile = snap.data();
    if (isHeroUnlocked(hero, profile)) throw new HttpsError("already-exists", "Already unlocked.");
    const bullets = profile.bullets || 0;
    if (bullets < HERO_UNLOCK_COST) throw new HttpsError("failed-precondition", "Not enough Bullets.");

    const bonusIds = randomNeutralBonusCardIds();
    const updated = {
      unlockedHeroes: [...(profile.unlockedHeroes || []), hero],
      unlockedCardIds: [...(profile.unlockedCardIds || []), ...bonusIds],
      bullets: bullets - HERO_UNLOCK_COST,
    };
    tx.set(userRef, updated, { merge: true });
    return { ...profile, ...updated };
  });
});

exports.buyCardUnlock = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const cardId = request.data && request.data.cardId;
  const card = findCard(cardId);
  if (!card) throw new HttpsError("invalid-argument", "Unknown card.");

  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "No profile yet.");
    const profile = snap.data();
    if (isCardUnlocked(card, profile)) throw new HttpsError("already-exists", "Already unlocked.");
    const cost = CARD_UNLOCK_COST[card.rarity] || 0;
    const bullets = profile.bullets || 0;
    if (bullets < cost) throw new HttpsError("failed-precondition", "Not enough Bullets.");

    const updated = {
      unlockedCardIds: [...(profile.unlockedCardIds || []), card.id],
      bullets: bullets - cost,
    };
    tx.set(userRef, updated, { merge: true });
    return { ...profile, ...updated };
  });
});

exports.buyUnlockAll = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpsError("failed-precondition", "No profile yet.");
    const profile = snap.data();
    if (profile.unlockedAll) throw new HttpsError("already-exists", "Already unlocked.");
    const bullets = profile.bullets || 0;
    if (bullets < UNLOCK_ALL_COST) throw new HttpsError("failed-precondition", "Not enough Bullets.");

    const updated = { unlockedAll: true, bullets: bullets - UNLOCK_ALL_COST };
    tx.set(userRef, updated, { merge: true });
    return { ...profile, ...updated };
  });
});

/* =========================================================================
   adminGrantBullets — replaces the client-side admin panel's direct write.
   The gate is request.auth.token.email, which comes from the verified
   Firebase Auth token Google issued, not anything the client claims about
   itself - the same real boundary the old firestore.rules clause used, now
   enforced here instead (and it still needs the SAME email added to
   ADMIN_EMAILS near the top of this file).
   ========================================================================= */
exports.adminGrantBullets = onCall({ enforceAppCheck: true }, async (request) => {
  requireAuth(request);
  const callerEmail = request.auth.token && request.auth.token.email;
  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
    throw new HttpsError("permission-denied", "Not an admin.");
  }
  const targetUid = request.data && request.data.targetUid;
  const amount = Number(request.data && request.data.amount);
  if (!targetUid || typeof targetUid !== "string") throw new HttpsError("invalid-argument", "targetUid is required.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    throw new HttpsError("invalid-argument", "amount must be a positive number (max 100000 per grant).");
  }

  const userRef = db.collection("users").doc(targetUid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const existing = snap.exists ? snap.data() : {};
    const bullets = (existing.bullets || 0) + amount;
    tx.set(userRef, { bullets }, { merge: true });
    return { targetUid, bullets };
  });
});

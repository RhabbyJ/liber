import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const required = [
  "PROOF_SUPABASE_URL",
  "PROOF_SUPABASE_KEY",
  "PROOF_ACCESS_TOKEN_A",
  "PROOF_ACCESS_TOKEN_B",
  "PROOF_TOPIC",
  "PROOF_EVENT",
  "PROOF_READY_FILE",
  "PROOF_RESULT_FILE",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}.`);
}

const url = process.env.PROOF_SUPABASE_URL;
const key = process.env.PROOF_SUPABASE_KEY;
const topic = process.env.PROOF_TOPIC;
const event = process.env.PROOF_EVENT;
const readyFile = process.env.PROOF_READY_FILE;
const resultFile = process.env.PROOF_RESULT_FILE;
const expectedDeliveriesPerClient = Number(
  process.env.PROOF_EXPECTED_DELIVERIES_PER_CLIENT ?? "1",
);
const timeoutMs = Number(process.env.PROOF_TIMEOUT_MS ?? "20000");
const events = { participantA: [], participantB: [] };
let lastDeliveryAt = 0;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const topicMatch = /^(conversation|loi):([0-9a-f-]+)$/i.exec(topic);

if (!topicMatch || !uuidPattern.test(topicMatch[2])) {
  throw new Error("PROOF_TOPIC must be a conversation or LOI topic with a UUID identifier.");
}
if ((topicMatch[1] === "conversation" && event !== "message_changed")
  || (topicMatch[1] === "loi" && event !== "loi_changed")) {
  throw new Error("PROOF_EVENT does not match the proof topic type.");
}
if (!Number.isSafeInteger(expectedDeliveriesPerClient) || expectedDeliveriesPerClient < 1) {
  throw new Error("PROOF_EXPECTED_DELIVERIES_PER_CLIENT must be a positive integer.");
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
  throw new Error("PROOF_TIMEOUT_MS must be between 1000 and 120000 milliseconds.");
}

const client = (accessToken) => createClient(url, key, {
  accessToken: async () => accessToken,
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const a = client(process.env.PROOF_ACCESS_TOKEN_A);
const b = client(process.env.PROOF_ACCESS_TOKEN_B);
const anon = createClient(url, key, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

function subscribe(target, channelTopic, participant) {
  return new Promise((resolve) => {
    let settled = false;
    const channel = target.channel(channelTopic, { config: { private: true } });
    if (participant) {
      channel.on("broadcast", { event }, (message) => {
        events[participant].push(message.payload ?? message);
        lastDeliveryAt = Date.now();
      });
    }
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ channel, status: "TIMEOUT" });
      }
    }, 10_000);
    channel.subscribe((status, error) => {
      if (!settled && ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        settled = true;
        clearTimeout(timer);
        resolve({
          channel,
          error: error ? {
            code: typeof error.code === "string" ? error.code : undefined,
            message: typeof error.message === "string" ? error.message : String(error),
          } : undefined,
          status,
        });
      }
    });
  });
}

function waitForEvents() {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const expectedCountsReached = Object.values(events).every((deliveries) => (
        deliveries.length >= expectedDeliveriesPerClient
      ));
      const quiescent = lastDeliveryAt > 0 && Date.now() - lastDeliveryAt >= 750;
      if ((expectedCountsReached && quiescent) || Date.now() >= deadline) return resolve();
      setTimeout(poll, 50);
    };
    poll();
  });
}

function hasExactKeys(value, expected) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function isIdentifierOnlyPayload(payload) {
  const topicId = topicMatch[2];
  if (event === "message_changed") {
    return hasExactKeys(payload, ["conversationId", "id", "messageId", "type"])
      && payload.conversationId === topicId
      && uuidPattern.test(payload.id)
      && uuidPattern.test(payload.messageId)
      && ["message_created", "message_moderated"].includes(payload.type);
  }
  if (event === "loi_changed") {
    return hasExactKeys(payload, ["eventId", "id", "negotiationId", "revisionId", "type"])
      && payload.negotiationId === topicId
      && uuidPattern.test(payload.id)
      && uuidPattern.test(payload.eventId)
      && (payload.revisionId === null || uuidPattern.test(payload.revisionId))
      && typeof payload.type === "string"
      && /^[A-Z][A-Z_]*$/.test(payload.type);
  }
  return false;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

function isAuthorizationDenied(result) {
  const reason = `${result.error?.code ?? ""} ${result.error?.message ?? ""}`;
  return result.status === "CHANNEL_ERROR" && /unauthori[sz]ed/i.test(reason);
}

function normalizedDeliveries(deliveries) {
  return deliveries.map((delivery) => JSON.stringify(Object.fromEntries(
    Object.keys(delivery).sort().map((key) => [key, delivery[key]]),
  ))).sort();
}

try {
  const [identityA, identityB] = await Promise.all([
    a.auth.getUser(process.env.PROOF_ACCESS_TOKEN_A),
    b.auth.getUser(process.env.PROOF_ACCESS_TOKEN_B),
  ]);
  const subjectA = identityA.data.user?.id;
  const subjectB = identityB.data.user?.id;
  if (identityA.error || identityB.error || !subjectA || !subjectB || subjectA === subjectB) {
    throw new Error("Proof tokens must resolve to two distinct authenticated users.");
  }
  await Promise.all([
    a.realtime.setAuth(process.env.PROOF_ACCESS_TOKEN_A),
    b.realtime.setAuth(process.env.PROOF_ACCESS_TOKEN_B),
  ]);
  const [positiveA, positiveB, deniedParticipant, deniedAnon] = await Promise.all([
    subscribe(a, topic, "participantA"),
    subscribe(b, topic, "participantB"),
    subscribe(a, `${topicMatch[1]}:11111111-1111-4111-8111-111111111111`),
    subscribe(anon, topic),
  ]);
  const statuses = {
    participantA: positiveA.status,
    participantB: positiveB.status,
    unrelatedTopic: deniedParticipant.status,
    anonymous: deniedAnon.status,
  };
  const errors = {
    participantA: positiveA.error,
    participantB: positiveB.error,
    unrelatedTopic: deniedParticipant.error,
    anonymous: deniedAnon.error,
  };
  const ready = positiveA.status === "SUBSCRIBED"
    && positiveB.status === "SUBSCRIBED"
    && isAuthorizationDenied(deniedParticipant)
    && isAuthorizationDenied(deniedAnon);
  writeJson(readyFile, { errors, ready, statuses });
  if (!ready) throw new Error("Realtime authorization preflight failed.");
  await waitForEvents();
  const exactCounts = Object.values(events).every((deliveries) => (
    deliveries.length === expectedDeliveriesPerClient
  ));
  const identifierOnly = Object.values(events).every((deliveries) => (
    deliveries.every(isIdentifierOnlyPayload)
  ));
  const sameDeliveries = JSON.stringify(normalizedDeliveries(events.participantA))
    === JSON.stringify(normalizedDeliveries(events.participantB));
  writeJson(resultFile, {
    deliveries: events,
    identifierOnly,
    ok: exactCounts && identifierOnly && sameDeliveries,
    errors,
    sameDeliveries,
    statuses,
    subjectsDistinct: true,
  });
} catch (error) {
  process.exitCode = 1;
  writeJson(resultFile, {
    error: error instanceof Error ? error.message : "Realtime proof failed.",
    ok: false,
  });
} finally {
  await Promise.allSettled([a.removeAllChannels(), b.removeAllChannels(), anon.removeAllChannels()]);
}

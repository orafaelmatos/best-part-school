import { sessionStorage, type SessionTokens } from "@/lib/session-storage";

let tokens: SessionTokens | null = null;
let generation = 0;
let hydrated = false;
let hydration: Promise<void> | undefined;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<(session: SessionTokens | null) => void>();

export class SessionStorageError extends Error {
  constructor() {
    super("Não foi possível salvar sua sessão neste aparelho. Tente novamente.");
    this.name = "SessionStorageError";
  }
}

function publish() {
  listeners.forEach((listener) => listener(tokens));
}

function enqueue(operation: () => Promise<void>) {
  const pending = writes.then(operation, operation);
  writes = pending.catch(() => undefined);
  return pending;
}

export function getSession() { return tokens; }
export function getSessionGeneration() { return generation; }

export function subscribeSession(listener: (session: SessionTokens | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function hydrateSession() {
  if (hydrated) return;
  if (!hydration) {
    const startedAt = generation;
    hydration = sessionStorage.read().then((stored) => {
      if (startedAt === generation) {
        tokens = stored;
        hydrated = true;
        publish();
      }
    }).finally(() => { hydration = undefined; });
  }
  await hydration;
}

/** Generation checks prevent a late refresh from restoring a logged-out account. */
export async function saveSession(next: SessionTokens, expectedGeneration?: number) {
  if (expectedGeneration !== undefined && generation !== expectedGeneration) return false;
  const startedAt = expectedGeneration ?? ++generation;
  try {
    await enqueue(() => sessionStorage.write(next));
  } catch {
    if (generation === startedAt) await clearSession().catch(() => undefined);
    throw new SessionStorageError();
  }
  if (generation !== startedAt) return false;
  tokens = next;
  hydrated = true;
  publish();
  return true;
}

export async function clearSession() {
  ++generation;
  tokens = null;
  hydrated = true;
  publish();
  await enqueue(() => sessionStorage.clear());
}

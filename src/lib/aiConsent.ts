type ConsentRequester = () => Promise<boolean>;
let requester: ConsentRequester | undefined;
let pending: Promise<boolean> | undefined;

export function registerAIConsentRequester(callback: ConsentRequester) {
  requester = callback;
  return () => { if (requester === callback) requester = undefined; };
}

export function requestAIConsent(): Promise<boolean> {
  if (!requester) return Promise.resolve(false);
  pending ??= requester().finally(() => { pending = undefined; });
  return pending;
}

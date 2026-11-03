import { Capacitor } from '@capacitor/core';

/**
 * Same Sentry project as AppDelegate.swift. The public DSN is not a secret.
 * Reports are the error name and message only: no account, email, IP, or project JSON.
 * Native crashes still go through sentry-cocoa with sendDefaultPii off.
 */
const ENVELOPE_URL = 'https://o4512189585227776.ingest.us.sentry.io/api/4512189597024256/envelope/';
const SENTRY_KEY = 'c83f4de83a239f3305591f36023ed75a';
const MAX_SENT = 8;

export interface JsErrorInfo {
  type: string;
  message: string;
}

export function describeJsError(error: unknown): JsErrorInfo {
  if (error instanceof Error) {
    return { type: error.name || 'Error', message: error.message.slice(0, 500) };
  }
  return { type: 'Error', message: String(error).slice(0, 500) };
}

/** Sentry envelope. No user, request, or extra fields. */
export function jsErrorEnvelope(error: unknown, environment: string, now = Date.now()): string {
  const id = crypto.randomUUID().replace(/-/g, '');
  const info = describeJsError(error);
  const header = { event_id: id, sent_at: new Date(now).toISOString(), sdk: { name: 'workbench.js', version: '1' } };
  const event = {
    event_id: id,
    timestamp: now / 1000,
    platform: 'javascript',
    level: 'error',
    environment,
    exception: { values: [{ type: info.type, value: info.message }] },
  };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
}

let sent = 0;

export function reportJsError(error: unknown, fetchImpl: typeof fetch = fetch): void {
  if (Capacitor.getPlatform() !== 'ios') return;
  if (sent >= MAX_SENT) return;
  sent += 1;
  const body = jsErrorEnvelope(error, import.meta.env.PROD ? 'production' : 'debug');
  void fetchImpl(`${ENVELOPE_URL}?sentry_key=${SENTRY_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function installJsErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    reportJsError(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportJsError(event.reason);
  });
}

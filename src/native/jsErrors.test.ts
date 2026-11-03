import { describe, expect, it, vi } from 'vitest';
import { describeJsError, jsErrorEnvelope, reportJsError } from './jsErrors';

describe('JS error reports', () => {
  it('sends the error name and message only', () => {
    const body = jsErrorEnvelope(new Error('scene blew up'), 'production', 1_700_000_000_000);
    expect(body).toContain('scene blew up');
    const event = JSON.parse(body.split('\n')[2]) as { user?: unknown; request?: unknown; exception: { values: { type: string; value: string }[] } };
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.exception.values[0]).toEqual({ type: 'Error', value: 'scene blew up' });
    expect(describeJsError(new Error('x'.repeat(800))).message).toHaveLength(500);
  });

  it('does not call Sentry off iOS', () => {
    const fetchImpl = vi.fn();
    reportJsError(new Error('nope'), fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

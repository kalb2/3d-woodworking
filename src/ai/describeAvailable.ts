import { useEffect, useState } from 'react';
import { DESCRIBE_CLOUD_ENABLED } from '../config/features';
import { aiMockEnabled } from './client';

/** Describe it can run here: on-device Apple Intelligence, or a dev mock. */
export function useDescribeAvailable(): boolean {
  const [available, setAvailable] = useState(() => aiMockEnabled() || DESCRIBE_CLOUD_ENABLED);
  useEffect(() => {
    if (aiMockEnabled() || DESCRIBE_CLOUD_ENABLED) {
      setAvailable(true);
      return;
    }
    let cancel = false;
    void import('../native/onDeviceAi').then(({ onDeviceBridge }) => {
      const bridge = onDeviceBridge();
      if (!bridge) {
        if (!cancel) setAvailable(false);
        return;
      }
      return bridge.status()
        .then((status) => { if (!cancel) setAvailable(Boolean(status.available)); })
        .catch(() => { if (!cancel) setAvailable(false); });
    }).catch(() => { if (!cancel) setAvailable(false); });
    return () => { cancel = true; };
  }, []);
  return available;
}

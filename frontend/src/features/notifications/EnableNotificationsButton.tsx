import { useState } from 'react';
import { Banner, Button } from '../../design/components';
import { t } from '../../i18n/es';
import { notificationPermission, pushSupport, subscribeToPush } from './push';

/** Re-enable push on this device from the vehicle edit screen (US2-6). */
export function EnableNotificationsButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'enabled' | 'blocked' | 'install'>(() => {
    if (pushSupport() === 'needs-install') return 'install';
    if (notificationPermission() === 'denied') return 'blocked';
    return 'idle';
  });
  if (pushSupport() === 'unsupported') return null;
  if (notificationPermission() === 'granted' && state !== 'enabled') return null;

  if (state === 'enabled') return <Banner tone="success">{t.notifications.enabled}</Banner>;
  if (state === 'blocked') return <Banner tone="info">{t.notifications.blocked}</Banner>;
  if (state === 'install') return <Banner tone="info">{t.notifications.installBody}</Banner>;
  return (
    <Button
      variant="secondary"
      block
      loading={state === 'busy'}
      onClick={() => {
        setState('busy');
        void subscribeToPush()
          .catch(() => 'unsupported' as const)
          .then((result) => {
            setState(result === 'subscribed' ? 'enabled' : result === 'needs-install' ? 'install' : 'blocked');
          });
      }}
    >
      {t.notifications.enableOnDevice}
    </Button>
  );
}

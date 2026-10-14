'use client';

import { Button } from '@hudhud/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { notifyCookieChange } from '@/lib/client-cookies';

export function LogoutButton() {
  const t = useTranslations('nav');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/bff/auth/logout', { method: 'POST' }).catch(() => undefined);
        notifyCookieChange();
        router.replace('/');
        router.refresh();
      }}
    >
      {t('logout')}
    </Button>
  );
}

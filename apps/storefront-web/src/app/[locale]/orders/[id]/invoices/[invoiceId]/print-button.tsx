'use client';

import { Button } from '@hudhud/ui';

export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      {label}
    </Button>
  );
}

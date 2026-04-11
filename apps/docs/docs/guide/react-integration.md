# React Integration

::: warning Personal project in development

**StreaKit** is a personal project in active development. `@streakit/react` integration patterns may change.

:::

If you want hooks and UI helpers, add `@streakit/react`.

## Install

```bash
pnpm add @streakit/core @streakit/react
```

## Provider setup

```tsx
import { StreakProvider } from '@streakit/react';
import { LocalStorageAdapter } from '@streakit/core/adapters';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <StreakProvider
      storage={new LocalStorageAdapter({ prefix: 'web:' })}
      streaks={[
        {
          id: 'daily-checkin',
          userId: 'user-123',
          frequency: 'daily',
          milestones: [3, 7, 14]
        }
      ]}
    >
      {children}
    </StreakProvider>
  );
}
```

## Hook usage

```tsx
import { useStreak } from '@streakit/react';

export function CheckInButton() {
  const { record, status } = useStreak('daily-checkin');

  return (
    <button onClick={() => void record({ source: 'react-ui' })}>
      Check in ({status?.count ?? 0})
    </button>
  );
}
```

Use this route for product-facing UIs, then keep detailed API docs in this portal.

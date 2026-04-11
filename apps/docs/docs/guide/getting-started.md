# Getting Started

::: warning Personal project in development

**StreaKit** is a personal project in active development—not a production guarantee. APIs and packages may change.

:::

## 1. Install packages

```bash
pnpm add @streakit/core
```

If you are working inside this repository, `@streakit/core` is already available as a workspace package in `packages/core`.

## 2. Initialize the engine

```ts
import { StreaKit } from '@streakit/core';
import { LocalStorageAdapter } from '@streakit/core/adapters';

const engine = new StreaKit({
  storage: new LocalStorageAdapter({ prefix: 'my-app:' }),
  defaultTimezone: 'America/Los_Angeles',
  atRiskThresholdHours: 8
});
```

## 3. Create a streak

```ts
const streak = await engine.createStreak({
  id: 'daily-checkin',
  userId: 'user-123',
  frequency: 'daily',
  milestones: [3, 7, 14],
  targetCount: 14,
  tags: ['onboarding']
});
```

## 4. Record activity and read status

```ts
await streak.record({ source: 'checkin-button' });
const status = await streak.status();

console.log(status.count); // streak length
console.log(status.nextMilestone); // next threshold
```

## Next steps

- Move to [React Integration](/guide/react-integration)
- Review [Core API](/reference/core-api)
- Run the local [Playground](/playground)

# Core API

## `StreaKit`

- `new StreaKit(config)`
- `createStreak(options)`
- `getStreak(id)`
- `listStreaks(filter?)`
- `deleteStreak(id)`
- `getStats(id)`
- `getActivityCalendar(id, opts?)`
- `registerRewardHandler(type, handler)`
- `on(event, listener)`

## `StreakInstance`

- `record(metadata?)`
- `status()`
- `freeze(opts?)`
- `unfreeze()`
- `reset()`
- `getMilestones()`
- `getStats()`
- `getActivityCalendar(opts?)`

## Adapters

- `MemoryAdapter` from `@streakit/core/adapters`
- `LocalStorageAdapter` from `@streakit/core/adapters`
- `AsyncStorageAdapter` from `@streakit/core/adapters`

## Common options

- `frequency`: `'daily' | 'weekly' | { everyNDays: number } | { timesPerWeek: number }`
- `milestones`: numeric thresholds or milestone config objects
- `targetCount`: target length for progress UX
- `tags`, `metadata`, `decay`, `scoring`, and freeze policy settings

For a complete integration flow, see [Getting Started](/guide/getting-started).

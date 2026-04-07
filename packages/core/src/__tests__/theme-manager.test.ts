import { describe, it, expect } from 'vitest';
import { ThemeManager } from '../index.js';
import { MemoryAdapter } from '../adapters/index.js';
import type { AnimationCollection } from '../index.js';

const collection: AnimationCollection = {
  id: 'test-collection',
  name: 'Test',
  category: 'nature',
  description: 'Test collection',
  format: 'rive',
  stages: [
    { id: 'seed', name: 'Seed', minStreak: 0, description: 'Just planted' },
    { id: 'sprout', name: 'Sprout', minStreak: 7, description: 'Growing' },
    { id: 'bloom', name: 'Bloom', minStreak: 30, description: 'Full bloom' },
  ],
  defaultMilestones: [7, 30],
  assets: { thumbnail: 'thumb.png' },
  preview: 'preview.png',
  tags: ['test'],
  version: '1.0.0',
};

describe('ThemeManager', () => {
  it('resolves correct stage for count', () => {
    expect(ThemeManager.resolveStage(collection, 0)?.id).toBe('seed');
    expect(ThemeManager.resolveStage(collection, 5)?.id).toBe('seed');
    expect(ThemeManager.resolveStage(collection, 7)?.id).toBe('sprout');
    expect(ThemeManager.resolveStage(collection, 15)?.id).toBe('sprout');
    expect(ThemeManager.resolveStage(collection, 30)?.id).toBe('bloom');
    expect(ThemeManager.resolveStage(collection, 100)?.id).toBe('bloom');
  });

  it('detects stage transitions', () => {
    expect(ThemeManager.detectTransition(collection, 5, 7)).not.toBeNull();
    expect(ThemeManager.detectTransition(collection, 5, 7)?.from).toBe('seed');
    expect(ThemeManager.detectTransition(collection, 5, 7)?.to).toBe('sprout');
    expect(ThemeManager.detectTransition(collection, 5, 6)).toBeNull();
  });

  it('computes progress through stages', () => {
    const p = ThemeManager.computeProgress(collection, 14);
    expect(p.stage?.id).toBe('sprout');
    expect(p.nextStage?.id).toBe('bloom');
    expect(p.progress).toBeCloseTo(7 / 23, 1);

    const done = ThemeManager.computeProgress(collection, 50);
    expect(done.stage?.id).toBe('bloom');
    expect(done.nextStage).toBeNull();
    expect(done.progress).toBe(1);
  });

  it('persists and retrieves theme state', async () => {
    const storage = new MemoryAdapter();
    const state = await ThemeManager.persist(storage, 'streak-1', collection, 5, 8);
    expect(state.currentStage).toBe('sprout');
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.from).toBe('seed');
    expect(state.history[0]!.to).toBe('sprout');

    const retrieved = await ThemeManager.getState(storage, 'streak-1', 'test-collection');
    expect(retrieved?.currentStage).toBe('sprout');
  });
});

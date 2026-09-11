import { ActivityEntry } from './activity.models';
import { describeActivity, relativeTime } from './activity-text';

const entry = (action: string, metadata: ActivityEntry['metadata'] = {}): ActivityEntry => ({
  id: 'a1',
  action,
  entityType: 'household',
  entityId: null,
  metadata,
  actor: { id: 'u1', displayName: 'Anna', avatarUrl: null },
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('describeActivity', () => {
  it('renders known actions as sentences', () => {
    expect(describeActivity(entry('household.created', { name: 'Home' })).text).toBe(
      'created the household "Home"',
    );
    expect(describeActivity(entry('household.renamed', { from: 'A', to: 'B' })).text).toBe(
      'renamed "A" to "B"',
    );
    expect(describeActivity(entry('member.joined', { role: 'ADMIN' })).text).toBe(
      'joined the household as admin',
    );
    expect(describeActivity(entry('member.removed', { memberName: 'Bob' })).text).toBe(
      'removed Bob',
    );
    expect(
      describeActivity(entry('member.role_changed', { memberName: 'Bob', to: 'MEMBER' })).text,
    ).toBe('made Bob member');
    expect(describeActivity(entry('invitation.sent', { email: 'x@y.z' })).text).toBe(
      'invited x@y.z',
    );
  });

  it('falls back gracefully for unknown actions and missing metadata', () => {
    expect(describeActivity(entry('shopping.item_added')).text).toBe('shopping item added');
    expect(describeActivity(entry('member.removed')).text).toBe('removed a member');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const at = (offsetSeconds: number) =>
    new Date(now.getTime() - offsetSeconds * 1000).toISOString();

  it('describes recent times relatively', () => {
    expect(relativeTime(at(10), now)).toBe('just now');
    expect(relativeTime(at(5 * 60), now)).toBe('5 min ago');
    expect(relativeTime(at(3 * 3600), now)).toBe('3 h ago');
    expect(relativeTime(at(24 * 3600), now)).toBe('yesterday');
    expect(relativeTime(at(3 * 24 * 3600), now)).toBe('3 days ago');
  });

  it('falls back to a date for older entries', () => {
    expect(relativeTime(at(30 * 24 * 3600), now)).toMatch(/\d/);
  });
});

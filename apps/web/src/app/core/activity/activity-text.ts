import { ActivityEntry } from './activity.models';

const ROLE_WORDS: Record<string, string> = { OWNER: 'owner', ADMIN: 'admin', MEMBER: 'member' };

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export interface ActivityText {
  /** Material icon name. */
  icon: string;
  /** Sentence without the actor, e.g. `renamed the household to "Home"`. */
  text: string;
}

/**
 * Turns a stored activity entry into a sentence fragment. The actor's name is
 * rendered separately by the feed so it can be styled/bolded.
 */
export function describeActivity(entry: ActivityEntry): ActivityText {
  const m = entry.metadata ?? {};
  switch (entry.action) {
    case 'household.created':
      return { icon: 'home', text: `created the household "${str(m['name'], 'Untitled')}"` };
    case 'household.renamed':
      return { icon: 'edit', text: `renamed "${str(m['from'])}" to "${str(m['to'])}"` };
    case 'member.joined':
      return {
        icon: 'person_add',
        text: `joined the household as ${ROLE_WORDS[str(m['role'])] ?? 'member'}`,
      };
    case 'member.left':
      return { icon: 'logout', text: 'left the household' };
    case 'member.removed':
      return { icon: 'person_remove', text: `removed ${str(m['memberName'], 'a member')}` };
    case 'member.role_changed':
      return {
        icon: 'admin_panel_settings',
        text: `made ${str(m['memberName'], 'a member')} ${ROLE_WORDS[str(m['to'])] ?? 'member'}`,
      };
    case 'invitation.sent':
      return { icon: 'mail', text: `invited ${str(m['email'], 'someone')}` };
    default:
      return { icon: 'info', text: entry.action.replace(/[._]/g, ' ') };
  }
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or a short date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((now.getTime() - then) / 1000);
  if (diffSec < 45) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

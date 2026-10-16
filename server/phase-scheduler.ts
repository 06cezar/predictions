import { getSettings, updateSettings } from './services/settings';
import { notifyAllUsersPhaseChange } from './notifications-helper';

export function startPhaseScheduler() {
  setInterval(() => {
    const s = getSettings();
    if (!s || !s.autoAdvancePhase) return;

    const now = new Date();

    if (s.currentPhase === 'submission' && s.submissionDeadline) {
      if (now >= new Date(s.submissionDeadline)) {
        console.log('[Scheduler] Advancing from submission → reveal');
        updateSettings({ currentPhase: 'reveal' });
        notifyAllUsersPhaseChange('reveal');
      }
    } else if (s.currentPhase === 'reveal' && s.revealDeadline) {
      if (now >= new Date(s.revealDeadline)) {
        console.log('[Scheduler] Advancing from reveal → done');
        updateSettings({ currentPhase: 'done' });
        notifyAllUsersPhaseChange('done');
      }
    }
  }, 60_000); // Check every minute
}

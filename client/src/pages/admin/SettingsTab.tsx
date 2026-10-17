import { useState } from 'react';
import { api, Settings } from '../../api';
import { useCopied } from '../../hooks/useCopied';
import { SettingsUpdate, ToggleRow, toLocalInput } from './shared';

type Phase = Settings['currentPhase'];

interface Props {
  settings: Settings;
  /** Save changes (optimistically). */
  onUpdate: SettingsUpdate;
  /** The server already changed these; just reflect them. */
  onChanged: (changes: Partial<Settings>) => void;
}

const PHASE_BUTTONS = [
  { id: 'submission', label: 'Submission', emoji: '✍️', color: 'bg-amber/20 border-amber/40 text-amber' },
  { id: 'reveal',     label: 'Reveal',     emoji: '👁️', color: 'bg-violet/20 border-violet/40 text-[#a99eff]' },
  { id: 'done',       label: 'Done',       emoji: '🏁', color: 'bg-orange/20 border-orange/40 text-orange' },
] as const;

export function SettingsTab({ settings, onUpdate, onChanged }: Props) {
  return (
    <div className="space-y-5">
      <GameSection settings={settings} onUpdate={onUpdate} onChanged={onChanged} />
      <PhaseControl settings={settings} onChanged={onChanged} />

      <div className="card space-y-4">
        <h3 className="font-medium">Deadlines</h3>
        {([
          ['submissionDeadline', 'Submission Deadline'],
          ['revealDeadline', 'Reveal Deadline'],
        ] as const).map(([key, label]) => (
          <div key={key}>
            <label className="block text-sm text-white/60 mb-2">{label}</label>
            <input
              type="datetime-local"
              value={toLocalInput(settings[key])}
              onChange={e => onUpdate({ [key]: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="input"
            />
          </div>
        ))}
      </div>

      <div className="card space-y-4">
        <h3 className="font-medium">Settings</h3>
        <div>
          <label className="block text-sm font-medium mb-0.5">
            Rating Threshold: <span className="text-orange font-semibold">{settings.ratingThreshold}%</span>
          </label>
          <p className="text-xs text-white/40 mb-2">Predictions rated above this are considered "likely" - lower ratings score more points</p>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.ratingThreshold}
            onChange={e => onUpdate({ ratingThreshold: parseInt(e.target.value) })}
            className="w-full accent-orange"
          />
        </div>
        <ToggleRow
          title="Auto-advance Phase"
          description="Automatically advance when deadline passes"
          on={settings.autoAdvancePhase}
          onClick={() => onUpdate({ autoAdvancePhase: !settings.autoAdvancePhase })}
        />
        <ToggleRow
          title="Admin Override"
          description="Allow submissions after deadline"
          on={settings.adminOverride}
          onClick={() => onUpdate({ adminOverride: !settings.adminOverride })}
        />
        <ToggleRow
          title="Anonymous Predictions"
          description={settings.anonymousPredictions
            ? 'Hide who wrote each prediction across all phases'
            : 'Author names are visible across all phases'}
          on={settings.anonymousPredictions}
          onClick={() => onUpdate({ anonymousPredictions: !settings.anonymousPredictions })}
          color="bg-violet"
        />
      </div>

      <DangerZone />

      <div className="card space-y-3">
        <h3 className="font-medium">Export Data</h3>
        <p className="text-xs text-white/40">Download this game's data.</p>
        <div className="flex gap-2">
          <a href="/api/admin/export/predictions.csv" download className="btn-secondary flex-1 text-center text-sm py-2">
            📋 Predictions
          </a>
          <a href="/api/admin/export/scores.csv" download className="btn-secondary flex-1 text-center text-sm py-2">
            🏆 Scores
          </a>
          <a href="/api/admin/export/hof.csv" download className="btn-secondary flex-1 text-center text-sm py-2">
            ✨ Hall of Fame
          </a>
        </div>
        <a href="/api/admin/export/game.json" download className="btn-secondary w-full text-center text-sm py-2 block">
          🗄️ Whole game (.json)
        </a>
      </div>
    </div>
  );
}

function GameSection({ settings, onUpdate, onChanged }: Props) {
  const [name, setName] = useState(settings.name);
  const [regenerateConfirm, setRegenerateConfirm] = useState(false);
  const { copied, copy } = useCopied();
  const joinLink = `${window.location.origin}/game/${settings.joinCode}`;

  const saveName = () => {
    if (name.trim() && name.trim() !== settings.name) onUpdate({ name: name.trim() });
  };

  const regenerate = async () => {
    if (!regenerateConfirm) { setRegenerateConfirm(true); return; }
    try {
      const { joinCode } = await api.admin.regenerateJoinCode();
      onChanged({ joinCode });
    } catch (err: any) { alert(err.message); }
    setRegenerateConfirm(false);
  };

  return (
    <div className="card space-y-4">
      <h3 className="font-medium">Game</h3>
      <div>
        <label className="block text-sm text-white/60 mb-2">Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => e.key === 'Enter' && saveName()}
          maxLength={40}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm text-white/60 mb-2">Join code</label>
        <div className="flex gap-2">
          <code className="input flex-1 min-w-0 font-mono tracking-[0.3em] text-amber">{settings.joinCode}</code>
          <button onClick={() => copy(joinLink, 'link')} className="btn-secondary text-sm px-3 whitespace-nowrap">
            {copied === 'link' ? '✓ Copied' : 'Copy link'}
          </button>
          <button
            onClick={regenerate}
            onBlur={() => setRegenerateConfirm(false)}
            className={`text-sm px-3 rounded-xl whitespace-nowrap transition-colors ${regenerateConfirm ? 'bg-orange text-white' : 'btn-ghost'}`}
          >
            {regenerateConfirm ? 'Confirm?' : 'New code'}
          </button>
        </div>
        <p className="text-xs text-white/30 mt-1.5">A new code stops the old code and link from working.</p>
      </div>
      <ToggleRow
        title="Open joining"
        description={settings.openJoin
          ? 'Anyone with the code can join while the game is in submission'
          : 'Invite-only: add players yourself or send one-use invite links'}
        on={settings.openJoin}
        onClick={() => onUpdate({ openJoin: !settings.openJoin })}
      />
    </div>
  );
}

function PhaseControl({ settings, onChanged }: Pick<Props, 'settings' | 'onChanged'>) {
  const [confirming, setConfirming] = useState<Phase | null>(null);
  const [bonusDoneWarning, setBonusDoneWarning] = useState(false);

  const setPhase = async (phase: Phase) => {
    try {
      const result = await api.admin.setPhase(phase) as { newPhase: Phase };
      onChanged({ currentPhase: result.newPhase });
      setConfirming(null);
    } catch (err: any) { alert(err.message); }
  };

  const choose = (phase: Phase) => {
    if (settings.currentPhase === phase) return;
    if (phase === 'done' && !settings.bonusActive && !bonusDoneWarning) {
      setBonusDoneWarning(true);
      setConfirming(null);
      return;
    }
    setBonusDoneWarning(false);
    if (confirming !== phase) { setConfirming(phase); return; }
    setPhase(phase);
  };

  return (
    <div className="card space-y-4">
      <h3 className="font-medium">Phase Control</h3>
      <div className="grid grid-cols-3 gap-3">
        {PHASE_BUTTONS.map(({ id, label, emoji, color }) => {
          const isActive = settings.currentPhase === id;
          const isConfirming = confirming === id;
          return (
            <button
              key={id}
              onClick={() => choose(id)}
              onBlur={() => setConfirming(null)}
              disabled={isActive}
              className={`relative flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all font-medium text-sm
                ${isActive
                  ? `${color} scale-105 shadow-lg cursor-default`
                  : isConfirming
                    ? 'bg-white/20 border-white/40 text-white animate-pulse'
                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/20'
                }`}
            >
              <span className="text-2xl">{emoji}</span>
              <span>{isConfirming ? 'Confirm?' : label}</span>
              {isActive && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-navy text-xs font-bold">✓</span>
              )}
            </button>
          );
        })}
      </div>
      {bonusDoneWarning && (
        <div className="bg-amber/10 border border-amber/30 rounded-xl px-4 py-3 space-y-2">
          <p className="text-sm text-amber font-medium">🎖️ Skip Bonus Round?</p>
          <p className="text-xs text-white/50">Bonus round is not active. Do you want to go to Done without it?</p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setBonusDoneWarning(false); setPhase('done'); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange/20 text-orange hover:bg-orange/30 transition-colors"
            >
              Skip bonus → Done
            </button>
            <button
              onClick={() => setBonusDoneWarning(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-white/30 text-center">Click a phase to switch · click again to confirm</p>
    </div>
  );
}

function DangerZone() {
  const [confirm, setConfirm] = useState(false);

  const reset = async () => {
    if (!confirm) { setConfirm(true); return; }
    try {
      await api.admin.resetGame();
      window.location.reload();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="card border border-red-500/20 space-y-3">
      <h3 className="font-medium text-red-400">Danger Zone</h3>
      <p className="text-xs text-white/40">Reset the game - all predictions, ratings and outcomes will be deleted. Users are kept. Phase resets to submission.</p>
      <button
        onClick={reset}
        onBlur={() => setConfirm(false)}
        className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all ${
          confirm ? 'bg-red-500 text-white animate-pulse' : 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
        }`}
      >
        {confirm ? '⚠️ Click again to confirm reset' : '🗑️ Reset Game'}
      </button>
    </div>
  );
}

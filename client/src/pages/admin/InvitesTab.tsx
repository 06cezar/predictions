import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useCopied } from '../../hooks/useCopied';
import { parseServerTime } from '../../time';

type InviteLink = Awaited<ReturnType<typeof api.invite.list>>[number];

const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;

export function InvitesTab() {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const { copied, copy } = useCopied();

  useEffect(() => {
    api.invite.list().then(setLinks).catch(() => {});
  }, []);

  const handleCreate = async () => {
    try {
      const link = await api.invite.create() as InviteLink;
      setLinks(prev => [link, ...prev]);
    } catch (err: any) { alert(err.message); }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this invite link?')) return;
    try {
      await api.invite.revoke(id);
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Invite Links</h3>
            <p className="text-xs text-white/40 mt-0.5">One-use links for new users to join, even when open joining is off</p>
          </div>
          <button onClick={handleCreate} className="btn-primary text-sm">
            + Generate Link
          </button>
        </div>
      </div>

      {links.length === 0 ? (
        <div className="card text-center py-8 text-white/30">No invite links yet. Generate one above.</div>
      ) : (
        <div className="space-y-2">
          {links.map(link => {
            const isUsed = !!link.usedBy;
            return (
              <div key={link.id} className={`card space-y-2 ${isUsed ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isUsed ? (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">✓ Used</span>
                      ) : (
                        <span className="text-xs bg-amber/20 text-amber px-2 py-0.5 rounded-full">Active</span>
                      )}
                      <span className="text-xs text-white/30">
                        {parseServerTime(link.createdAt).toLocaleString(undefined, { hour12: false, dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p className="text-sm font-mono text-white/60 truncate">{inviteUrl(link.code)}</p>
                    {isUsed && link.usedByName && (
                      <p className="text-xs text-white/40 mt-1">Registered: <span className="text-white/60">{link.usedByName}</span></p>
                    )}
                  </div>
                  {!isUsed && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => copy(inviteUrl(link.code), link.code)} className="btn-ghost text-xs px-3 py-1">
                        {copied === link.code ? '✓ Copied' : 'Copy Link'}
                      </button>
                      <button
                        onClick={() => handleRevoke(link.id)}
                        className="text-orange/60 hover:text-orange text-xs px-3 py-1 rounded-lg hover:bg-orange/10 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

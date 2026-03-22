import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { antiBrowserApi, type TeamRole } from '../api';
import { useAntiBrowserStore } from '../store';
import {
  DIALOG_CLASS,
  EmptyState,
  FIELD_CLASS,
  GLASS_CARD_CLASS,
  INFO_TILE_CLASS,
  LoadingState,
  MetricPill,
  PAGE_WRAP_CLASS,
  PageHeader,
  SELECT_CLASS,
  formatDateTime,
} from './common';

const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  operator: 'Operator',
};

const ROLE_TONES: Record<TeamRole, string> = {
  admin: 'border-rose-400/25 bg-rose-400/10 text-rose-700 dark:text-rose-300',
  manager: 'border-amber-400/25 bg-amber-400/10 text-amber-700 dark:text-amber-300',
  operator: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300',
};

export default function TeamPage() {
  const members = useAntiBrowserStore((state) => state.team);
  const loading = useAntiBrowserStore((state) => state.loadingTeam);
  const fetchTeam = useAntiBrowserStore((state) => state.fetchTeam);
  const fetchStats = useAntiBrowserStore((state) => state.fetchStats);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('operator');

  const refresh = useCallback(() => {
    void fetchTeam();
    void fetchStats();
  }, [fetchTeam, fetchStats]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) {
      return members;
    }

    const query = search.toLowerCase();
    return members.filter((member) => {
      return (
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.id.toLowerCase().includes(query)
      );
    });
  }, [members, search]);

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }

    setCreating(true);
    try {
      await antiBrowserApi.addTeamMember({
        name: name.trim(),
        email: email.trim(),
        role,
      });
      setDialogOpen(false);
      setName('');
      setEmail('');
      setRole('operator');
      refresh();
    } catch (error) {
      console.error('Failed to add team member:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (memberId: string, nextRole: TeamRole) => {
    setUpdatingId(memberId);
    try {
      await antiBrowserApi.updateTeamMember(memberId, { role: nextRole });
      refresh();
    } catch (error) {
      console.error('Failed to update member role:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (memberId: string) => {
    setDeletingId(memberId);
    try {
      await antiBrowserApi.removeTeamMember(memberId);
      refresh();
    } catch (error) {
      console.error('Failed to remove team member:', error);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && members.length === 0) {
    return <LoadingState label="Loading team..." />;
  }

  return (
    <div className={PAGE_WRAP_CLASS}>
      <PageHeader
        title="Team"
        description="Manage operator access, keep profile ownership clear, and promote the right people without leaving the native workspace."
        actions={
          <>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search team..."
              className={`${FIELD_CLASS} w-[220px]`}
            />
            <Button
              className="rounded-full bg-black/82 px-4 text-white hover:bg-black/72 dark:bg-white dark:text-black dark:hover:bg-white/90"
              onClick={() => setDialogOpen(true)}
            >
              Add Member
            </Button>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <MetricPill label="Members" value={members.length} />
        <MetricPill
          label="Admins"
          value={members.filter((member) => member.role === 'admin').length}
          tone="danger"
        />
        <MetricPill
          label="Managers"
          value={members.filter((member) => member.role === 'manager').length}
          tone="warning"
        />
      </div>

      {filteredMembers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No team members"
            description="Invite admins, managers, or operators so profile launches, actor runs, and proxy upkeep can be shared safely."
            action={
              <Button
                className="rounded-full bg-black/82 px-4 text-white hover:bg-black/72 dark:bg-white dark:text-black dark:hover:bg-white/90"
                onClick={() => setDialogOpen(true)}
              >
                Add First Member
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filteredMembers.map((member, index) => (
            <div key={member.id} className={`${GLASS_CARD_CLASS} overflow-hidden p-0`}>
              <div className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-500 to-indigo-600 text-[18px] font-semibold text-white shadow-lg shadow-sky-500/20">
                    {member.name.charAt(0).toUpperCase() || String(index + 1)}
                  </div>
                  <div>
                    <div className="text-[18px] font-semibold tracking-[-0.03em] text-black dark:text-white">
                      {member.name}
                    </div>
                    <div className="mt-1 text-[14px] text-black/52 dark:text-white/48">
                      {member.email || 'No email provided'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${ROLE_TONES[member.role]}`}
                  >
                    {ROLE_LABELS[member.role]}
                  </div>
                  <Button
                    variant="ghost"
                    className="rounded-full text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                    disabled={deletingId === member.id}
                    onClick={() => void handleDelete(member.id)}
                  >
                    {deletingId === member.id ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              </div>

              <div className="border-t border-black/[0.06] px-5 py-4 dark:border-white/8">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_240px]">
                  <div className={INFO_TILE_CLASS}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                      Member ID
                    </div>
                    <div className="mt-2 font-mono text-[13px] text-black/72 dark:text-white/72">
                      {member.id}
                    </div>
                  </div>
                  <div className={INFO_TILE_CLASS}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                      Added
                    </div>
                    <div className="mt-2 text-[13px] text-black/72 dark:text-white/72">
                      {formatDateTime(member.created_at)}
                    </div>
                  </div>
                  <div className={INFO_TILE_CLASS}>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-black/36 dark:text-white/34">
                      Access level
                    </div>
                    <select
                      className={`${SELECT_CLASS} mt-2`}
                      value={member.role}
                      disabled={updatingId === member.id}
                      onChange={(event) => void handleRoleChange(member.id, event.target.value as TeamRole)}
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="operator">Operator</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${DIALOG_CLASS} sm:max-w-md`}>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>Invite someone to help manage profiles, actors, and proxies.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Name</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
                placeholder="Taylor"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD_CLASS}
                placeholder="taylor@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-black/46 dark:text-white/46">Role</label>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as TeamRole)}
                className={SELECT_CLASS}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="operator">Operator</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full border-white/45 bg-white/72 dark:bg-white/[0.06]"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full bg-black/82 text-white hover:bg-black/72 dark:bg-white dark:text-black dark:hover:bg-white/90"
              disabled={creating || !name.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

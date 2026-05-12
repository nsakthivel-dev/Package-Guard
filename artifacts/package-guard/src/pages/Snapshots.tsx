import { useState } from "react";
import { Camera, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  useListSnapshots,
  useCreateSnapshot,
  useDeleteSnapshot,
  useRestoreSnapshot,
  useListEnvironments,
  getListSnapshotsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";

export default function Snapshots() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: snapshots, isLoading } = useListSnapshots();
  const { data: envs } = useListEnvironments();
  const createSnapshot = useCreateSnapshot();
  const deleteSnapshot = useDeleteSnapshot();
  const restoreSnapshot = useRestoreSnapshot();

  const [showCreate, setShowCreate] = useState(false);
  const [envId, setEnvId] = useState<string>("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const handleCreate = () => {
    if (!envId || !name.trim()) return;
    createSnapshot.mutate(
      { data: { environmentId: Number(envId), name, notes: notes || undefined } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
          setShowCreate(false);
          setEnvId(""); setName(""); setNotes("");
          toast({ title: "Snapshot created" });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteSnapshot.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
        toast({ title: "Snapshot deleted" });
      },
    });
  };

  const handleRestore = (id: number) => {
    setRestoringId(id);
    restoreSnapshot.mutate({ id }, {
      onSuccess: (result) => {
        setRestoringId(null);
        toast({ title: result.message });
      },
      onError: () => setRestoringId(null),
    });
  };

  const grouped = snapshots?.reduce((acc, s) => {
    const key = s.environmentName ?? "Unknown";
    (acc[key] ??= []).push(s);
    return acc;
  }, {} as Record<string, typeof snapshots>) ?? {};

  return (
    <div className="p-6 space-y-6" data-testid="snapshots-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Snapshots</h1>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-snapshot">
          <Plus className="w-4 h-4 mr-1.5" />
          Create Snapshot
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 bg-card border border-card-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !snapshots?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Camera className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No snapshots yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a snapshot to save the current state of your packages</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([envName, envSnapshots]) => (
            <div key={envName}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{envName}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {envSnapshots?.map((snap) => (
                  <div key={snap.id} className="bg-card border border-card-border rounded-lg p-4 space-y-3" data-testid={`snapshot-card-${snap.id}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{snap.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(snap.createdAt), "MMM d, yyyy HH:mm")}
                          {" · "}
                          {formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(snap.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 flex-shrink-0"
                        data-testid={`button-delete-snapshot-${snap.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{snap.packageCount} packages</p>
                    {snap.notes && (
                      <p className="text-xs text-muted-foreground italic">{snap.notes}</p>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      disabled={restoringId === snap.id}
                      onClick={() => handleRestore(snap.id)}
                      data-testid={`button-restore-snapshot-${snap.id}`}
                    >
                      <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${restoringId === snap.id ? "animate-spin" : ""}`} />
                      {restoringId === snap.id ? "Restoring..." : "Restore"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select value={envId} onValueChange={setEnvId}>
                <SelectTrigger data-testid="select-snapshot-env">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {envs?.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snap-name">Snapshot Name</Label>
              <Input
                id="snap-name"
                placeholder="Before upgrade v2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-snapshot-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snap-notes">Notes (optional)</Label>
              <Textarea
                id="snap-notes"
                placeholder="Why are you creating this snapshot?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                data-testid="input-snapshot-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSnapshot.isPending} data-testid="button-confirm-snapshot">
              {createSnapshot.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

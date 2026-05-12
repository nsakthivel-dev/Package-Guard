import { useState } from "react";
import { Plus, RefreshCw, Trash2, Server } from "lucide-react";
import {
  useListEnvironments,
  useCreateEnvironment,
  useDeleteEnvironment,
  useScanEnvironment,
  getListEnvironmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ecosystemIcon } from "@/lib/statusColors";
import { formatDistanceToNow } from "date-fns";

export default function Environments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: envs, isLoading } = useListEnvironments();
  const createEnv = useCreateEnvironment();
  const deleteEnv = useDeleteEnvironment();
  const scanEnv = useScanEnvironment();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("pip");
  const [path, setPath] = useState("");
  const [scanningId, setScanningId] = useState<number | null>(null);

  const handleCreate = () => {
    if (!name.trim() || !path.trim()) return;
    createEnv.mutate(
      { data: { name, type: type as "pip" | "venv" | "conda" | "npm" | "nvm", path } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
          setShowCreate(false);
          setName(""); setType("pip"); setPath("");
          toast({ title: "Environment created" });
        },
      }
    );
  };

  const handleDelete = (id: number, envName: string) => {
    deleteEnv.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
        toast({ title: `Deleted "${envName}"` });
      },
    });
  };

  const handleScan = (id: number) => {
    setScanningId(id);
    scanEnv.mutate({ id }, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
        setScanningId(null);
        toast({ title: `Scan complete — ${result.packagesFound} packages found` });
      },
      onError: () => setScanningId(null),
    });
  };

  return (
    <div className="p-6 space-y-6" data-testid="environments-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Environments</h1>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-create-environment">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Environment
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 bg-card border border-card-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !envs?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Server className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No environments yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add a pip or npm environment to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {envs.map((env) => (
            <div key={env.id} className="bg-card border border-card-border rounded-lg p-4 space-y-3" data-testid={`env-card-${env.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ecosystemIcon[env.type] ?? "📦"}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{env.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{env.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(env.id, env.name)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  data-testid={`button-delete-env-${env.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-mono truncate">{env.path}</p>
                <p className="text-xs text-muted-foreground">{env.packageCount} packages</p>
                {env.lastScanned && (
                  <p className="text-xs text-muted-foreground">
                    Scanned {formatDistanceToNow(new Date(env.lastScanned), { addSuffix: true })}
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={scanningId === env.id}
                onClick={() => handleScan(env.id)}
                data-testid={`button-scan-env-${env.id}`}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${scanningId === env.id ? "animate-spin" : ""}`} />
                {scanningId === env.id ? "Scanning..." : "Scan Packages"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Environment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="env-name">Name</Label>
              <Input
                id="env-name"
                placeholder="My Python Env"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-env-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger data-testid="select-env-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pip">pip</SelectItem>
                  <SelectItem value="venv">venv</SelectItem>
                  <SelectItem value="conda">conda</SelectItem>
                  <SelectItem value="npm">npm</SelectItem>
                  <SelectItem value="nvm">nvm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="env-path">Path</Label>
              <Input
                id="env-path"
                placeholder="/home/user/.virtualenvs/myenv"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                data-testid="input-env-path"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createEnv.isPending} data-testid="button-confirm-create-env">
              {createEnv.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

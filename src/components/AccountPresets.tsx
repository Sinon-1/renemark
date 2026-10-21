import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { deletePreset, listPresets, savePreset, type Preset } from "@/lib/presets";
import type { WatermarkSettings } from "@/lib/watermark";

interface Props {
  user: User | null;
  settings: WatermarkSettings;
  markFile: File | null;
  onApply: (p: Preset) => void;
}

export function AccountPresets({ user, settings, markFile, onApply }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    try { setPresets(await listPresets()); } catch (e) { setMsg((e as Error).message); }
  }, []);

  useEffect(() => {
    if (user) refresh(); else setPresets([]);
  }, [user, refresh]);

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">
        Accounts and presets are off. Add your Supabase keys to <code>.env</code> to turn them on.
      </p>
    );
  }

  const auth = async (mode: "in" | "up") => {
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase!.auth.signInWithPassword({ email, password })
        : await supabase!.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Account created. Check your email if confirmation is required.");
  };

  if (!user) {
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); auth("in"); }}>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Log in</Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => auth("up")}>Sign up</Button>
        </div>
        {msg && <p className="text-sm text-muted-foreground" role="status">{msg}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-muted-foreground">{user.email}</span>
        <Button variant="ghost" size="sm" onClick={() => supabase!.auth.signOut()}>Log out</Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await savePreset(user.id, name.trim(), settings, markFile);
            setName(""); setMsg("Preset saved."); refresh();
          } catch (err) { setMsg((err as Error).message); }
        }}
      >
        <Input aria-label="Preset name" placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit">Save</Button>
      </form>

      {presets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No presets yet. Set up a watermark, name it and save.</p>
      ) : (
        <ul className="space-y-1">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="flex-1 justify-start" onClick={() => onApply(p)}>{p.name}</Button>
              <Button
                variant="ghost" size="icon" className="h-9 w-9" aria-label={`Delete ${p.name}`}
                onClick={async () => { try { await deletePreset(p); refresh(); } catch (err) { setMsg((err as Error).message); } }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-sm text-muted-foreground" role="status">{msg}</p>}
    </div>
  );
}

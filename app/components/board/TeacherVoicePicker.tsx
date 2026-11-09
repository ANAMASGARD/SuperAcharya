import { Check, Search, AudioLines, Play, Square, Heart } from "lucide-react";
import "./teacher-voices.css";
import { useEffect, useRef, useState } from "react";
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { teacherVoices } from "@shared/teacher-voices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function TeacherVoicePicker({ boardId, open, onOpenChange, onAsk }: {
  boardId: string; open: boolean; onOpenChange: (open: boolean) => void; onAsk: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="teacher-voice-dialog">
    <DialogHeader><DialogTitle>Choose teacher voice</DialogTitle>
      <DialogDescription className="sr-only">Choose a voice for this drawing. Changes apply to the next response.</DialogDescription>
    </DialogHeader>
    {open && <VoiceOptions boardId={boardId} />}
    <Button className="voice-question-link" variant="link" onClick={onAsk}>Type a question instead</Button>
  </DialogContent></Dialog>;
}
const languages: Record<string, string> = {
  en: "English", hi: "Hindi", enhi: "English & Hindi", mr: "Marathi",
  kn: "Kannada", pa: "Punjabi", ta: "Tamil", te: "Telugu", gu: "Gujarati", bn: "Bengali",
};
const styles: Record<string, string> = {
  edtech: "Educational", customer: "Customer support", ads: "Advertisement",
  stories: "Storytelling", conversation: "Conversational", ecomm: "E-commerce support",
  social: "Social media", recovery: "Collections & recovery", sports: "News & sports",
};
function styleLabel(style: string) {
  return styles[style] ?? style.replace(/\b\w/g, letter => letter.toUpperCase());
}
function VoiceOptions({ boardId }: { boardId: string }) {
  const query = useActionQuery("get-teacher-session", { boardId });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [language, setLanguage] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [preview, setPreview] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const urlRef = useRef("");
  function stopPreview() {
    requestRef.current?.abort(); requestRef.current = null;
    audioRef.current?.pause(); audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
  }
  useEffect(() => () => stopPreview(), []);
  async function playPreview(id: string) {
    const wasPlaying = preview === id;
    stopPreview(); setPreview(""); setPreviewLoading(false);
    if (wasPlaying) return;
    const controller = new AbortController(); requestRef.current = controller;
    setPreview(id); setPreviewLoading(true); setMessage("");
    try {
      const response = await fetch("/api/teacher-voice-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boardId, voice: id }), signal: controller.signal });
      if (!response.ok) throw new Error("Voice preview unavailable. Check Sarvam setup or try again shortly.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); urlRef.current = url;
      const audio = new Audio(url); audioRef.current = audio;
      audio.onended = () => { stopPreview(); setPreview(""); };
      audio.onerror = () => { stopPreview(); setPreview(""); setMessage("Could not play this sample. Please try again."); };
      await audio.play();
      if (!controller.signal.aborted) setPreviewLoading(false);
    } catch (error) {
      if (!controller.signal.aborted) { stopPreview(); setPreview(""); setPreviewLoading(false); setMessage(error instanceof Error ? error.message : "Preview unavailable."); }
    }
  }
  async function toggleFavorite(id: string) {
    setSaving(true); setMessage("Saving favorite…");
    try {
      const session = await callAction("ensure-teacher-session", { boardId });
      const existing = session.context.favoriteVoices ?? [];
      const favoriteVoices = existing.includes(id) ? existing.filter(v => v !== id) : [...existing, id];
      await callAction("update-teacher-context", { boardId, expectedRevision: session.revision, patch: { favoriteVoices } });
      await query.refetch(); setMessage("Favorites updated.");
    } catch { setMessage("Could not save favorite. Please retry."); }
    finally { setSaving(false); }
  }
  const favorites = query.data?.context.favoriteVoices ?? [];
  const chosen = selected || query.data?.context.voice || "";
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const voices = teacherVoices.filter(v => (!onlyFavorites || favorites.includes(v.id)) && (!language || v.language === language) && `${v.name} ${v.id} ${languages[v.language]} ${styleLabel(v.style)}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const current = teacherVoices.find(v => v.id === query.data?.context.voice);
  async function save() {
    setSaving(true); setMessage("Saving voice…");
    try {
      const session = await callAction("ensure-teacher-session", { boardId });
      await callAction("update-teacher-context", { boardId, expectedRevision: session.revision, patch: { voice: selected } });
      const refreshed = await query.refetch();
      if (refreshed.data?.context.voice !== selected) throw new Error("Could not confirm the saved voice. Please retry.");
      setMessage("Voice saved. Your next response will use it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save voice."); }
    finally { setSaving(false); }
  }
  return <div className="voice-picker">
    <div className="voice-current"><AudioLines aria-hidden="true" /><span>Current voice<strong>{current ? `${current.name} · ${languages[current.language]} · ${styleLabel(current.style)}` : "Server default"}</strong></span></div>
    <div className="voice-filters">
      <div className="voice-search"><Search aria-hidden="true" /><Input aria-label="Search voices" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or style…" /></div>
      <select aria-label="Filter by language" value={language} onChange={e => setLanguage(e.target.value)}>
        <option value="">All languages</option>
        {Object.entries(languages).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </div>
    <div className="voice-tabs" aria-label="Voice list filter">
      <Button variant={onlyFavorites ? "outline" : "default"} aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>All voices</Button>
      <Button variant={onlyFavorites ? "default" : "outline"} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}><Heart size={16} />Favorites</Button>
    </div>
    <fieldset className="voice-options" disabled={saving || query.isLoading}>
      <legend className="sr-only">Teacher voice</legend>
      {query.isLoading ? <p className="voice-empty" role="status">Loading your voice preference…</p> : voices.length === 0 ? <p className="voice-empty">No voices match. Try another name or language.</p> : voices.map(v =>
        <div className="voice-card" key={v.id} data-selected={chosen === v.id}><label className="voice-card-choice">
          <input type="radio" name="teacher-voice" value={v.id} checked={chosen === v.id} onChange={() => { setSelected(v.id); setMessage(""); }} />
          <span className="voice-avatar" aria-hidden="true">{v.name.slice(0, 1)}</span>
          <span className="voice-details"><strong>{v.name}</strong><span>{languages[v.language] ?? v.language}</span><small>{styleLabel(v.style)}</small></span>
          <span className="voice-check" aria-hidden="true">{chosen === v.id && <Check size={14} />}</span>
        </label><div className="voice-card-actions">
          <Button variant="ghost" aria-label={(preview === v.id ? "Stop sample: " : "Play sample: ") + v.name + " " + v.language + " " + v.style} onClick={() => void playPreview(v.id)}>{preview === v.id ? <Square size={16} /> : <Play size={16} />}<span>{preview === v.id ? (previewLoading ? "Loading…" : "Stop") : "Sample"}</span></Button>
          <Button variant="ghost" aria-pressed={favorites.includes(v.id)} aria-label={"Favorite: " + v.name + " " + v.language + " " + v.style} onClick={() => void toggleFavorite(v.id)}><Heart size={18} fill={favorites.includes(v.id) ? "currentColor" : "none"} /></Button>
        </div></div>
      )}
    </fieldset>
    <div className="voice-save-row"><span>For this drawing.<br />Applies to the next response.</span><Button disabled={!selected || selected === current?.id || saving || query.isLoading} onClick={() => void save()}>{saving ? "Saving…" : "Use this voice"}</Button></div>
    {message && <p className="voice-feedback" role="status">{message}</p>}
  </div>;
}

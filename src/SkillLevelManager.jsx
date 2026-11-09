import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Power, X } from "lucide-react";
import { supabase } from "./lib/supabase";
import { skillCodeFromName } from "./lib/skillLevels";

export default function SkillLevelManager({ eventId, levels, onChange, onClose }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const sorted = useMemo(
    () => [...levels].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [levels],
  );
  const activeCount = sorted.filter((level) => level.is_active).length;

  async function addLevel(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    if (sorted.some((level) => level.name.toLowerCase() === cleanName.toLowerCase())) {
      setMessage("A skill level with this name already exists.");
      return;
    }
    setBusyId("new");
    setMessage("");
    const base = skillCodeFromName(cleanName) || "custom";
    const code = `${base}_${crypto.randomUUID().slice(0, 6)}`;
    const { data, error } = await supabase
      .from("event_skill_levels")
      .insert({
        event_id: eventId,
        code,
        name: cleanName,
        rating: Math.min(9, Math.max(2, ...sorted.map((level) => Number(level.rating || 0))) + 0.5),
        sort_order: Math.max(0, ...sorted.map((level) => Number(level.sort_order || 0))) + 10,
        is_active: true,
        is_default: false,
      })
      .select()
      .single();
    setBusyId("");
    if (error) return setMessage(error.message);
    onChange([...levels, data]);
    setName("");
  }

  async function toggleLevel(level) {
    if (level.is_active && activeCount === 1) {
      setMessage("Keep at least one skill level active.");
      return;
    }
    setBusyId(level.id);
    setMessage("");
    const { data, error } = await supabase
      .from("event_skill_levels")
      .update({ is_active: !level.is_active })
      .eq("id", level.id)
      .select()
      .single();
    setBusyId("");
    if (error) return setMessage(error.message);
    onChange(levels.map((item) => (item.id === level.id ? data : item)));
  }

  async function moveLevel(index, direction) {
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= sorted.length) return;
    const current = sorted[index];
    const other = sorted[otherIndex];
    setBusyId(current.id);
    setMessage("");
    const { error } = await supabase
      .from("event_skill_levels")
      .upsert([
        { ...current, sort_order: other.sort_order, rating: other.rating },
        { ...other, sort_order: current.sort_order, rating: current.rating },
      ]);
    setBusyId("");
    if (error) return setMessage(error.message);
    onChange(
      levels.map((level) =>
        level.id === current.id
          ? { ...level, sort_order: other.sort_order, rating: other.rating }
          : level.id === other.id
            ? { ...level, sort_order: current.sort_order, rating: current.rating }
            : level,
      ),
    );
  }

  return (
    <div className="modal-backdrop viewport-top-backdrop">
      <section className="auth-card skill-level-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-level-title">
        <div className="skill-level-heading">
          <div>
            <span className="eyebrow">Event settings</span>
            <h2 id="skill-level-title">Skill levels</h2>
            <p className="muted">Create event-specific levels or hide levels you do not need. Existing player records remain unchanged.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close skill levels" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="skill-level-add" onSubmit={addLevel}>
          <label>
            New skill level name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Social Player" maxLength={50} />
          </label>
          <button className="button button-primary" disabled={!name.trim() || busyId === "new"}>
            <Plus size={16} /> {busyId === "new" ? "Adding…" : "Add level"}
          </button>
        </form>

        <div className="skill-level-list">
          {sorted.map((level, index) => (
            <article className={`skill-level-row ${level.is_active ? "" : "inactive"}`} key={level.id || level.code}>
              <div className="skill-level-order">
                <button type="button" aria-label={`Move ${level.name} up`} disabled={index === 0 || Boolean(busyId)} onClick={() => moveLevel(index, -1)}><ArrowUp size={15} /></button>
                <button type="button" aria-label={`Move ${level.name} down`} disabled={index === sorted.length - 1 || Boolean(busyId)} onClick={() => moveLevel(index, 1)}><ArrowDown size={15} /></button>
              </div>
              <div>
                <strong>{level.name}</strong>
                <span>{level.is_default ? "Default" : "Custom"} · Match rating {Number(level.rating).toFixed(1)}</span>
              </div>
              <button
                type="button"
                className={`skill-level-toggle ${level.is_active ? "active" : ""}`}
                disabled={busyId === level.id}
                onClick={() => toggleLevel(level)}
              >
                <Power size={15} /> {level.is_active ? "Active" : "Inactive"}
              </button>
            </article>
          ))}
        </div>
        {message && <div className="form-message error">{message}</div>}
        <div className="dialog-actions">
          <button className="button button-primary" type="button" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}

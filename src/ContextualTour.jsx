import { useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, X } from "lucide-react";

export default function ContextualTour({ steps, storageKey, open, onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const available = steps.filter((step) => document.querySelector(step.selector));
  const step = available[index] || available[0];

  useEffect(() => setIndex(0), [open]);

  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    const target = document.querySelector(step.selector);
    if (!target) return undefined;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const update = () => setRect(target.getBoundingClientRect());
    const timer = window.setTimeout(update, 280);
    update();
    target.classList.add("context-tour-target");
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      target.classList.remove("context-tour-target");
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  if (!open || !step || !rect) return null;
  const finish = () => {
    window.localStorage.setItem(storageKey, "complete");
    onClose();
  };
  const width = Math.min(360, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  const placeAbove = rect.bottom + 230 > window.innerHeight && rect.top > 240;
  const top = placeAbove ? Math.max(12, rect.top - 205) : Math.min(window.innerHeight - 205, rect.bottom + 14);

  return <>
    <div className="context-tour-shade" />
    <section className="context-tour-card" style={{ left, top, width }} role="dialog" aria-modal="true" aria-label="Page guide">
      <header><span>{index + 1} of {available.length}</span><button type="button" onClick={finish} aria-label="Close guide"><X /></button></header>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <footer>
        <button type="button" className="context-tour-end" onClick={finish}>End guide</button>
        <div>{index > 0 && <button type="button" className="context-tour-nav secondary" onClick={() => setIndex(index - 1)}><ArrowLeft /> Back</button>}
          {index < available.length - 1 ? <button type="button" className="context-tour-nav" onClick={() => setIndex(index + 1)}>Next <ArrowRight /></button> : <button type="button" className="context-tour-nav" onClick={finish}>Done <CheckCircle2 /></button>}
        </div>
      </footer>
    </section>
  </>;
}

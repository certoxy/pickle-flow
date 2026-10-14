import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, X } from "lucide-react";

export default function QrScanner({ onResult, onClose, title = "Scan QR code" }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let stopped = false;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
    setError("");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        return reader.decodeFromStream(stream, videoRef.current, (result, _scanError, controls) => {
          controlsRef.current = controls;
          if (result && !stopped) {
            stopped = true;
            controls.stop();
            stream.getTracks().forEach((track) => track.stop());
            onResult(result.getText());
          }
        });
      })
      .catch((cameraError) => {
        const blocked = ["NotAllowedError", "PermissionDeniedError"].includes(cameraError?.name);
        setError(blocked
          ? "Camera access was blocked by the browser or macOS. Close other camera previews, confirm permission, then retry."
          : `Camera unavailable: ${cameraError?.message || "The camera could not be opened."}`);
      });
    return () => {
      stopped = true;
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [onResult, retryKey]);

  return <section className="offline-scanner">
    <header><span><Camera size={18} /> {title}</span><button type="button" onClick={onClose} aria-label="Close scanner"><X size={19} /></button></header>
    <video ref={videoRef} muted playsInline />
    {error && <div className="offline-scanner-error"><p>{error}</p><button type="button" onClick={() => setRetryKey((current) => current + 1)}>Retry camera</button></div>}
  </section>;
}

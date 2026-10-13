import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, X } from "lucide-react";

export default function QrScanner({ onResult, onClose, title = "Scan QR code" }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, scanError, controls) => {
      controlsRef.current = controls;
      if (result && !stopped) {
        stopped = true;
        controls.stop();
        onResult(result.getText());
      } else if (scanError?.name === "NotAllowedError") {
        setError("Camera access was blocked. Allow camera access or paste the response code instead.");
      }
    }).catch((cameraError) => setError(cameraError.message || "The camera could not be opened."));
    return () => {
      stopped = true;
      controlsRef.current?.stop();
    };
  }, [onResult]);

  return <section className="offline-scanner">
    <header><span><Camera size={18} /> {title}</span><button type="button" onClick={onClose} aria-label="Close scanner"><X size={19} /></button></header>
    <video ref={videoRef} muted playsInline />
    {error && <p>{error}</p>}
  </section>;
}

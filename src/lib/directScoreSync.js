import { supabase } from "./supabase";

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const channelName = (token) => `direct-score-${token}`;

function parseMessage(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

export function directSyncSupported() {
  return typeof window !== "undefined" && "RTCPeerConnection" in window;
}

export function createOrganizerDirectSync({ token, onScore, onStatus }) {
  if (!directSyncSupported()) {
    onStatus?.("unsupported");
    return { close() {} };
  }

  const peers = new Map();
  const channel = supabase.channel(channelName(token));
  let closed = false;

  const signal = (deviceId, payload) =>
    channel.send({
      type: "broadcast",
      event: "organizer-signal",
      payload: { to: deviceId, ...payload },
    });

  function wireDataChannel(deviceId, dataChannel) {
    dataChannel.onopen = () => onStatus?.("connected");
    dataChannel.onclose = () => {
      if (!closed) onStatus?.("waiting");
    };
    dataChannel.onerror = () => onStatus?.("error");
    dataChannel.onmessage = (event) => {
      const message = parseMessage(event);
      if (message?.type !== "score") return;
      onScore?.(message);
      if (dataChannel.readyState === "open")
        dataChannel.send(JSON.stringify({
          type: "ack",
          gameId: message.gameId,
          one: message.one,
          two: message.two,
          messageId: message.messageId,
        }));
    };
  }

  async function connect(deviceId) {
    const existing = peers.get(deviceId);
    if (existing && ["new", "connecting", "connected"].includes(existing.pc.connectionState))
      return;
    existing?.pc.close();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const queuedCandidates = [];
    const dataChannel = pc.createDataChannel("pickleflow-scores", { ordered: true });
    peers.set(deviceId, { pc, dataChannel, queuedCandidates });
    wireDataChannel(deviceId, dataChannel);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signal(deviceId, { candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") onStatus?.("connected");
      if (["failed", "disconnected", "closed"].includes(pc.connectionState) && !closed)
        onStatus?.("waiting");
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await signal(deviceId, { description: pc.localDescription });
  }

  channel
    .on("broadcast", { event: "scorer-ready" }, ({ payload }) => {
      if (payload?.deviceId) connect(payload.deviceId).catch(() => onStatus?.("error"));
    })
    .on("broadcast", { event: "scorer-signal" }, async ({ payload }) => {
      const peer = peers.get(payload?.from);
      if (!peer) return;
      try {
        if (payload.description) {
          await peer.pc.setRemoteDescription(payload.description);
          while (peer.queuedCandidates.length)
            await peer.pc.addIceCandidate(peer.queuedCandidates.shift());
        } else if (payload.candidate) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload.candidate);
          else peer.queuedCandidates.push(payload.candidate);
        }
      } catch {
        onStatus?.("error");
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus?.("waiting");
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) onStatus?.("error");
    });

  return {
    close() {
      closed = true;
      peers.forEach(({ pc }) => pc.close());
      peers.clear();
      supabase.removeChannel(channel);
    },
  };
}

export function createScorerDirectSync({ token, onStatus, onAck }) {
  if (!directSyncSupported()) {
    onStatus?.("unsupported");
    return { sendScore: () => false, close() {} };
  }

  const storageKey = "pickleflow-direct-score-device-v1";
  let deviceId = window.localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(storageKey, deviceId);
  }
  const channel = supabase.channel(channelName(token));
  let pc = null;
  let dataChannel = null;
  let queuedCandidates = [];
  let closed = false;
  let readyTimer = null;

  const signal = (payload) =>
    channel.send({
      type: "broadcast",
      event: "scorer-signal",
      payload: { from: deviceId, ...payload },
    });

  const announce = () => {
    if (closed || dataChannel?.readyState === "open") return;
    channel.send({
      type: "broadcast",
      event: "scorer-ready",
      payload: { deviceId },
    });
    window.clearTimeout(readyTimer);
    readyTimer = window.setTimeout(announce, 4000);
  };

  function wireDataChannel(nextChannel) {
    dataChannel = nextChannel;
    dataChannel.onopen = () => {
      window.clearTimeout(readyTimer);
      onStatus?.("connected");
    };
    dataChannel.onclose = () => {
      if (!closed) {
        onStatus?.("pairing");
        announce();
      }
    };
    dataChannel.onerror = () => onStatus?.("error");
    dataChannel.onmessage = (event) => {
      const message = parseMessage(event);
      if (message?.type === "ack") onAck?.(message);
    };
  }

  async function acceptOffer(description) {
    pc?.close();
    pc = new RTCPeerConnection(RTC_CONFIG);
    pc.ondatachannel = ({ channel: nextChannel }) => wireDataChannel(nextChannel);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signal({ candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") onStatus?.("connected");
      if (["failed", "disconnected"].includes(pc.connectionState) && !closed) {
        onStatus?.("pairing");
        announce();
      }
    };
    await pc.setRemoteDescription(description);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await signal({ description: pc.localDescription });
    while (queuedCandidates.length) await pc.addIceCandidate(queuedCandidates.shift());
  }

  channel
    .on("broadcast", { event: "organizer-signal" }, async ({ payload }) => {
      if (payload?.to !== deviceId) return;
      try {
        if (payload.description) await acceptOffer(payload.description);
        else if (payload.candidate) {
          if (pc?.remoteDescription) await pc.addIceCandidate(payload.candidate);
          else queuedCandidates.push(payload.candidate);
        }
      } catch {
        onStatus?.("error");
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus?.("pairing");
        announce();
      }
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) onStatus?.("error");
    });

  return {
    sendScore(score) {
      if (dataChannel?.readyState !== "open") return false;
      dataChannel.send(JSON.stringify({
        type: "score",
        messageId: crypto.randomUUID(),
        sentAt: new Date().toISOString(),
        ...score,
      }));
      return true;
    },
    close() {
      closed = true;
      window.clearTimeout(readyTimer);
      pc?.close();
      supabase.removeChannel(channel);
    },
  };
}

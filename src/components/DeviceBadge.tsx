import { useEffect, useState } from "react";
import { getDeviceInfo } from "../lib/tauri";
import type { DeviceInfo } from "../types/sidecar";

export function DeviceBadge() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDeviceInfo()
      .then(setDevice)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <span className="text-xs text-red-400">device: erro</span>;
  if (!device) return <span className="text-xs text-neutral-500">detectando device...</span>;

  const color =
    device.selected === "cuda"
      ? "text-emerald-400"
      : device.selected === "mps"
        ? "text-sky-400"
        : "text-neutral-400";

  return (
    <span className="text-xs">
      <span className="text-neutral-500">device: </span>
      <span className={`font-mono ${color}`}>{device.selected.toUpperCase()}</span>
      <span className="text-neutral-600">
        {" "}
        — disponíveis: {device.available.map((d) => d.toUpperCase()).join(", ")}
      </span>
    </span>
  );
}

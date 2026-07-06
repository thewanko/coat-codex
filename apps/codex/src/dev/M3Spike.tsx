/**
 * M3検証スパイク（T2 DndSpikeと同様の一時検証用。確認後削除可）
 * preview_evalから `import("/src/dev/M3Spike.tsx")` で自己マウントし、
 * PaintSlotList＋PaintPicker＋MixRatioInputの単体動作（M3完了条件）を実機確認する。
 * アプリ本体からはimportされない（ルート・App.tsxに変更なし）。
 */
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../i18n";
import ToastHost from "../components/common/ToastHost";
import PaintSlotList from "../components/part-editor/PaintSlotList";
import type { MixState } from "../lib/mixRatio";
import type { PaletteColor } from "@coat-codex/recipe-core";

declare global {
  interface Window {
    __m3spike?: { state: MixState; palette: PaletteColor[] };
  }
}

export function Harness() {
  const [state, setState] = useState<MixState>({ paints: [], mix: null });
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  window.__m3spike = { state, palette };
  return (
    <PaintSlotList
      state={state}
      palette={palette}
      recipeId="rcp_dev-spike"
      onChange={setState}
      onAddColor={(c) => setPalette((p) => [...p, c])}
    />
  );
}

const HOST_ID = "m3-harness";
document.getElementById(HOST_ID)?.remove();
const host = document.createElement("div");
host.id = HOST_ID;
host.style.cssText =
  "padding:24px;max-width:720px;margin:0 auto;background:var(--color-bg)";
document.body.prepend(host);
createRoot(host).render(
  <StrictMode>
    <ToastHost>
      <Harness />
    </ToastHost>
  </StrictMode>,
);

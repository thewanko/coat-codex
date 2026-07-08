// src/server/moderation/events.ts — モデレーション通知イベント型（技術計画v1 §4.2/§8-4・S6 ST-27）
//
// report.ts（ST-26）で定義していた ModerationEvent を notifier.ts と共有できるよう
// 本モジュールへ移設する。ST-28 の circuitOpen はここで型のみ先行追加する
// （notifier.ts の整形実装・呼び出し元の結線は ST-28 で行う）。

/** モデレーション通知イベント。ST-27/28 が種類を拡張できる union 形にしておく。 */
export type ModerationEvent =
  | {
      type: "flagged";
      recipeId: string;
      reportCount: number;
    }
  | {
      type: "circuitOpen";
      count: number;
      period: string;
    };

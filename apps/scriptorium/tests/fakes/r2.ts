// tests/fakes/r2.ts — R2Bucket の in-memory フェイク（技術計画v1 §4.7）
//
// get/put の Map 実装。ST-14 スコープでは get のみ実利用（img プロキシ）だが、
// put も併せて用意しシード投入相当のセットアップをテストから行えるようにする。

export interface FakeR2Object {
  body: ReadableStream | null;
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

export class FakeR2Bucket {
  private readonly store = new Map<
    string,
    { bytes: Uint8Array; contentType?: string }
  >();

  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): void {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.store.set(key, {
      bytes,
      contentType: options?.httpMetadata?.contentType,
    });
  }

  async get(key: string): Promise<FakeR2Object | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    const bytes = entry.bytes;
    return {
      body: null,
      arrayBuffer: async () => {
        const copy = new Uint8Array(bytes);
        return copy.buffer;
      },
      httpMetadata: { contentType: entry.contentType },
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

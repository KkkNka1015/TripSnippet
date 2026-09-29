/**
 * 简单的内存 TTL 缓存 + 并发去重。
 * 仅用于同 URL 短时防重复抓取，不落盘、无持久化。
 */
class TtlCache {
  constructor(ttlMs = 5 * 60 * 1000, maxEntries = 60) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
    this.inFlight = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key, value) {
    if (this.map.size >= this.maxEntries) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, { at: Date.now(), value });
  }

  /** 同 key 请求合并：进行中的请求直接复用 Promise */
  async join(key, task) {
    const cached = this.get(key);
    if (cached) return cached;
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    const p = task()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, p);
    return p;
  }
}

module.exports = { TtlCache };

import { describe, expect, it } from "vitest";
import { ABSENT, conflictCopyName, decide, type FileState } from "./reconciler.js";

const file = (hash: string): FileState => ({ exists: true, hash, type: "file" });
const folder = (): FileState => ({ exists: true, hash: null, type: "folder" });

describe("reconciler decide()", () => {
  it("noop when nothing changed", () => {
    expect(decide(file("a"), file("a"), file("a"))).toBe("noop");
    expect(decide(ABSENT, ABSENT, ABSENT)).toBe("noop");
  });

  describe("only local changed", () => {
    it("uploads a new local file", () => {
      expect(decide(file("a"), ABSENT, ABSENT)).toBe("upload");
    });
    it("uploads a locally modified file", () => {
      expect(decide(file("b"), file("a"), file("a"))).toBe("upload");
    });
    it("deletes remote when deleted locally", () => {
      expect(decide(ABSENT, file("a"), file("a"))).toBe("delete_remote");
    });
    it("mkdir_remote for a new local folder", () => {
      expect(decide(folder(), ABSENT, ABSENT)).toBe("mkdir_remote");
    });
  });

  describe("only remote changed", () => {
    it("downloads a new remote file", () => {
      expect(decide(ABSENT, ABSENT, file("a"))).toBe("download");
    });
    it("downloads a remotely modified file", () => {
      expect(decide(file("a"), file("a"), file("b"))).toBe("download");
    });
    it("deletes local when deleted remotely", () => {
      expect(decide(file("a"), file("a"), ABSENT)).toBe("delete_local");
    });
    it("mkdir_local for a new remote folder", () => {
      expect(decide(ABSENT, ABSENT, folder())).toBe("mkdir_local");
    });
  });

  describe("both changed", () => {
    it("noop when both made the identical change", () => {
      expect(decide(file("b"), file("a"), file("b"))).toBe("noop");
    });
    it("conflict when both edited to different content", () => {
      expect(decide(file("b"), file("a"), file("c"))).toBe("conflict");
    });
    it("revives upload when local edited but remote deleted", () => {
      expect(decide(file("b"), file("a"), ABSENT)).toBe("upload");
    });
    it("revives download when remote edited but local deleted", () => {
      expect(decide(ABSENT, file("a"), file("c"))).toBe("download");
    });
    it("noop when both deleted independently", () => {
      // base existed; both sides now absent -> converged -> nothing to do
      expect(decide(ABSENT, file("a"), ABSENT)).toBe("noop");
    });
  });
});

describe("conflictCopyName()", () => {
  it("inserts a dated, attributed suffix before the extension", () => {
    const out = conflictCopyName("docs/report.xlsx", "alice@example.com", new Date(Date.UTC(2026, 5, 28)));
    expect(out).toBe("docs/report (conflict 2026-06-28 from alice@example.com).xlsx");
  });
  it("handles files without an extension", () => {
    const out = conflictCopyName("notes", "bob@x.io", new Date(Date.UTC(2026, 0, 3)));
    expect(out).toBe("notes (conflict 2026-01-03 from bob@x.io)");
  });
  it("sanitizes characters illegal in filenames", () => {
    const out = conflictCopyName("a.txt", "weird:/name", new Date(Date.UTC(2026, 5, 28)));
    expect(out).toContain("weird__name");
  });
});

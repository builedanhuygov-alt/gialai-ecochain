import { describe, expect, it } from "vitest";
import { sevOfConfidence, toVStatus } from "./Community";

describe("toVStatus", () => {
  it("maps API statuses without inventing states", () => {
    expect(toVStatus("OFFICIAL_VERIFIED", 0)).toBe("ĐÃ DUYỆT");
    expect(toVStatus("VERIFIED", 0)).toBe("ĐÃ DUYỆT");
    expect(toVStatus("COMMUNITY_VERIFIED", 2)).toBe("ĐÃ XÁC MINH");
    expect(toVStatus("REJECTED", 0)).toBe("BỊ TỪ CHỐI");
    expect(toVStatus("PENDING", 0)).toBe("CHỜ XÁC MINH");
    expect(toVStatus("PENDING", 1)).toBe("ĐANG XÁC MINH");
  });
});

describe("sevOfConfidence", () => {
  it("never escalates to CRITICAL from a number alone", () => {
    expect(sevOfConfidence(100)).toBe("HIGH");
    expect(sevOfConfidence(80)).toBe("HIGH");
    expect(sevOfConfidence(50)).toBe("MEDIUM");
    expect(sevOfConfidence(10)).toBe("LOW");
    expect(sevOfConfidence(undefined)).toBe("MEDIUM");
  });
});

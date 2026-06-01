import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("packageName", () => {
  it("identifies the adapters package", () => {
    expect(packageName).toBe("@gleip/adapters");
  });
});

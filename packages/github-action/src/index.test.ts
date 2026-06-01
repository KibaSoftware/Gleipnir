import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("packageName", () => {
  it("identifies the GitHub Action package", () => {
    expect(packageName).toBe("@gleip/github-action");
  });
});

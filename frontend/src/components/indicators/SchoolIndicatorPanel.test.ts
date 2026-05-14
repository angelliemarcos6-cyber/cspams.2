import { describe, expect, it } from "vitest";
import { buildWorkspaceAutosavePayloadOptions } from "@/components/indicators/SchoolIndicatorPanel";

describe("buildWorkspaceAutosavePayloadOptions", () => {
  it("keeps routine autosave in partial mode instead of promoting it to a full workspace replace", () => {
    expect(buildWorkspaceAutosavePayloadOptions()).toEqual({
      allowIncomplete: true,
      includeAllEntries: false,
    });
  });
});

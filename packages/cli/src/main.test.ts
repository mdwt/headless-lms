import { describe, it, expect, vi, beforeEach } from "vitest";
import { main } from "./main.js";

const { runMigrations, runSeed } = vi.hoisted(() => ({
  runMigrations: vi.fn(),
  runSeed: vi.fn(),
}));
vi.mock("@headless-lms/server", () => ({ runMigrations, runSeed }));

const log = vi.spyOn(console, "log").mockImplementation(() => {});
const error = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("main", () => {
  it("prints usage to stderr and fails when no command is given", async () => {
    expect(await main([])).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain("Usage: headless-lms <command>");
  });

  it("prints usage on help and succeeds", async () => {
    for (const flag of ["help", "--help", "-h"]) {
      expect(await main([flag])).toBe(0);
    }
    expect(log.mock.calls[0]?.[0]).toContain("migrate");
    expect(log.mock.calls[0]?.[0]).toContain("seed");
  });

  it("prints the version", async () => {
    expect(await main(["--version"])).toBe(0);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("rejects unknown commands with usage", async () => {
    expect(await main(["frobnicate"])).toBe(1);
    expect(error.mock.calls[0]?.[0]).toContain("Unknown command: frobnicate");
    expect(error.mock.calls[0]?.[0]).toContain("Usage: headless-lms <command>");
  });

  it("dispatches migrate with DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(await main(["migrate"])).toBe(0);
    expect(runMigrations).toHaveBeenCalledWith("postgres://x");
    expect(log).toHaveBeenCalledWith("Migrations applied.");
  });

  it("dispatches seed with DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    expect(await main(["seed"])).toBe(0);
    expect(runSeed).toHaveBeenCalledWith("postgres://x");
  });

  it("turns a command failure into a message and exit code 1", async () => {
    runMigrations.mockRejectedValueOnce(new Error("DATABASE_URL is not set"));
    expect(await main(["migrate"])).toBe(1);
    expect(error).toHaveBeenCalledWith("DATABASE_URL is not set");
  });
});

import { describe, expect, test } from "bun:test";
import { greet } from "../src/index";

describe("greet", () => {
  test("returns greeting with name", () => {
    expect(greet("Player")).toBe("Hello, Player!");
  });

  test("handles empty string", () => {
    expect(greet("")).toBe("Hello, !");
  });
});

import { test, expect } from "bun:test";
import { wireProtocol } from "../src/index";

test("wireProtocol is a function", () => {
  expect(typeof wireProtocol).toBe("function");
});
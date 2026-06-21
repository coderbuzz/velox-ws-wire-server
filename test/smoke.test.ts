import { test, expect } from "bun:test";
import { wireProtocol } from "@coderbuzz/velox-ws-wire-server";

test("wireProtocol is a function", () => {
  expect(typeof wireProtocol).toBe("function");
});
import { describe, expect, it } from "vitest";
import {
  containsNumber,
  nameKey,
  normalizeText,
  numberForms,
  squash,
} from "../src/postprocess/normalize.js";

describe("normalizeText", () => {
  it("unifies quotes, dashes and odd whitespace", () => {
    expect(normalizeText("“Steele Bayou” – TMDL’s")).toBe('"steele bayou" - tmdl\'s');
  });
  it("collapses whitespace", () => {
    expect(normalizeText("  a \n\t b  ")).toBe("a b");
  });
});

describe("squash", () => {
  it("keeps only letters and digits", () => {
    expect(squash("Water Control Structures |  | $1,500 | 25")).toBe(
      "watercontrolstructures150025",
    );
  });
});

describe("nameKey", () => {
  it("folds plurals, punctuation and stopwords", () => {
    expect(nameKey("Water control structures")).toBe(nameKey("the Water-Control Structure"));
    expect(nameKey("Grade Stabilization Structures (#)")).toBe("grade stabilization structure");
  });
});

describe("numbers", () => {
  it("lists the ways a number is written", () => {
    expect(numberForms(1200)).toEqual(expect.arrayContaining(["1200", "1,200", "1,200.0"]));
    expect(numberForms(5)).toEqual(expect.arrayContaining(["5", "5.0"]));
  });
  it("finds numbers at token boundaries only", () => {
    expect(containsNumber("install 25 units for $37,500", 25)).toBe(true);
    expect(containsNumber("install 250 units", 25)).toBe(false);
    expect(containsNumber("cost $1,250", 25)).toBe(false);
    expect(containsNumber("Dissolved Oxygen 5.0 mg/L", 5)).toBe(true);
    expect(containsNumber("drains approximately 202,617 acres", 202617)).toBe(true);
    expect(containsNumber("reduce by 35% to 56%", 56)).toBe(true);
  });
});

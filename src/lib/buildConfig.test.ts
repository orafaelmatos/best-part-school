import { describe, expect, it } from "vitest";
import { validateStudentBuildConfig } from "./buildConfig";

describe("student build configuration", () => {
  it("never packages development proxy configuration even if a valid remote URL exists", () => {
    expect(() => validateStudentBuildConfig({ VITE_LOCAL_API: "1", VITE_API_URL: "https://api.example.test/api/" })).toThrow("live reload");
  });
  it("requires a reachable HTTPS API instead of shipping the browser fallback", () => {
    for (const VITE_API_URL of [undefined, "", "/api/", "http://api.example.test/api/", "https://localhost/api/"]) {
      expect(() => validateStudentBuildConfig({ VITE_API_URL })).toThrow();
    }
  });

  it("does not accept credentials or query strings in public app configuration", () => {
    for (const VITE_API_URL of ["https://user:secret@api.example.test/api/", "https://api.example.test/api/?token=x"]) {
      expect(() => validateStudentBuildConfig({ VITE_API_URL })).toThrow();
    }
  });

  it("validates media independently while allowing derivation from the API", () => {
    expect(() => validateStudentBuildConfig({ VITE_API_URL: "https://api.example.test/api/" })).not.toThrow();
    expect(() => validateStudentBuildConfig({
      VITE_API_URL: "https://api.example.test/api/",
      VITE_MEDIA_BASE_URL: "http://media.example.test",
    })).toThrow();
  });
});

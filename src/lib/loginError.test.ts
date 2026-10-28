import { describe, expect, it } from "vitest";
import { AxiosError } from "axios";
import { describeLoginError } from "./loginError";

const responseError = (status: number, data = {}) => new AxiosError("failure", undefined, undefined, undefined, { status, data } as never);

describe("login error diagnosis", () => {
  it("does not misdiagnose a missing local API as wrong credentials", () => {
    expect(describeLoginError(new AxiosError("Network Error"), true)).toContain("dev:api:mobile");
    expect(describeLoginError(responseError(502), true)).toContain("terminal");
  });
  it("preserves an authentication rejection", () => {
    expect(describeLoginError(responseError(401, { detail: "Conta não encontrada." }), true)).toBe("Conta não encontrada.");
  });
  it("distinguishes a wrong URL from a server error", () => {
    expect(describeLoginError(responseError(404), false)).toContain("endereço de login");
    expect(describeLoginError(responseError(500), false)).toContain("indisponível");
  });
});

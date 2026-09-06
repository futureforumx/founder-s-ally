import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RegisterAccessForm } from "@/components/auth/RegisterAccessForm";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isConfigured: true,
    signInWithOAuth: vi.fn(),
    signUp: vi.fn(),
  }),
}));

describe("RegisterAccessForm", () => {
  it("renders password and confirm password under email", () => {
    render(
      <MemoryRouter>
        <RegisterAccessForm onSignInClick={() => {}} />
      </MemoryRouter>,
    );

    const email = screen.getByLabelText(/^email$/i);
    const password = screen.getByLabelText(/^password$/i);
    const confirm = screen.getByLabelText(/confirm password/i);

    expect(email.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(password.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

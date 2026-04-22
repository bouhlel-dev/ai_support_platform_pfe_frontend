import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/features/auth/ProtectedRoute";

vi.mock("@/features/auth/AuthContext", () => {
  return {
    useAuth: vi.fn(),
  };
});

import { useAuth } from "@/features/auth/AuthContext";

describe("ProtectedRoute", () => {
  beforeEach(() => {
    (useAuth as any).mockReset();
  });

  it("redirects to /login when unauthenticated", () => {
    (useAuth as any).mockReturnValue({ user: null, loading: false });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/" element={<div>Home</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute roles={["admin"]}>
                <div>Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("redirects to / when role is not allowed", () => {
    (useAuth as any).mockReturnValue({ user: { role: "agent" }, loading: false });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/" element={<div>Home</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute roles={["admin"]}>
                <div>Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders children when role is allowed", () => {
    (useAuth as any).mockReturnValue({ user: { role: "admin" }, loading: false });

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/" element={<div>Home</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute roles={["admin"]}>
                <div>Protected</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Protected")).toBeInTheDocument();
  });
});


import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { VisualAiScreenshareTab } from "@/features/visual-ai/VisualAiScreenshareTab";

const screenshareFramesMock = vi.fn();
const screenshareVideoMock = vi.fn();

vi.mock("@/shared/api/visual-ai", () => {
  return {
    visualAiApi: {
      screenshareFrames: (...args: any[]) => screenshareFramesMock(...args),
      screenshareVideo: (...args: any[]) => screenshareVideoMock(...args),
    },
  };
});

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("VisualAiScreenshareTab validation", () => {
  it("requires consent before analyzing frames", async () => {
    renderWithProviders(<VisualAiScreenshareTab />);

    // Select at least one frame so the submit button is enabled.
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["fake"], "frame.png", { type: "image/png" });
    // Some DOM implementations (incl. happy-dom) need `files` to be defined as a property.
    Object.defineProperty(fileInput!, "files", { value: [file] });
    fireEvent.change(fileInput!);

    const analyzeBtn = screen.getByRole("button", { name: /analyze frames/i });
    expect(analyzeBtn).not.toBeDisabled();
    fireEvent.click(analyzeBtn);

    expect(await screen.findByText(/Consent is required to analyze your screen/i)).toBeInTheDocument();
    expect(screenshareFramesMock).not.toHaveBeenCalled();
  });
});


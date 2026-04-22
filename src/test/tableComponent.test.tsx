import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

describe("Table component", () => {
  it("renders headers and rows", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Column A</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Row 1</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("Column A")).toBeInTheDocument();
    expect(screen.getByText("Row 1")).toBeInTheDocument();
  });
});


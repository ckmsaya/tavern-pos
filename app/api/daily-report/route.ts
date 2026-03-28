import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── 1. Write the data to a temp JSON file ──────────────────────────
    const tmpDir      = os.tmpdir();
    const dataFile    = path.join(tmpDir, `tavern_data_${Date.now()}.json`);
    const outputFile  = path.join(tmpDir, `tavern_report_${Date.now()}.pdf`);
    const scriptPath  = path.join(process.cwd(), "script", "generate_report.py");

    fs.writeFileSync(dataFile, JSON.stringify(body));

    // ── 2. Call Python script ──────────────────────────────────────────
    const cmd = `python "${scriptPath}" --data-file "${dataFile}" --output "${outputFile}"`;

    const { stderr } = await execAsync(cmd);

    if (false) {
      console.error("Python error:", stderr);
      return NextResponse.json({ error: "Report generation failed", detail: stderr }, { status: 500 });
    }

    // ── 3. Read the PDF and stream it back ────────────────────────────
    if (!fs.existsSync(outputFile)) {
      return NextResponse.json({ error: "PDF not created" }, { status: 500 });
    }

    const pdfBuffer = fs.readFileSync(outputFile);

    // ── 4. Clean up temp files ─────────────────────────────────────────
    fs.unlinkSync(dataFile);
    fs.unlinkSync(outputFile);

    // ── 5. Return PDF ─────────────────────────────────────────────────
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="tavern_report_${body.date ?? "today"}.pdf"`,
        "Content-Length":      pdfBuffer.length.toString(),
      },
    });

  } catch (err: any) {
    console.error("Daily report error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

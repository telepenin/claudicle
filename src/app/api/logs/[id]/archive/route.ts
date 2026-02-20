import { NextRequest } from "next/server";
import { pack } from "tar-stream";
import { createGzip } from "node:zlib";
import { getSessionFiles } from "@/lib/queries";

export const dynamic = "force-dynamic";

async function buildTarGz(
  files: { archive_path: string; content: string }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tarPack = pack();
    const gzip = createGzip();
    const chunks: Buffer[] = [];

    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
    tarPack.on("error", reject);

    tarPack.pipe(gzip);

    let i = 0;
    function addNext() {
      if (i >= files.length) {
        tarPack.finalize();
        return;
      }
      const { archive_path, content } = files[i++];
      const buf = Buffer.from(content, "utf-8");
      tarPack.entry({ name: archive_path, size: buf.length }, buf, (err) => {
        if (err) reject(err);
        else addNext();
      });
    }
    addNext();
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const files = await getSessionFiles(id);

    if (files.length === 0) {
      return new Response("No files found for this session.\n", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const tarGz = await buildTarGz(files);

    return new Response(new Uint8Array(tarGz), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${id}.tar.gz"`,
        "Content-Length": String(tarGz.length),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("GET /api/logs/[id]/archive error:", message);
    return new Response(`Error: ${message}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

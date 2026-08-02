import { getPool } from "@/lib/database";

export async function GET(): Promise<Response> {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}

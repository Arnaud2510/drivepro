import { NextResponse, type NextRequest } from "next/server";
import { clientFor } from "@/lib/cinetpay";
import { orderStore } from "@/lib/orders";
import { handleNotification, siteUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** CinetPay peut vérifier la disponibilité de l'URL par un simple GET. */
export function GET() {
  return NextResponse.json({ ok: true });
}

async function readPayload(request: NextRequest): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    return Object.fromEntries((await request.formData()).entries());
  }
  try {
    const json: unknown = await request.json();
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  const payload = await readPayload(request);
  try {
    const result = await handleNotification({ store: orderStore(), clientFor, siteUrl: siteUrl() }, payload);
    if (result === "rejected") return NextResponse.json({ ok: false }, { status: 400 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    // 500 : CinetPay renverra la notification plus tard.
    console.error("[cinetpay] échec du traitement de la notification", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

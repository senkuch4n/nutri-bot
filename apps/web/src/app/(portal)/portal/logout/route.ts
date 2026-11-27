import { NextResponse } from "next/server";
import { clearPatientSessionCookie } from "@/lib/patient-session";
import { publicUrl } from "@/lib/public-url";

export async function POST(req: Request) {
  await clearPatientSessionCookie();
  return NextResponse.redirect(publicUrl("/portal", req));
}

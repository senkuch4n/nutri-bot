import { NextResponse } from "next/server";
import { verifyPatientToken } from "@nutri-bot/db/domain";
import { setPatientSessionCookie } from "@/lib/patient-session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const patientId = token ? verifyPatientToken(token) : null;

  if (!patientId) {
    return NextResponse.redirect(new URL("/portal?error=invalid", url));
  }

  await setPatientSessionCookie(patientId);
  return NextResponse.redirect(new URL("/portal", url));
}

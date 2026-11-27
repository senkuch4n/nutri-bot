import { NextResponse } from "next/server";
import { verifyPatientToken } from "@nutri-bot/db/domain";
import { setPatientSessionCookie } from "@/lib/patient-session";
import { publicUrl } from "@/lib/public-url";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const claims = token ? verifyPatientToken(token) : null;

  if (!claims) {
    return NextResponse.redirect(publicUrl("/portal?error=invalid", req));
  }

  await setPatientSessionCookie(claims);
  return NextResponse.redirect(publicUrl("/portal", req));
}

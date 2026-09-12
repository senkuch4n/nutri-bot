import { NextResponse } from "next/server";
import { clearPatientSessionCookie } from "@/lib/patient-session";

export async function POST(req: Request) {
  await clearPatientSessionCookie();
  return NextResponse.redirect(new URL("/portal", req.url));
}

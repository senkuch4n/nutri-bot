import { ACCESS_TEXT } from "@nutri-bot/core";
import { signIn, signOut } from "@/auth";
import { GoogleG } from "@/components/brand";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink } from "@/components/ui";

export function SignedInAccountNotice({ email }: { email?: string | null }) {
  if (!email) return null;
  return (
    <p className="mt-3 text-body text-muted-foreground">
      {ACCESS_TEXT.signedInAs} <strong className="break-all font-semibold text-foreground">{email}</strong>.
    </p>
  );
}

export function AccountSwitchActions({
  retryHref = "/",
  className = "mt-6 flex flex-col gap-2",
}: {
  retryHref?: "/" | "/inicio";
  className?: string;
}) {
  return (
    <div className={className}>
      <form
        action={async () => {
          "use server";
          await signOut({ redirect: false });
          // Solo este botón pide elegir cuenta; el login normal no cambia (R15).
          await signIn("google", { redirectTo: "/" }, { prompt: "select_account consent" });
        }}
      >
        <SubmitButton variant="secondary" size="lg" className="w-full" pendingLabel={ACCESS_TEXT.useOtherAccountPending}>
          <GoogleG />
          {ACCESS_TEXT.useOtherAccount}
        </SubmitButton>
      </form>
      <ButtonLink href={retryHref} variant="plain" size="lg" className="w-full" prefetch={false}>
        {ACCESS_TEXT.retry}
      </ButtonLink>
    </div>
  );
}

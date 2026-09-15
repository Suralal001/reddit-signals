import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { PasswordForm } from "@/components/password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title={user.mustChange ? "Choose a password" : "Change your password"}
        sub={
          user.mustChange
            ? "You were given a temporary one. Pick your own before going any further."
            : "Changing it signs out every other session on your account."
        }
      />
      <PasswordForm />
    </div>
  );
}

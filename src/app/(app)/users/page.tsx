import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/auth-actions";
import { PageHeader } from "@/components/ui";
import { UserAdmin } from "@/components/user-admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireAdmin();
  const users = await listUsers();
  return (
    <>
      <PageHeader
        title="People with access"
        sub={`${users.filter((u) => !u.disabled).length} active · everything posted from this app is attributed to a real account`}
      />
      <UserAdmin users={users} meId={me.id} />
    </>
  );
}

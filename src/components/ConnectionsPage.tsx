import { ConnectionsTab } from "@/components/dashboard/investor-detail/ConnectionsTab";
import { useAuth } from "@/hooks/useAuth";

export function ConnectionsPage() {
  const { user } = useAuth();

  return (
    <ConnectionsTab
      investorName=""
      currentUserId={user?.id}
    />
  );
}

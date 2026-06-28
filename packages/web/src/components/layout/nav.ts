import {
  LayoutDashboard,
  Users,
  FolderTree,
  GitMerge,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional badge source key. */
  badge?: "conflicts";
}

export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Users },
  { to: "/viewer", label: "Drive Viewer", icon: FolderTree },
  { to: "/conflicts", label: "Conflicts", icon: GitMerge, badge: "conflicts" },
  { to: "/activity", label: "Activity", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

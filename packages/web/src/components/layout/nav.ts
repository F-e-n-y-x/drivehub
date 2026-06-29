import {
  LayoutDashboard,
  HardDrive,
  Repeat,
  FolderTree,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/remotes", label: "Remotes", icon: HardDrive },
  { to: "/jobs", label: "Jobs", icon: Repeat },
  { to: "/browser", label: "Browser", icon: FolderTree },
  { to: "/activity", label: "Activity", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

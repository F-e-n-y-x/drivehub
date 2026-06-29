import {
  LayoutDashboard,
  HardDrive,
  Repeat,
  FolderTree,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Settings, Terminal, and Logs are rendered separately at the bottom of the nav.
export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/remotes", label: "Remotes", icon: HardDrive },
  { to: "/jobs", label: "Jobs", icon: Repeat },
  { to: "/browser", label: "Browser", icon: FolderTree },
  { to: "/activity", label: "Activity", icon: ScrollText },
];

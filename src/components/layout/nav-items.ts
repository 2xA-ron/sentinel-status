import {
  Activity,
  AlertTriangle,
  Gauge,
  Globe,
  Server,
  Settings as SettingsIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  description: string;
}

export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Gauge, description: "Global health overview" },
  { to: "/monitors", label: "Monitors", icon: Activity, description: "All configured checks" },
  { to: "/incidents", label: "Incidents", icon: AlertTriangle, description: "Active and resolved" },
  { to: "/agents", label: "Agents", icon: Server, description: "Regions and agents preview" },
  { to: "/status", label: "Status page", icon: Globe, description: "Public status preview" },
  {
    to: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    description: "Defaults and appearance",
  },
];

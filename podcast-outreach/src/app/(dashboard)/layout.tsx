"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  FileEdit,
  BarChart3,
  Settings,
  Mic2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Discovery", href: "/discovery", icon: Search },
  { name: "Pipeline", href: "/", icon: LayoutDashboard },
  { name: "Drafts", href: "/drafts", icon: FileEdit },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200">
        <div className="flex h-16 items-center gap-2 px-6 border-b border-gray-200">
          <Mic2 className="h-8 w-8 text-slate-900" />
          <span className="font-semibold text-lg text-slate-900">Podcast Outreach</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

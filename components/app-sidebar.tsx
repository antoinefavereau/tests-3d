"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { technos, type Techno } from "@/lib/technos";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { BoxIcon } from "lucide-react";

const categoryLabels: Record<Techno["category"], string> = {
  library: "Libraries",
  framework: "Frameworks",
  engine: "Engines",
  native: "Native APIs",
};

const categoryOrder: Techno["category"][] = ["native", "library", "framework", "engine"];

function groupByCategory(technos: Techno[]) {
  return categoryOrder
    .map((cat) => ({
      category: cat,
      label: categoryLabels[cat],
      items: technos.filter((t) => t.category === cat),
    }))
    .filter((g) => g.items.length > 0);
}

export function AppSidebar() {
  const pathname = usePathname();
  const groups = groupByCategory(technos);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={`/${technos[0].slug}`}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <BoxIcon className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">3D Web Explorer</span>
                  <span className="text-xs text-muted-foreground">Compare technologies</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.category}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((techno) => {
                  const isActive = pathname === `/${techno.slug}`;
                  return (
                    <SidebarMenuItem key={techno.slug}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={techno.name}
                      >
                        <Link href={`/${techno.slug}`}>
                          <span>{techno.name}</span>
                          {techno.tags[0] && (
                            <Badge
                              variant="secondary"
                              className="ml-auto text-[10px] px-1.5 py-0 group-data-[collapsible=icon]:hidden"
                            >
                              {techno.tags[0]}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

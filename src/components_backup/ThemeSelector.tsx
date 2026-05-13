import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Sun,
  Zap,
  Palette
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ThemeSelectorProps {
  collapsed?: boolean;
}

export function ThemeSelector({ collapsed }: ThemeSelectorProps) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const applyTheme = (t: string) => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark", "theme-neon");

    if (t === "dark") {
      root.classList.add("dark");
    } else if (t === "neon") {
      root.classList.add("dark", "theme-neon");
    } else {
      root.classList.add("light");
    }
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={collapsed ? "icon" : "default"} className={cn("h-9", collapsed ? "w-9" : "w-full justify-start px-2")}>
          <Palette className={cn("h-4 w-4", collapsed ? "" : "mr-2 text-zinc-500")} />
          {!collapsed && <span className="text-zinc-500">Tema</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={collapsed ? "center" : "start"} side={collapsed ? "right" : "top"}>
        <DropdownMenuItem onClick={() => handleThemeChange("light")}>
          <Sun className="h-4 w-4 mr-2" />
          <span>Claro</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
          <Moon className="h-4 w-4 mr-2" />
          <span>Oscuro</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeChange("neon")}>
          <Zap className="h-4 w-4 mr-2 text-magenta-500" />
          <span>Neon</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

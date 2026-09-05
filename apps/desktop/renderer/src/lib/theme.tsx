import { createContext, useContext, useEffect } from "react";

// Dark mode removed — app is always light.
const ThemeContext = createContext<{ theme: "light"; setTheme: (_: string) => void }>({
  theme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("pg-theme");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "light", setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

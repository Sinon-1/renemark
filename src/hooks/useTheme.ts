import { useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(true); // always start in dark mode
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

import { useEffect, useState } from "react"

// Detect mobile by screen size
// Landscape phones: height < 500px (regardless of width)
// Portrait phones: width < 768px
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    const isSmallHeight = window.innerHeight < 500; // Landscape phone
    const isSmallWidth = window.innerWidth < 768; // Portrait phone
    return isSmallHeight || isSmallWidth;
  });

  useEffect(() => {
    const checkMobile = () => {
      const isSmallHeight = window.innerHeight < 500;
      const isSmallWidth = window.innerWidth < 768;
      setIsMobile(isSmallHeight || isSmallWidth);
    };

    window.addEventListener("resize", checkMobile);
    checkMobile();
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

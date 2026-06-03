import { createContext, useContext, useState, useEffect } from "react";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [isMounted, setIsMounted] = useState(false);
  const [hsk, setHsk] = useState(null);
  const [viewMode, setViewMode] = useState("HPE");

  useEffect(() => {
    const savedMode = localStorage.getItem("viewMode");
    if (savedMode) setViewMode(savedMode);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && hsk) localStorage.setItem("hsk", hsk);
  }, [hsk, isMounted]);

  useEffect(() => {
    if (isMounted) localStorage.setItem("viewMode", viewMode);
  }, [viewMode, isMounted]);

  return (
    <AppContext.Provider value={{ isMounted, hsk, setHsk, viewMode, setViewMode }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

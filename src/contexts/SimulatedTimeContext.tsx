"use client";

import React, { createContext, useContext, useEffect } from "react";

interface SimulatedTimeContextType {
  simulatedTime: Date | null;
  setSimulatedTime: (date: Date | null) => void;
  getNow: () => Date;
}

const SimulatedTimeContext = createContext<SimulatedTimeContextType>({
  simulatedTime: null,
  setSimulatedTime: () => {},
  getNow: () => new Date(),
});

export const SimulatedTimeProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    try {
      localStorage.removeItem('simulatedTimeOffsetMs');
    } catch (e) {}
  }, []);

  const setSimulatedTime = (_date: Date | null) => {
    try {
      localStorage.removeItem('simulatedTimeOffsetMs');
    } catch (e) {}
  };

  const getNow = () => {
    return new Date();
  };

  return (
    <SimulatedTimeContext.Provider value={{ simulatedTime: null, setSimulatedTime, getNow }}>
      {children}
    </SimulatedTimeContext.Provider>
  );
};

export const useSimulatedTime = () => useContext(SimulatedTimeContext);

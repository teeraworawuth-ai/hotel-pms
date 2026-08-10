"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

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
  const [simulatedTime, setSimulatedTimeState] = useState<Date | null>(null);
  const [timeOffsetMs, setTimeOffsetMs] = useState<number | null>(null);

  const setSimulatedTime = (date: Date | null) => {
    setSimulatedTimeState(date);
    if (date) {
      setTimeOffsetMs(date.getTime() - Date.now());
    } else {
      setTimeOffsetMs(null);
    }
  };

  const getNow = () => {
    if (timeOffsetMs !== null) {
      return new Date(Date.now() + timeOffsetMs);
    }
    return new Date();
  };

  return (
    <SimulatedTimeContext.Provider value={{ simulatedTime, setSimulatedTime, getNow }}>
      {children}
    </SimulatedTimeContext.Provider>
  );
};

export const useSimulatedTime = () => useContext(SimulatedTimeContext);

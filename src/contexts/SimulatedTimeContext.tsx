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

  useEffect(() => {
    try {
      const savedOffset = localStorage.getItem('simulatedTimeOffsetMs');
      if (savedOffset) {
        const offset = Number(savedOffset);
        setTimeOffsetMs(offset);
        setSimulatedTimeState(new Date(Date.now() + offset));
      }
    } catch (e) {}
  }, []);

  const setSimulatedTime = (date: Date | null) => {
    setSimulatedTimeState(date);
    if (date) {
      const offset = date.getTime() - Date.now();
      setTimeOffsetMs(offset);
      try {
        localStorage.setItem('simulatedTimeOffsetMs', offset.toString());
      } catch (e) {}
    } else {
      setTimeOffsetMs(null);
      try {
        localStorage.removeItem('simulatedTimeOffsetMs');
      } catch (e) {}
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

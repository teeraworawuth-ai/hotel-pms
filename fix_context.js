const fs = require('fs');
let code = fs.readFileSync('src/contexts/SimulatedTimeContext.tsx', 'utf8');

const newLogic = `  const [simulatedTime, setSimulatedTimeState] = useState<Date | null>(null);
  const [timeOffsetMs, setTimeOffsetMs] = useState<number | null>(null);

  useEffect(() => {
    try {
      const savedOffset = sessionStorage.getItem('simulatedTimeOffsetMs');
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
        sessionStorage.setItem('simulatedTimeOffsetMs', offset.toString());
      } catch (e) {}
    } else {
      setTimeOffsetMs(null);
      try {
        sessionStorage.removeItem('simulatedTimeOffsetMs');
      } catch (e) {}
    }
  };`;

// Use simple string replacement
const searchStr = `  const [simulatedTime, setSimulatedTimeState] = useState<Date | null>(null);
  const [timeOffsetMs, setTimeOffsetMs] = useState<number | null>(null);

  const setSimulatedTime = (date: Date | null) => {
    setSimulatedTimeState(date);
    if (date) {
      setTimeOffsetMs(date.getTime() - Date.now());
    } else {
      setTimeOffsetMs(null);
    }
  };`;

code = code.replace(searchStr, newLogic);

fs.writeFileSync('src/contexts/SimulatedTimeContext.tsx', code);
console.log('Fixed SimulatedTimeContext');

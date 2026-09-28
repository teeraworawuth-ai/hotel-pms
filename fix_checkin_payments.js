const fs = require('fs');
let content = fs.readFileSync('src/app/components/RoomCheckinModal.tsx', 'utf8');

const importStr = `import { RoomStatus } from "../checkin/page";`;
if(!content.includes('type LedgerTransaction')) {
  content = content.replace(importStr, importStr + '\n\ntype LedgerTransaction = { id: string, category: string, amount: number, created_at: string, notes?: string };');
}

const stateStr = `  const [isScanningSlip, setIsScanningSlip] = useState(false);`;
if(!content.includes('pastPayments')) {
  content = content.replace(stateStr, stateStr + '\n  const [pastPayments, setPastPayments] = useState<LedgerTransaction[]>([]);');
}

const fetchStr = `    useEffect(() => {
      const fetchBaseData = async () => {`;
if(!content.includes('fetchPastPayments')) {
  content = content.replace(fetchStr, `    useEffect(() => {
      const fetchPastPayments = async () => {
        if (room.booking_id) {
          const { data } = await supabase.from('ledger_transactions')
            .select('*')
            .eq('booking_id', room.booking_id)
            .lt('amount', 0)
            .order('created_at', { ascending: true });
          if (data) setPastPayments(data);
        }
      };
      fetchPastPayments();\n\n      const fetchBaseData = async () => {`);
}

fs.writeFileSync('src/app/components/RoomCheckinModal.tsx', content, 'utf8');

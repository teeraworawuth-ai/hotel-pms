const fs = require('fs');
let content = fs.readFileSync('src/app/components/Navbar.tsx', 'utf8');

const lines = content.split(/\r?\n/);
const funcIdx = lines.findIndex(l => l.includes('export default function Navbar() {'));

if (funcIdx !== -1 && !content.includes('const [userRole, setUserRole]')) {
  const injection = `
  const [userRole, setUserRole] = useState<string | null>(null);
  
  useEffect(() => {
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      setUserRole(JSON.parse(saved).role);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    window.location.href = '/';
  };
`;
  lines.splice(funcIdx + 3, 0, injection);
  
  // also fix line 94
  const line94 = lines.findIndex((l, i) => i > 50 && l.includes('{navLinks.map((link) => {'));
  if (line94 !== -1) {
    lines[line94] = lines[line94].replace('{navLinks.map((link) => {', '{navLinks.filter(link => userRole !== "staff" || link.href === "/checkin").map((link) => {');
  }
  
  fs.writeFileSync('src/app/components/Navbar.tsx', lines.join('\n'), 'utf8');
  console.log('Fixed Navbar using array index');
}

const fs = require('fs');
let content = fs.readFileSync('src/app/components/Navbar.tsx', 'utf8');

if (!content.includes('import { useState, useEffect }')) {
  content = content.replace('import { useState } from "react";', 'import { useState, useEffect } from "react";');
}

const targetStr = `export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();`;

const newStr = `export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  
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

content = content.replace(targetStr, newStr);

content = content.replace('{navLinks.map((link) => {', '{navLinks.filter(link => userRole !== "staff" || link.href === "/checkin").map((link) => {');
content = content.replace('{navLinks.map((link) => (', '{navLinks.filter(link => userRole !== "staff" || link.href === "/checkin").map((link) => (');

content = content.replace('<ShiftManager />', '{userRole !== "staff" && <ShiftManager />}');

const logoutButtonDesktop = `
            {userRole !== "staff" && <ShiftManager />}
            <button onClick={handleLogout} className="text-red-500 font-bold text-sm ml-4 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50">Logout</button>
`;
content = content.replace('{userRole !== "staff" && <ShiftManager />}', logoutButtonDesktop);

fs.writeFileSync('src/app/components/Navbar.tsx', content, 'utf8');
console.log('Fixed Navbar');

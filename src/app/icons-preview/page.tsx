export default function IconsPreviewPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12">
      <h1 className="text-3xl font-black text-slate-800 border-b border-slate-200 pb-4">
        🎨 Icon Design Previews
      </h1>
      <p className="text-slate-500">
        หน้านี้ถูกสร้างขึ้นมาเป็นพิเศษเพื่อให้คุณสามารถเลือกรูปแบบไอคอนที่คุณถูกใจที่สุดได้ครับ โดยยังไม่ได้อัปเดตไปยังหน้า Dashboard จริง
      </p>

      {/* Twin Beds Options */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">1. เตียงคู่ (Twin Beds)</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Option A */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-slate-700 opacity-90 drop-shadow-sm">
                <rect x="2" y="4" width="9" height="16" rx="2" fill="#94a3b8"/>
                <rect x="3.5" y="5.5" width="6" height="3.5" rx="1" fill="#f8fafc"/>
                <rect x="2" y="11" width="9" height="9" rx="2" fill="#475569"/>
                <rect x="13" y="4" width="9" height="16" rx="2" fill="#94a3b8"/>
                <rect x="14.5" y="5.5" width="6" height="3.5" rx="1" fill="#f8fafc"/>
                <rect x="13" y="11" width="9" height="9" rx="2" fill="#475569"/>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option A</h3>
              <p className="text-xs text-slate-500 mt-1">แบบทึบ มีมิติคล้าย Emoji</p>
            </div>
          </div>

          {/* Option B */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-slate-700 opacity-80">
                <path fillRule="evenodd" d="M3 6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6zm2 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8zm10-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V6zm2 2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V8z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option B</h3>
              <p className="text-xs text-slate-500 mt-1">แบบแบนราบ มินิมอล (สีเดียว)</p>
            </div>
          </div>

          {/* Option C */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-slate-600 opacity-80">
                  <path fillRule="evenodd" d="M6 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6zm2 2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-black text-slate-500 ml-1">x2</span>
              </div>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option C</h3>
              <p className="text-xs text-slate-500 mt-1">เตียงเดี่ยว + ข้อความ x2</p>
            </div>
          </div>

          {/* Option D */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <span className="text-3xl grayscale drop-shadow-sm">🛏️🛏️</span>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option D</h3>
              <p className="text-xs text-slate-500 mt-1">Emoji หันข้างแบบเดิม (ถูกปรับเป็นสีเทา)</p>
            </div>
          </div>

        </div>
      </section>

      {/* Balcony Options */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">2. ระเบียง (Balcony)</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Option A */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <img src="/balcony.png" className="w-8 h-8 object-contain mix-blend-multiply opacity-80 drop-shadow-sm" alt="ระเบียง" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option A</h3>
              <p className="text-xs text-slate-500 mt-1">รูปไอคอนดั้งเดิมที่คุณอัปโหลดให้ (PNG)</p>
            </div>
          </div>

          {/* Option B */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-slate-600 opacity-80">
                <path d="M4 14h16M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M4 14l1.5-6h13l1.5 6M8 14v8M12 14v8M16 14v8" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option B</h3>
              <p className="text-xs text-slate-500 mt-1">ลายเส้นระเบียง (SVG Outline)</p>
            </div>
          </div>

          {/* Option C */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <span className="text-3xl grayscale drop-shadow-sm">🪴</span>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option C</h3>
              <p className="text-xs text-slate-500 mt-1">Emoji กระถางต้นไม้ (นิยมใช้แทนระเบียงห้องพัก)</p>
            </div>
          </div>

          {/* Option D */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <span className="text-3xl grayscale drop-shadow-sm">🪑</span>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option D</h3>
              <p className="text-xs text-slate-500 mt-1">Emoji เก้าอี้ (สื่อถึงพื้นที่นั่งเล่นนอกระเบียง)</p>
            </div>
          </div>

        </div>
      </section>

      {/* Window Options */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">3. หน้าต่าง (Window)</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Option A */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <span className="text-3xl grayscale drop-shadow-sm">🪟</span>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option A</h3>
              <p className="text-xs text-slate-500 mt-1">Emoji หน้าต่างเดิม (ปัจจุบัน)</p>
            </div>
          </div>

          {/* Option B */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-slate-600 opacity-80">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M4 12h16M12 4v16" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option B</h3>
              <p className="text-xs text-slate-500 mt-1">ลายเส้นหน้าต่าง 4 บาน (SVG Outline)</p>
            </div>
          </div>

          {/* Option C */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-8 h-8 opacity-90 drop-shadow-sm">
                <rect x="3" y="3" width="18" height="18" rx="2" fill="#94a3b8" />
                <rect x="5" y="5" width="6" height="14" rx="1" fill="#e2e8f0" />
                <rect x="13" y="5" width="6" height="14" rx="1" fill="#e2e8f0" />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option C</h3>
              <p className="text-xs text-slate-500 mt-1">หน้าต่างแบบทึบ (Solid SVG)</p>
            </div>
          </div>

          {/* Option D */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-4 shadow-sm">
            <div className="h-16 flex items-center justify-center">
              <span className="text-3xl grayscale drop-shadow-sm">🏙️</span>
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-700">Option D</h3>
              <p className="text-xs text-slate-500 mt-1">Emoji วิวเมือง (สื่อถึงหน้าต่างที่มีวิว)</p>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
}

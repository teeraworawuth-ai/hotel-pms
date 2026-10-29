"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { renderIcon } from "../components/RoomIcons";
import RoomCheckinModal from "@/app/components/RoomCheckinModal";
import CleaningNoteModal from "@/app/components/CleaningNoteModal";
import { useSimulatedTime } from "@/contexts/SimulatedTimeContext";
import { useShift } from "@/contexts/ShiftContext";
import ShiftManager from "@/app/components/ShiftManager";
import { logActivity } from "@/lib/activityLog";
import { computeActiveHeldDeposit, computeKeyDepositParts } from "@/lib/keyDeposit";
import {
  addDaysStr,
  atLocalTime,
  EOD_KEY_PREFIX,
  EOD_LOC_KEY_PREFIX,
  HANDOVER_KEY_PREFIX,
  inferShiftLocation,
  saveShiftBusinessDate,
  SHIFT_BD_KEY_PREFIX,
} from "@/lib/cashHandover";

export type GroupBookingRoomItem = {
  bookingId: string;
  roomId: string;
  roomNo: string;
  location?: string | null;
  price?: number;
  isMaster?: boolean;
};

export type GroupBookingInfo = {
  groupId: string;
  masterBookingId: string;
  masterRoomId: string;
  masterRoomNo: string;
  rooms: GroupBookingRoomItem[];
};

export type RoomStatus = {
  id: string;
  room_no: string;
  room_type: string;
  location: string | null;
  sort_order: number;
  status: 'available' | 'occupied' | 'dirty' | 'cleaning' | 'reserved' | null;
  stay_type: 'overnight' | 'short_stay' | null;
  check_in_time: string | null;
  check_out_time: string | null;
  guest_count: number | null;
  guest_name?: string | null;
  has_upcoming?: boolean;
  upcoming_days?: number[];
  incoming_today?: boolean;
  price_night?: number;
  price_temp?: number;
  key_deposit?: number;
  actual_price?: number;
  staff_name?: string | null;
  guest_phone?: string | null;
  booking_id?: string;
  booking_created_at?: string;
  unpaid_balance?: number;
  total_charges?: number;
  total_payments?: number;
  c_all?: number;
  c_today?: number;
  has_key_deposit?: boolean;
  held_key_deposit?: number;
  booking_note?: string | null;
  group_info?: GroupBookingInfo | null;
  is_group_master?: boolean;
  map_x?: number;
  map_y?: number;
  map_width?: number;
  map_height?: number;
};

export default function CheckinPage() {
  const { getNow, simulatedTime } = useSimulatedTime();
  const {
    activeShift,
    openShifts,
    currentUser,
    refreshShift,
    getActiveBusinessDate,
    realClockBusinessDate,
    closeDayBusinessDate,
    closeDayMismatchReason,
  } = useShift();

  const [rooms, setRooms] = useState<RoomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationsOrder, setLocationsOrder] = useState<string[]>([]);
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomStatus | null>(null);
  const [noteRoom, setNoteRoom] = useState<{ id: string; room_no: string } | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [expandedKeyLocs, setExpandedKeyLocs] = useState<Record<string, boolean>>({});
  const [floorPlans, setFloorPlans] = useState<Record<string, string>>({});
  const [netRevenueByLoc, setNetRevenueByLoc] = useState<Record<string, number>>({});

  // Modal สำหรับ Admin/Manager: บังคับตัดรอบข้ามวัน (Close Day) และ รีเซ็ตระบบเป็น 0 ทุกสถานที่
  const [adminActionModal, setAdminActionModal] = useState<'force_close_day' | 'reset_all_zero' | null>(null);
  const [adminPin, setAdminPin] = useState("");
  const [adminPinError, setAdminPinError] = useState("");
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [showUnpaidSummary, setShowUnpaidSummary] = useState(false);

  // สำหรับจับเวลา Double Tap ของแม่บ้านบนหน้ากระดานหลัก
  const lastTapRef = useRef<{ [key: string]: number }>({});
  const tapTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});
  const didAutoSelectPrimaryRef = useRef(false);

  // บันทึกประวัติแม่บ้าน (ไม่บล็อกการเปลี่ยนสถานะห้องหากล้มเหลว)
  const logHousekeeping = async (room: RoomStatus, action: 'start' | 'done' | 'cancel') => {
    try {
      if (action === 'start') {
        await supabase.from('housekeeping_logs').insert({ room_id: room.id, room_no: room.room_no, location: room.location || null, status: 'cleaning' });
      } else {
        const { data } = await supabase.from('housekeeping_logs').select('id').eq('room_id', room.id).eq('status', 'cleaning').order('started_at', { ascending: false }).limit(1);
        if (data && data[0]) {
          await supabase.from('housekeeping_logs').update({ status: action === 'done' ? 'done' : 'cancelled', finished_at: new Date().toISOString() }).eq('id', data[0].id);
        }
      }
    } catch (e) { console.warn('housekeeping log failed', e); }
  };

  const handleRoomClick = async (room: RoomStatus) => {
    if (room.status === 'dirty' || room.status === 'cleaning') {
      if (isStaff && !authUser?.can_clean && !activeShift?.can_clean) {
        alert('ผู้ใช้นี้ไม่มีสิทธิ์ทำความสะอาดห้อง');
        return;
      }
      const now = Date.now();
      const lastTap = lastTapRef.current[room.id] || 0;
      const timeSinceLastTap = now - lastTap;
      
      lastTapRef.current[room.id] = now;

      if (timeSinceLastTap < 400 && timeSinceLastTap > 0) {
        if (tapTimeoutRef.current[room.id]) {
          clearTimeout(tapTimeoutRef.current[room.id]);
        }
        
        if (room.status === 'cleaning') {
          logHousekeeping(room, 'done');
          setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: 'available', current_status: 'ว่าง' } : r));
          await supabase.from('rooms').update({ status: 'available', current_status: 'ว่าง' }).eq('id', room.id);
        }
        lastTapRef.current[room.id] = 0;
      } else {
        if (tapTimeoutRef.current[room.id]) {
          clearTimeout(tapTimeoutRef.current[room.id]);
        }
        
        tapTimeoutRef.current[room.id] = setTimeout(async () => {
          if (room.status === 'dirty') {
            const location = room.location;
            const concurrentCount = rooms.filter(r => r.location === location && r.status === 'cleaning').length;
            if (concurrentCount >= 3) {
              alert(`พื้นที่ ${location || 'โซนนี้'} มีแม่บ้านกำลังทำความสะอาดครบ 3 ห้องแล้ว (โปรดกดเสร็จสิ้นห้องที่ทำเสร็จก่อน)`);
              return;
            }
            
            setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: 'cleaning', current_status: 'กำลังทำความสะอาด' } : r));
            logHousekeeping(room, 'start');
            await supabase.from('rooms').update({ status: 'cleaning', current_status: 'กำลังทำความสะอาด' }).eq('id', room.id);
          } else if (room.status === 'cleaning') {
            setRooms(prev => prev.map(r => r.id === room.id ? { ...r, status: 'dirty', current_status: 'รอทำความสะอาด' } : r));
            logHousekeeping(room, 'cancel');
            await supabase.from('rooms').update({ status: 'dirty', current_status: 'กำลังทำความสะอาด' }).eq('id', room.id);
          }
        }, 400);
      }
    } else {
      if (isHousekeeper || activeShift?.housekeeper_only) return;
      setSelectedRoom(room);
    }
  };

  // 0 = Today, -1 = Yesterday, 1 = Tomorrow
  const [dateOffset, setDateOffset] = useState<number>(0);

  const [authUser, setAuthUser] = useState<{
    id: string;
    name: string;
    role: string;
    locations?: string[];
    primary_location?: string | null;
    can_clean?: boolean;
  } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('auth_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setAuthUser({ ...parsed, role: String(parsed.role || 'admin').toLowerCase() });
        }
      } catch (e) {}
    }
  }, [currentUser]);

  const effectiveUser = currentUser || authUser;
  const isManagerOrAdmin = !effectiveUser || effectiveUser.role === 'admin' || effectiveUser.role === 'manager';
  const isHousekeeper = effectiveUser?.role === 'housekeeper' || activeShift?.housekeeper_only === true;
  const isStaff = !isManagerOrAdmin && !isHousekeeper;

  // สถานที่หลักของพนักงาน (1 แห่งเท่านั้น)
  const userPrimaryLocation =
    effectiveUser?.primary_location ||
    effectiveUser?.locations?.[0] ||
    inferShiftLocation(effectiveUser?.name, null, effectiveUser?.locations) ||
    null;

  // เมื่อพนักงาน (Staff) เข้าหน้านี้ครั้งแรก ให้เลือกตัวกรองเป็น "สถานที่หลัก" อัตโนมัติทันที เพื่อป้องกันการกดจอง/เช็คอินผิดสถานที่
  useEffect(() => {
    if (!didAutoSelectPrimaryRef.current && isStaff && userPrimaryLocation) {
      didAutoSelectPrimaryRef.current = true;
      setSelectedLocationFilter(userPrimaryLocation);
    }
  }, [isStaff, userPrimaryLocation]);

  useEffect(() => {
    if (isHousekeeper && dateOffset !== 0) {
      setDateOffset(0);
    }
  }, [isHousekeeper, dateOffset]);

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    window.location.href = '/';
  };

  const [smartPricesMap, setSmartPricesMap] = useState<Record<string, number>>({});
  const [roomIconsMap, setRoomIconsMap] = useState<Record<string, string[]>>({});

  const getBusinessDate = (_date?: Date) => {
    return getActiveBusinessDate();
  };

  const fetchData = async (silentRefresh = false) => {
    if (!silentRefresh) setLoading(true);
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "locations_order")
      .maybeSingle();
    
    if (settingsData && settingsData.value) {
      setLocationsOrder(settingsData.value as string[]);
    }

    const { data: planData } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "floor_plans")
      .maybeSingle();
      
    if (planData && planData.value) {
      setFloorPlans(planData.value as Record<string, string>);
    }

    const { data: roomsData, error } = await supabase
      .from("rooms")
      .select("id, room_no, room_type, location, sort_order, status, stay_type, check_in_time, check_out_time, guest_count, price_night, price_temp, actual_price, staff_name, key_deposit");
    
    if (error) {
      console.error("Error fetching rooms:", error);
      setLoading(false);
      return;
    }

    const allRooms = roomsData as RoomStatus[];
    const roomLocById: Record<string, string> = {};
    allRooms.forEach(r => {
      roomLocById[r.id] = r.location || "ทั่วไป";
    });

    const targetDate = getBusinessDate(getNow());
    targetDate.setDate(targetDate.getDate() + dateOffset);
    
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
    const endOfNext7Days = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 7, 23, 59, 59);

    const { data: allTargetBookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("*")
      .neq("status", "cancelled")
      .neq("status", "checked_out")
      .lte("check_in_time", endOfNext7Days.toISOString())
      .gt("check_out_time", startOfDay.toISOString());

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
    }

    const activeBookingIds = allTargetBookings?.map(b => b.id) || [];
    const financialSummary: Record<string, { charges: number, payments: number, balance: number, c_all: number, c_today: number, has_key_deposit?: boolean }> = {};
    const ledgersByBooking: Record<string, { booking_id: string; amount: number; category: string; transaction_type: string }[]> = {};
    const heldDepositByBooking: Record<string, number> = {};
    const bookingMetaMap: Record<string, { bookingNote?: string; groupInfo?: GroupBookingInfo }> = {};
      
    const dailyRatesMap: Record<string, number> = {};
    const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}`;
    
    const { data: dailySetting } = await supabase.from('daily_pricing_settings').select('rate_plan_id').eq('target_date', targetDateStr).maybeSingle();
    if (dailySetting?.rate_plan_id) {
      const { data: basePrices } = await supabase.from('rate_plan_room_types').select('room_type, base_price').eq('rate_plan_id', dailySetting.rate_plan_id);
      const { data: calPrices } = await supabase.from('rate_plan_calendar').select('room_type, price').eq('rate_plan_id', dailySetting.rate_plan_id).eq('target_date', targetDateStr);
      
      const pricesMap: Record<string, number> = {};
      if (basePrices) {
        basePrices.forEach(b => pricesMap[b.room_type] = b.base_price);
      }
      if (calPrices) {
        calPrices.forEach(c => pricesMap[c.room_type] = c.price);
      }
      setSmartPricesMap(pricesMap);
    } else {
      setSmartPricesMap({});
    }
    
    const { data: iconData } = await supabase.from('system_settings').select('value').eq('key', 'room_icons_map').maybeSingle();
    if (iconData && iconData.value) {
      const parsedIcons = typeof iconData.value === 'object' ? iconData.value : {};
      for (const k in parsedIcons) {
        if (typeof parsedIcons[k] === 'string') parsedIcons[k] = [parsedIcons[k]];
      }
      setRoomIconsMap(parsedIcons);
    } else {
      setRoomIconsMap({});
    }
    
    if (activeBookingIds.length > 0) {
      const metaKeys = activeBookingIds.map(id => `booking_meta_${id}`);
      const [{ data: allDailyRates }, { data: allDailyExtras }, { data: metaRows }] = await Promise.all([
        supabase
          .from('booking_daily_rates')
          .select('booking_id, amount, target_date')
          .in('booking_id', activeBookingIds),
        supabase
          .from('booking_daily_extras')
          .select('booking_id, amount, target_date, category')
          .in('booking_id', activeBookingIds),
        supabase
          .from('system_settings')
          .select('key, value')
          .in('key', metaKeys)
      ]);

      if (metaRows) {
        metaRows.forEach((row: any) => {
          const bid = String(row.key || '').replace('booking_meta_', '');
          if (bid && row.value && typeof row.value === 'object') {
            bookingMetaMap[bid] = {
              bookingNote: row.value.bookingNote || undefined,
              groupInfo: row.value.groupInfo || undefined,
            };
          }
        });
      }

      const futureUnpostedByBooking: Record<string, number> = {};
      const dailyRatesUpToTodayByBooking: Record<string, number> = {};

      if (allDailyRates) {
        allDailyRates.forEach(dr => {
          if (!financialSummary[dr.booking_id]) {
            financialSummary[dr.booking_id] = { charges: 0, payments: 0, balance: 0, c_all: 0, c_today: 0 };
          }
          const amt = Number(dr.amount || 0);
          financialSummary[dr.booking_id].c_all += amt;
          if (String(dr.target_date || '') > targetDateStr) {
            futureUnpostedByBooking[dr.booking_id] = (futureUnpostedByBooking[dr.booking_id] || 0) + amt;
          } else {
            dailyRatesUpToTodayByBooking[dr.booking_id] = (dailyRatesUpToTodayByBooking[dr.booking_id] || 0) + amt;
          }
          if (dr.target_date === targetDateStr) {
            dailyRatesMap[dr.booking_id] = amt;
          }
        });
      }

      if (allDailyExtras) {
        allDailyExtras.forEach(de => {
          if (String(de.category || '').includes('(Voided)')) return;
          if (!financialSummary[de.booking_id]) {
            financialSummary[de.booking_id] = { charges: 0, payments: 0, balance: 0, c_all: 0, c_today: 0 };
          }
          if (String(de.target_date || '') > targetDateStr) {
            financialSummary[de.booking_id].c_all += Number(de.amount);
            futureUnpostedByBooking[de.booking_id] = (futureUnpostedByBooking[de.booking_id] || 0) + Number(de.amount || 0);
          }
        });
      }

      const { data: ledgers, error: ledgerError } = await supabase
        .from('ledger_transactions')
        .select('booking_id, amount, category, transaction_type')
        .in('booking_id', activeBookingIds);
        
      if (!ledgerError && ledgers) {
        const postedRoomChargesByBooking: Record<string, number> = {};
        const depositPlacedByBooking: Record<string, number> = {};
        ledgers.forEach(tx => {
          if (tx.booking_id) {
            if (!ledgersByBooking[tx.booking_id]) ledgersByBooking[tx.booking_id] = [];
            ledgersByBooking[tx.booking_id].push(tx);
          }
        });
        Object.entries(ledgersByBooking).forEach(([bid, txs]) => {
          const validTxs = txs.filter(t => !String(t.category || '').includes('(Voided)'));
          heldDepositByBooking[bid] = computeActiveHeldDeposit(validTxs, futureUnpostedByBooking[bid] || 0);
          depositPlacedByBooking[bid] = computeKeyDepositParts(validTxs, futureUnpostedByBooking[bid] || 0).placed;
        });
        ledgers.forEach(tx => {
          if (tx.booking_id) {
            const cat = String(tx.category || '');
            if (cat.includes('(Voided)')) return;
            if (!financialSummary[tx.booking_id]) {
              financialSummary[tx.booking_id] = { charges: 0, payments: 0, balance: 0, c_all: 0, c_today: 0, has_key_deposit: false };
            }
            const amt = Number(tx.amount);
            const isDepositRow = amt > 0 && (cat === 'key_deposit' || cat.includes('มัดจำกุญแจ'));
            const isDepositRefund = amt < 0 && cat.includes('คืนมัดจำกุญแจ');
            const isChangeRefund = amt < 0 && cat.includes('คืนเงินทอน');
            if (isDepositRefund) return;

            if (isChangeRefund) {
              financialSummary[tx.booking_id].payments = Math.max(0, financialSummary[tx.booking_id].payments - Math.abs(amt));
              financialSummary[tx.booking_id].balance += Math.abs(amt);
              return;
            }

            if (!isDepositRow) financialSummary[tx.booking_id].balance += amt;
            
            if (amt > 0) {
              const isKeyDeposit = cat === 'key_deposit' || cat.includes('มัดจำกุญแจ');
              if (isKeyDeposit) {
                financialSummary[tx.booking_id].has_key_deposit = true;
              } else {
                financialSummary[tx.booking_id].charges += amt;
                financialSummary[tx.booking_id].c_today += amt;
                if (cat === 'ค่าห้องพัก' || cat === 'room_charge') {
                  postedRoomChargesByBooking[tx.booking_id] = (postedRoomChargesByBooking[tx.booking_id] || 0) + amt;
                } else {
                  financialSummary[tx.booking_id].c_all += amt;
                }
              }
            } else {
              financialSummary[tx.booking_id].payments += Math.abs(amt);
            }
          }
        });

        // ปรับปรุงยอดค่าห้องพักรายวัน (booking_daily_rates) ที่ถึงกำหนดแล้วแต่ยังไม่มีแถว room_charge ใน ledger + บวกเงินมัดจำกุญแจที่กันไว้เข้าในดุลค้างชำระ (ให้ตรงกับรายงานประจำวัน 100%)
        activeBookingIds.forEach(bid => {
          const bObj = allTargetBookings?.find(b => b.id === bid);
          if (!bObj || bObj.status === 'reserved' || bObj.status === 'cancelled') return;
          if (!financialSummary[bid]) {
            financialSummary[bid] = { charges: 0, payments: 0, balance: 0, c_all: 0, c_today: 0, has_key_deposit: false };
          }
          const drUpToToday = dailyRatesUpToTodayByBooking[bid] || 0;
          const postedRoom = postedRoomChargesByBooking[bid] || 0;
          if (drUpToToday > postedRoom) {
            const unpostedDiff = drUpToToday - postedRoom;
            financialSummary[bid].charges += unpostedDiff;
            financialSummary[bid].c_today += unpostedDiff;
            financialSummary[bid].balance += unpostedDiff;
          }
          const depPlaced = depositPlacedByBooking[bid] || 0;
          if (depPlaced > 0) {
            financialSummary[bid].balance += depPlaced;
          }
        });
      }

      // หากมีการเข้าพักเป็นกลุ่ม (groupInfo: มาด้วยกัน จ่ายรวมบิลที่ห้องหลัก) ให้รวมยอดค่าใช้จ่ายและยอดชำระเงินทั้งกลุ่มเข้าด้วยกัน
      // เพื่อให้ทั้งห้องหลักและห้องลูกแสดงสถานะชำระเงิน (สีเลขห้อง และดุลกลุ่ม) ถูกต้องตรงกัน
      const groupMembersByGroupId: Record<string, Set<string>> = {};
      Object.entries(bookingMetaMap).forEach(([bid, meta]) => {
        if (meta?.groupInfo?.groupId) {
          const gid = meta.groupInfo.groupId;
          if (!groupMembersByGroupId[gid]) groupMembersByGroupId[gid] = new Set();
          groupMembersByGroupId[gid].add(bid);
          (meta.groupInfo.rooms || []).forEach(r => {
            if (r.bookingId) groupMembersByGroupId[gid].add(r.bookingId);
          });
        }
      });

      Object.entries(groupMembersByGroupId).forEach(([_gid, bidSet]) => {
        const memberBids = Array.from(bidSet);
        if (memberBids.length <= 1) return;
        let grpCharges = 0;
        let grpPayments = 0;
        let grpBalance = 0;
        let grpCAll = 0;
        let grpCToday = 0;
        let grpHasKey = false;
        memberBids.forEach(bid => {
          const fs = financialSummary[bid];
          if (fs) {
            grpCharges += fs.charges || 0;
            grpPayments += fs.payments || 0;
            grpBalance += fs.balance || 0;
            grpCAll += fs.c_all || 0;
            grpCToday += fs.c_today || 0;
            if (fs.has_key_deposit) grpHasKey = true;
          }
        });
        memberBids.forEach(bid => {
          financialSummary[bid] = {
            charges: grpCharges,
            payments: grpPayments,
            balance: grpBalance,
            c_all: grpCAll,
            c_today: grpCToday,
            has_key_deposit: grpHasKey,
          };
        });
      });
    }

    // คำนวณยอดรายได้สุทธิวันนี้ (แยกตามสถานที่) สำหรับแสดงบนปุ่มกองและหัวข้อกอง
    try {
      const bdStartIso = atLocalTime(targetDateStr, 6, 45).toISOString();
      const bdEndIso = atLocalTime(addDaysStr(targetDateStr, 1), 6, 45).toISOString();
      const [{ data: todayRates }, { data: todayLedgers }] = await Promise.all([
        supabase
          .from("booking_daily_rates")
          .select("booking_id, amount, target_date")
          .eq("target_date", targetDateStr),
        supabase
          .from("ledger_transactions")
          .select("booking_id, room_id, shift_id, amount, category, transaction_type, created_at")
          .gte("created_at", bdStartIso)
          .lt("created_at", bdEndIso),
      ]);

      const rateBookingIds = Array.from(new Set((todayRates || []).map(r => r.booking_id).filter(Boolean)));
      const bookingRoomMap: Record<string, { room_id: string; status: string }> = {};
      (allTargetBookings || []).forEach(b => {
        bookingRoomMap[b.id] = { room_id: b.room_id, status: b.status };
      });
      const missingIds = rateBookingIds.filter(id => !bookingRoomMap[id]);
      if (missingIds.length > 0) {
        const { data: extraBookings } = await supabase
          .from("bookings")
          .select("id, room_id, status")
          .in("id", missingIds);
        (extraBookings || []).forEach((b: any) => {
          bookingRoomMap[b.id] = { room_id: b.room_id, status: b.status };
        });
      }

      const revByLoc: Record<string, number> = {};
      const countedOvernightBookings = new Set<string>();
      (todayRates || []).forEach((dr: any) => {
        const bInfo = bookingRoomMap[dr.booking_id];
        if (!bInfo || bInfo.status === "cancelled" || bInfo.status === "reserved") return;
        countedOvernightBookings.add(dr.booking_id);
        const loc = roomLocById[bInfo.room_id] || "ทั่วไป";
        revByLoc[loc] = (revByLoc[loc] || 0) + Number(dr.amount || 0);
      });

      const shiftLocById: Record<string, string> = {};
      openShifts.forEach(s => {
        if (s.shift_location) shiftLocById[s.id] = s.shift_location;
      });

      (todayLedgers || []).forEach((tx: any) => {
        const cat = String(tx.category || "");
        if (cat.includes("(Voided)")) return;
        const amt = Number(tx.amount || 0);
        if (tx.transaction_type === "revenue" && amt > 0) {
          if (cat === "key_deposit" || cat.includes("มัดจำกุญแจ")) return;
          if ((cat === "room_charge" || cat === "ค่าห้องพัก") && tx.booking_id && countedOvernightBookings.has(tx.booking_id)) {
            return;
          }
          const bInfo = tx.booking_id ? bookingRoomMap[tx.booking_id] : null;
          if (bInfo && bInfo.status === "reserved") return;
          const roomId = tx.room_id || bInfo?.room_id;
          const loc = (roomId && roomLocById[roomId]) || (tx.shift_id && shiftLocById[tx.shift_id]) || "ทั่วไป";
          revByLoc[loc] = (revByLoc[loc] || 0) + amt;
        } else if (tx.transaction_type === "expense" && amt > 0) {
          const roomId = tx.room_id;
          const loc = (roomId && roomLocById[roomId]) || (tx.shift_id && shiftLocById[tx.shift_id]) || activeShift?.shift_location || "ทั่วไป";
          revByLoc[loc] = (revByLoc[loc] || 0) - amt;
        }
      });

      setNetRevenueByLoc(revByLoc);
    } catch (e) {
      console.warn("compute netRevenueByLoc failed", e);
    }
  
    const getDailyPrice = (booking: any) => {
      if (!booking) return null;
      if (dailyRatesMap[booking.id] !== undefined) return dailyRatesMap[booking.id];
      if (booking.actual_price === null || booking.actual_price === undefined) return booking.actual_price;
      if (booking.stay_type !== 'overnight') return booking.actual_price;
      
      const cin = new Date(booking.check_in_time).getTime();
      const cout = new Date(booking.check_out_time).getTime();
      const nights = Math.max(1, Math.round((cout - cin) / (1000 * 60 * 60 * 24)));
      return Math.round(booking.actual_price / nights);
    };

    const mergedRooms = allRooms.map(room => {
      const roomBookings = allTargetBookings?.filter(b => b.room_id === room.id) || [];
      
      const targetDayBooking = roomBookings.find(b => {
        const bStart = new Date(b.check_in_time).getTime();
        const bEnd = new Date(b.check_out_time).getTime();
        const targetReference = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 14, 0, 0).getTime();
        return bStart <= targetReference && bEnd > targetReference;
      });

      const upcoming_days: number[] = [];
      let has_upcoming = false;
      
      for (let i = 0; i < 7; i++) {
        const currentDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1 + i);
        
        const isBooked = roomBookings.some(b => {
          if (b.status !== 'reserved') return false;
          const bStartDate = new Date(b.check_in_time).setHours(0,0,0,0);
          const bEndDate = new Date(b.check_out_time).setHours(0,0,0,0);
          const currentDayDate = currentDay.setHours(0,0,0,0);
          
          if (bStartDate === bEndDate) {
            return currentDayDate === bStartDate;
          } else {
            return currentDayDate >= bStartDate && currentDayDate < bEndDate;
          }
        });
        
        if (isBooked) {
          upcoming_days.push(currentDay.getDate());
          has_upcoming = true;
        }
      }
      
      const incomingBookingToday = roomBookings.find(b => {
        const bStart = new Date(b.check_in_time);
        return bStart.getDate() === targetDate.getDate() && 
               bStart.getMonth() === targetDate.getMonth() && 
               bStart.getFullYear() === targetDate.getFullYear() &&
               b.status === 'reserved';
      });
      const incoming_today = !!incomingBookingToday;

      let finalRoom: RoomStatus = { ...room, has_upcoming, upcoming_days, incoming_today };

      if (dateOffset === 0) {
        if (incomingBookingToday) {
          if (finalRoom.status === 'available' || !finalRoom.status) {
            finalRoom = {
              ...finalRoom,
              status: 'reserved',
              stay_type: 'overnight',
              check_in_time: incomingBookingToday.check_in_time,
              check_out_time: incomingBookingToday.check_out_time,
              guest_count: incomingBookingToday.guest_count,
              guest_name: incomingBookingToday.guest_name,
              guest_phone: incomingBookingToday.guest_phone,
              actual_price: getDailyPrice(incomingBookingToday),
              staff_name: incomingBookingToday.staff_name,
              booking_id: incomingBookingToday.id,
              booking_created_at: incomingBookingToday.created_at,
              unpaid_balance: financialSummary[incomingBookingToday.id]?.balance || 0,
              total_charges: financialSummary[incomingBookingToday.id]?.charges || 0,
              total_payments: financialSummary[incomingBookingToday.id]?.payments || 0,
              c_all: financialSummary[incomingBookingToday.id]?.c_all || 0,
              c_today: financialSummary[incomingBookingToday.id]?.c_today || 0,
              has_key_deposit: financialSummary[incomingBookingToday.id]?.has_key_deposit
            };
          } else if (finalRoom.status === 'reserved') {
            finalRoom.booking_id = incomingBookingToday.id;
            finalRoom.guest_name = incomingBookingToday.guest_name;
            finalRoom.guest_phone = incomingBookingToday.guest_phone;
            finalRoom.actual_price = getDailyPrice(incomingBookingToday);
            finalRoom.staff_name = incomingBookingToday.staff_name;
            finalRoom.booking_created_at = incomingBookingToday.created_at;
            finalRoom.unpaid_balance = financialSummary[incomingBookingToday.id]?.balance || 0;
            finalRoom.total_charges = financialSummary[incomingBookingToday.id]?.charges || 0;
            finalRoom.total_payments = financialSummary[incomingBookingToday.id]?.payments || 0;
            finalRoom.c_all = financialSummary[incomingBookingToday.id]?.c_all || 0;
            finalRoom.c_today = financialSummary[incomingBookingToday.id]?.c_today || 0;
            finalRoom.has_key_deposit = financialSummary[incomingBookingToday.id]?.has_key_deposit;
          }
        }
        
        if (finalRoom.status === 'occupied') {
          const activeBooking = roomBookings.find(b => b.status === 'checked_in');
          if (activeBooking) {
            finalRoom.booking_id = activeBooking.id;
            finalRoom.guest_name = activeBooking.guest_name;
            finalRoom.guest_phone = activeBooking.guest_phone;
            finalRoom.unpaid_balance = financialSummary[activeBooking.id]?.balance || 0;
            finalRoom.total_charges = financialSummary[activeBooking.id]?.charges || 0;
            finalRoom.total_payments = financialSummary[activeBooking.id]?.payments || 0;
            finalRoom.c_all = financialSummary[activeBooking.id]?.c_all || 0;
            finalRoom.c_today = financialSummary[activeBooking.id]?.c_today || 0;
            finalRoom.has_key_deposit = financialSummary[activeBooking.id]?.has_key_deposit;
            finalRoom.held_key_deposit = heldDepositByBooking[activeBooking.id] || 0;
            finalRoom.actual_price = getDailyPrice(activeBooking);
          }
        }
      } else {
        if (targetDayBooking) {
          finalRoom = {
            ...finalRoom,
            status: dateOffset > 0 ? 'reserved' : 'occupied',
            stay_type: 'overnight',
            check_in_time: targetDayBooking.check_in_time,
            check_out_time: targetDayBooking.check_out_time,
            guest_count: targetDayBooking.guest_count,
            guest_name: targetDayBooking.guest_name,
            guest_phone: targetDayBooking.guest_phone,
            actual_price: getDailyPrice(targetDayBooking),
            staff_name: targetDayBooking.staff_name,
            booking_id: targetDayBooking.id,
            booking_created_at: targetDayBooking.created_at,
            unpaid_balance: financialSummary[targetDayBooking.id]?.balance || 0,
            has_key_deposit: financialSummary[targetDayBooking.id]?.has_key_deposit
          };
        } else {
          finalRoom = {
            ...finalRoom,
            status: 'available',
            stay_type: null,
            check_in_time: null,
            check_out_time: null,
            guest_count: 0
          };
        }
      }

      if (finalRoom.booking_id && bookingMetaMap[finalRoom.booking_id]) {
        const bMeta = bookingMetaMap[finalRoom.booking_id];
        finalRoom.booking_note = bMeta.bookingNote || null;
        finalRoom.group_info = bMeta.groupInfo || null;
        finalRoom.is_group_master = bMeta.groupInfo
          ? bMeta.groupInfo.masterBookingId === finalRoom.booking_id
          : false;
      }

      return finalRoom;
    });

    setRooms(mergedRooms);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    
    const roomSubscription = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchData(true);
      })
      .subscribe();

    const bookingSubscription = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchData(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(roomSubscription);
      supabase.removeChannel(bookingSubscription);
    };
  }, [dateOffset, simulatedTime]);

  const handleCleanAllDirtyRooms = async () => {
    const dirtyRooms = rooms.filter(r => r.status === 'dirty');
    if (dirtyRooms.length === 0) return;
    
    if (!window.confirm(`ยืนยันการทำความสะอาด ${dirtyRooms.length} ห้อง พร้อมกันหรือไม่?`)) return;

    setLoading(true);
    const { error } = await supabase
      .from('rooms')
      .update({ status: 'available' })
      .in('id', dirtyRooms.map(r => r.id));
      
    if (!error) {
      fetchData();
    } else {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะห้อง');
      setLoading(false);
    }
  };

  // =========================================================================
  // ฟังก์ชันสำหรับ Admin/Manager:
  // 1) บังคับตัดรอบข้ามวัน (Close Day) ให้ตรงกับวันปัจจุบัน
  // 2) รีเซ็ตระบบเป็น 0 ทุกสถานที่ (ซอย1, ซอย2, ซามีญ่า) สำหรับทดสอบ
  // =========================================================================
  const handleConfirmAdminAction = async () => {
    if (!adminPin.trim()) {
      setAdminPinError("กรุณากรอกรหัส PIN ของ Admin หรือผู้จัดการ");
      return;
    }
    setAdminActionLoading(true);
    setAdminPinError("");

    try {
      let authorizedName = "Master Admin";
      if (adminPin.trim() !== "9999") {
        const { data: staffData, error: staffErr } = await supabase
          .from("staff")
          .select("name, role")
          .eq("pin", adminPin.trim())
          .maybeSingle();

        if (staffErr || !staffData || (staffData.role !== "admin" && staffData.role !== "manager")) {
          setAdminActionLoading(false);
          setAdminPinError("รหัส PIN ไม่ถูกต้อง หรือไม่มีสิทธิ์ (ต้องเป็น Admin/Manager เท่านั้น)");
          return;
        }
        authorizedName = staffData.name;
      }

      const nowIso = getNow().toISOString();
      const allLocs = sortedLocations.length > 0 ? sortedLocations : ["ซอย1", "ซอย2", "ซามีญ่า"];

      if (adminActionModal === "force_close_day") {
        // 1. บันทึกปิดรอบวัน (EOD) ของวันก่อนหน้าและวันในกะที่ค้างอยู่ให้ครบทุกสถานที่
        const prevBD = addDaysStr(realClockBusinessDate, -1);
        const datesToClose = Array.from(new Set([prevBD, closeDayBusinessDate].filter(d => d && d <= realClockBusinessDate)));
        const upserts: { key: string; value: any }[] = [];

        datesToClose.forEach(bd => {
          if (bd < realClockBusinessDate) {
            upserts.push({
              key: `${EOD_KEY_PREFIX}${bd}`,
              value: { shift_id: activeShift?.id || "admin-force-eod", location: "ALL", closed_at: nowIso, forced_by: authorizedName },
            });
            allLocs.forEach(loc => {
              upserts.push({
                key: `${EOD_LOC_KEY_PREFIX}${loc}_${bd}`,
                value: { shift_id: activeShift?.id || "admin-force-eod", location: loc, closed_at: nowIso, forced_by: authorizedName },
              });
            });
          }
        });

        if (upserts.length > 0) {
          await supabase.from("system_settings").upsert(upserts, { onConflict: "key" });
        }

        // 2. อัปเดตวันธุรกิจของกะที่กำลังเปิดอยู่ทั้งหมดให้เป็นวันปัจจุบัน (realClockBusinessDate)
        for (const s of openShifts) {
          if (s.id && s.id !== "dummy-shift-id") {
            await saveShiftBusinessDate(s.id, realClockBusinessDate, s.shift_location || "ซอย1");
          }
        }

        await logActivity({
          category: "shift",
          action: "update",
          staffName: authorizedName,
          shiftName: activeShift?.staff_name || null,
          target: `บังคับตัดรอบข้ามวัน (Close Day -> ${realClockBusinessDate})`,
          details: `ผู้จัดการ (${authorizedName}) กดบังคับตัดรอบข้ามวัน (Close Day) ให้เป็นวันที่ ${realClockBusinessDate} ทุกสถานที่เรียบร้อย`,
        });

        setAdminActionModal(null);
        setAdminPin("");
        setDateOffset(0);
        await refreshShift();
        await fetchData();
        alert(`✅ ตัดรอบข้ามวัน (Close Day) เป็นวันที่ ${realClockBusinessDate} เรียบร้อยแล้ว`);
      } else if (adminActionModal === "reset_all_zero") {
        // 1. Unlink และ Void รายการใน ledger_transactions ทั้งหมด (รองรับ RLS ที่ไม่อนุญาต DELETE)
        await supabase
          .from("ledger_transactions")
          .update({
            booking_id: null,
            room_id: null,
            shift_id: null,
            category: "ล้างข้อมูลทดสอบ (Voided)",
            amount: 0,
          })
          .not("id", "is", null);

        // 2. ลบ booking_daily_rates, booking_daily_extras, bookings ทั้งหมด
        await supabase.from("booking_daily_rates").delete().not("id", "is", null);
        await supabase.from("booking_daily_extras").delete().not("id", "is", null);
        await supabase.from("bookings").delete().not("id", "is", null);

        // 3. ปิดกะที่เปิดค้างอยู่ทั้งหมด และรีเซ็ตยอดเงินในกะเป็น 0
        await supabase
          .from("shifts")
          .update({
            status: "closed",
            end_time: nowIso,
            initial_cash: 0,
            expected_cash: 0,
            final_cash: 0,
            discrepancy: 0,
          })
          .eq("status", "open");

        // 4. ลบค่า cash_handover_*, booking_meta_*, eod_*, shift_bd_* ใน system_settings
        await Promise.all([
          supabase.from("system_settings").delete().like("key", `${HANDOVER_KEY_PREFIX}%`),
          supabase.from("system_settings").delete().like("key", "booking_meta_%"),
          supabase.from("system_settings").delete().like("key", `${EOD_KEY_PREFIX}%`),
          supabase.from("system_settings").delete().like("key", `${EOD_LOC_KEY_PREFIX}%`),
          supabase.from("system_settings").delete().like("key", `${SHIFT_BD_KEY_PREFIX}%`),
        ]);

        // 5. รีเซ็ตห้องพักทุกห้องทุกสถานที่ให้กลับมาเป็น "ว่าง" (available)
        await supabase
          .from("rooms")
          .update({
            status: "available",
            current_status: "ว่าง",
            stay_type: null,
            check_in_time: null,
            check_out_time: null,
            guest_count: null,
            actual_price: null,
            staff_name: null,
          })
          .not("id", "is", null);

        localStorage.removeItem("active_shift_id");

        await logActivity({
          category: "checkin",
          action: "delete",
          staffName: authorizedName,
          shiftName: null,
          target: "รีเซ็ตระบบเป็น 0 ทุกสถานที่ (สำหรับทดสอบ)",
          details: `ผู้จัดการ (${authorizedName}) รีเซ็ตข้อมูลห้องพัก การจอง ยอดยกมา มัดจำกุญแจ และลิ้นชักเงินสดทุกสถานที่ให้เริ่มต้นจาก 0`,
        });

        setAdminActionModal(null);
        setAdminPin("");
        setDateOffset(0);
        await refreshShift();
        await fetchData();
        alert("✅ รีเซ็ตข้อมูลทุกสถานที่ (ซอย1, ซอย2, ซามีญ่า) เริ่มต้นจาก 0 เรียบร้อยแล้ว!");
      }
    } catch (err: any) {
      console.error(err);
      setAdminPinError("เกิดข้อผิดพลาด: " + (err?.message || String(err)));
    } finally {
      setAdminActionLoading(false);
    }
  };

  // จัดเรียงและจัดกลุ่มตามสถานที่
  const groupedRooms: { [key: string]: RoomStatus[] } = {};
  rooms.forEach((room) => {
    const loc = room.location || "ไม่มีสถานที่";
    if (!groupedRooms[loc]) groupedRooms[loc] = [];
    groupedRooms[loc].push(room);
  });

  const sortedLocations = Object.keys(groupedRooms).sort((a, b) => {
    let indexA = locationsOrder.indexOf(a);
    let indexB = locationsOrder.indexOf(b);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });

  // กรองสถานที่ที่ผู้ใช้นี้ได้รับสิทธิ์ตามที่ตั้งไว้ใน Settings (effectiveUser.locations)
  // โดยนำสถานที่หลัก (userPrimaryLocation) มาไว้เป็นปุ่มแรกเสมอ
  const userVisibleLocations = (() => {
    const base = isManagerOrAdmin
      ? sortedLocations
      : sortedLocations.filter(loc => effectiveUser?.locations?.includes(loc));
    if (userPrimaryLocation && base.includes(userPrimaryLocation)) {
      return [userPrimaryLocation, ...base.filter(l => l !== userPrimaryLocation)];
    }
    return base;
  })();

  // คำนวณสถิติรายสถานที่ (ห้องว่าง / มีผู้เข้าพัก / รอทำความสะอาด / จอง / มัดจำกุญแจคงเหลือ / ยอดรายได้สุทธิวันนี้)
  const locationStatsMap: Record<
    string,
    {
      total: number;
      available: number;
      occupied: number;
      dirty: number;
      reserved: number;
      netRevenue: number;
      keyTotal: number;
      keyRooms: RoomStatus[];
    }
  > = {};

  sortedLocations.forEach(loc => {
    const list = groupedRooms[loc] || [];
    const available = list.filter(r => !r.status || r.status === 'available').length;
    const occupied = list.filter(r => r.status === 'occupied').length;
    const dirty = list.filter(r => r.status === 'dirty' || r.status === 'cleaning').length;
    const reserved = list.filter(r => r.status === 'reserved').length;
    const keyRooms = list
      .filter(r => r.status === 'occupied' && (r.held_key_deposit || 0) > 0)
      .sort((a, b) => a.room_no.localeCompare(b.room_no, undefined, { numeric: true }));
    const keyTotal = keyRooms.reduce((s, r) => s + (r.held_key_deposit || 0), 0);
    locationStatsMap[loc] = {
      total: list.length,
      available,
      occupied,
      dirty,
      reserved,
      netRevenue: netRevenueByLoc[loc] || 0,
      keyTotal,
      keyRooms,
    };
  });

  // รายชื่อห้องที่มียอดค้างชำระ (ลูกหนี้) สำหรับแสดงปุ่มแจ้งเตือนแบบพับเก็บได้บนแถบด้านบน (ซ่อนรายละเอียดไว้จนกว่าจะกดดู)
  const seenUnpaidGroupIds = new Set<string>();
  const unpaidRoomsList = rooms
    .filter(r => {
      if (r.status !== 'occupied') return false;
      if ((r.unpaid_balance || 0) < 0.5) return false;
      const loc = r.location || 'ทั่วไป';
      if (!isManagerOrAdmin && !userVisibleLocations.includes(loc)) return false;
      if (selectedLocationFilter && loc !== selectedLocationFilter) return false;
      if (r.group_info?.groupId) {
        if (seenUnpaidGroupIds.has(r.group_info.groupId)) return false;
        seenUnpaidGroupIds.add(r.group_info.groupId);
      }
      return true;
    })
    .sort((a, b) => {
      const locCmp = String(a.location || '').localeCompare(String(b.location || ''));
      if (locCmp !== 0) return locCmp;
      return a.room_no.localeCompare(b.room_no, undefined, { numeric: true });
    });
  const totalUnpaidAmount = unpaidRoomsList.reduce((sum, r) => sum + Math.round(r.unpaid_balance || 0), 0);

  const getStayDetails = (room: RoomStatus) => {
    if (room.status !== 'occupied' || !room.check_out_time) return null;
    if (dateOffset !== 0) return null;

    const now = getNow();
    const checkoutTime = new Date(room.check_out_time);
    const diffMs = checkoutTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffMins = diffMs / (1000 * 60);
    
    const isWarning = diffMins <= 15;
    
    if (room.stay_type === 'overnight') {
      const nightsLeft = Math.max(0, Math.round(diffHours / 24));
      return { text: `${nightsLeft}`, type: 'overnight', warning: isWarning };
    } else {
      if (diffMs <= 0) return { text: "0", type: 'short_stay', warning: true };
      const hoursLeft = Math.max(0, Math.floor(diffHours));
      return { text: `${hoursLeft}`, type: 'short_stay', warning: isWarning };
    }
  };

  const getStatusClasses = (status: string | null) => {
    switch (status) {
      case 'occupied': return "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200 hover:border-blue-400 shadow-sm";
      case 'dirty': return "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300";
      case 'cleaning': return "bg-yellow-100 border-yellow-300 text-yellow-800 hover:bg-yellow-200 hover:border-yellow-400 shadow-sm";
      case 'reserved': return "bg-purple-100 border-purple-300 text-purple-800 hover:bg-purple-200 hover:border-purple-400 shadow-sm";
      default: return "bg-white border-emerald-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.05)]";
    }
  };

  const displayDate = getBusinessDate(getNow());
  displayDate.setDate(displayDate.getDate() + dateOffset);

  const formatShortThaiDate = (ymd: string) => {
    if (!ymd) return "-";
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  const isCloseDayMatched = closeDayBusinessDate === realClockBusinessDate && !closeDayMismatchReason;

  const formatTimeStr = (isoString: string | null) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateStr = (isoString: string | null) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const isToday = d.getDate() === displayDate.getDate() && 
                    d.getMonth() === displayDate.getMonth() && 
                    d.getFullYear() === displayDate.getFullYear();
    return isToday ? "" : `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const tomorrowDate = new Date(displayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDayNum = tomorrowDate.getDate();

  return (
    <div className="space-y-2 sm:space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* แถบควบคุมด้านบนแบบประหยัดพื้นที่สูงสุด (รวมวันที่ + Close Day + กะทำงาน + ตัวกรองสถานที่ไว้ในกล่องเดียว) */}
      {isHousekeeper ? (
        <div className="bg-white p-2 sm:p-2.5 rounded-xl shadow-xs border border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs sm:text-sm font-black text-slate-800">
              วันนี้ {displayDate.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">({effectiveUser?.name})</span>
            <button
              onClick={handleLogout}
              className="text-rose-600 bg-rose-50 hover:bg-rose-100 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-rose-200 transition-colors"
            >
              🚪 ออกจากระบบ
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-2 sm:p-2.5 rounded-xl shadow-xs border border-slate-200 space-y-1.5">
          {/* บรรทัดที่ 1: วันที่ + Close Day + กะการทำงาน + ปุ่มเครื่องมือ/Logout */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              <button 
                onClick={() => setDateOffset(prev => Math.max(-10, prev - 1))}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 flex items-center justify-center flex-shrink-0"
                title="ย้อนหลัง 1 วัน"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
              </button>

              <input 
                type="date"
                value={`${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`}
                onChange={(e) => {
                  if (e.target.value) {
                    const selectedDate = new Date(e.target.value);
                    const today = getBusinessDate(getNow());
                    selectedDate.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    const diffTime = selectedDate.getTime() - today.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    setDateOffset(diffDays);
                  }
                }}
                className="border-slate-200 rounded-lg px-1.5 py-0.5 text-[11px] sm:text-xs font-bold focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-800 h-7 outline-none border w-[112px] sm:w-auto"
              />

              <button 
                onClick={() => setDateOffset(prev => Math.min(7, prev + 1))}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 flex items-center justify-center flex-shrink-0"
                title="ล่วงหน้า 1 วัน"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
              </button>

              {dateOffset !== 0 ? (
                <button 
                  onClick={() => setDateOffset(0)}
                  className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-lg hover:bg-blue-700 transition-colors h-7 flex items-center shadow-2xs"
                >
                  วันนี้
                </button>
              ) : (
                <span className="text-[11px] font-black text-slate-700 hidden sm:inline">
                  {displayDate.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              )}

              {/* ป้าย Close Day แบบกระชับ */}
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 h-7 rounded-lg text-[10.5px] font-bold border ${
                  isCloseDayMatched
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-900 border-amber-300 animate-pulse"
                }`}
                title={
                  isCloseDayMatched
                    ? "วันของรอบกะ (Close Day) ตรงกับวันปัจจุบันเรียบร้อย (ตัดวัน 06:45 น.)"
                    : closeDayMismatchReason || "วันของรอบกะ (Close Day) ไม่ตรงกับวันปัจจุบัน"
                }
              >
                <span>{isCloseDayMatched ? "✅" : "⚠️"}</span>
                <span>
                  Close: <strong>{formatShortThaiDate(closeDayBusinessDate)}</strong>
                </span>
              </div>
            </div>

            {/* ขวา: กะการทำงาน + ปุ่มเครื่องมือ Admin (พับเก็บได้) + ปุ่มออก */}
            <div className="flex flex-wrap items-center gap-1 ml-auto">
              <ShiftManager compact={true} hideExpense={false} />

              {isManagerOrAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAdminTools(prev => !prev)}
                  className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border transition-colors ${
                    showAdminTools
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                  }`}
                  title="เครื่องมือผู้จัดการ (ตัดรอบข้ามวัน / รีเซ็ตระบบสำหรับทดสอบ)"
                >
                  ⚙️ จัดการ{showAdminTools ? "▲" : "▼"}
                </button>
              )}

              {isStaff && (
                <button
                  onClick={handleLogout}
                  className="text-rose-600 bg-rose-50 hover:bg-rose-100 font-bold text-[11px] px-2 py-1 rounded-lg border border-rose-200 transition-colors"
                  title="ออกจากระบบ"
                >
                  🚪 ออก
                </button>
              )}
            </div>
          </div>

          {/* แถบเครื่องมือ Admin (แสดงเฉพาะเมื่อกด ⚙️ จัดการ หรือเมื่อวัน Close Day ไม่ตรงกัน) */}
          {isManagerOrAdmin && showAdminTools && (
            <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setAdminPin("");
                  setAdminPinError("");
                  setAdminActionModal("force_close_day");
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors"
              >
                ⏭️ ตัดรอบข้ามวัน (Close Day)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminPin("");
                  setAdminPinError("");
                  setAdminActionModal("reset_all_zero");
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
              >
                🧹 รีเซ็ตเป็น 0 ทุกสถานที่
              </button>
            </div>
          )}

          {/* แจ้งเตือนสั้นๆ เมื่อวัน Close Day ไม่ตรงกับวันปัจจุบัน */}
          {!isCloseDayMatched && closeDayMismatchReason && (
            <div className="text-[10.5px] font-bold text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1 flex items-center justify-between gap-2">
              <span className="truncate">⚠️ {closeDayMismatchReason}</span>
              {isManagerOrAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setAdminPin("");
                    setAdminPinError("");
                    setAdminActionModal("force_close_day");
                  }}
                  className="underline text-indigo-700 font-black whitespace-nowrap shrink-0"
                >
                  ตัดรอบข้ามวัน →
                </button>
              )}
            </div>
          )}

          {/* บรรทัดที่ 2: ปุ่มเลือกสถานที่ (ปุ่มกอง) + สลับตาราง/แผนผัง ในแถวเดียวกัน */}
          {!loading && (isManagerOrAdmin ? sortedLocations.length > 0 : userVisibleLocations.length > 0) && (
            <div className="pt-1.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {(isManagerOrAdmin ? sortedLocations : userVisibleLocations).map(loc => {
                  const isPrimary = userPrimaryLocation === loc;
                  const isSelected = selectedLocationFilter === loc;
                  const st = locationStatsMap[loc] || { available: 0, occupied: 0, dirty: 0, reserved: 0, netRevenue: 0 };

                  if (isPrimary) {
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => setSelectedLocationFilter(loc)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center gap-1 border-2 ${
                          isSelected
                            ? "bg-indigo-600 text-white border-amber-300 shadow-xs"
                            : "bg-indigo-50 text-indigo-900 border-indigo-300 hover:bg-indigo-100"
                        }`}
                      >
                        <span>⭐{loc}</span>
                        <span
                          className={`text-[9.5px] px-1 py-0.2 rounded font-bold ${
                            isSelected ? "bg-indigo-700 text-indigo-50" : "bg-white text-slate-700 border border-indigo-200"
                          }`}
                        >
                          ว่าง{st.available}•พัก{st.occupied}
                          {!isHousekeeper && `•฿${st.netRevenue.toLocaleString()}`}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setSelectedLocationFilter(loc)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 border ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span>📍{loc}</span>
                      <span
                        className={`text-[9.5px] font-semibold px-1 py-0.2 rounded ${
                          isSelected ? "bg-blue-700 text-blue-50" : "bg-white text-slate-500 border border-slate-200/70"
                        }`}
                      >
                        {st.available}/{st.occupied}
                        {!isHousekeeper && st.netRevenue > 0 ? `•฿${st.netRevenue.toLocaleString()}` : ""}
                      </span>
                    </button>
                  );
                })}

                {(isManagerOrAdmin ? sortedLocations.length > 1 : userVisibleLocations.length > 1) && (
                  <button
                    type="button"
                    onClick={() => setSelectedLocationFilter(null)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors border ${
                      selectedLocationFilter === null
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 ml-auto flex-wrap">
                {!isHousekeeper && dateOffset === 0 && unpaidRoomsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUnpaidSummary(prev => !prev)}
                    className={`px-2 py-0.5 rounded-lg text-[10.5px] font-black transition-all flex items-center gap-1 border ${
                      showUnpaidSummary
                        ? "bg-rose-600 text-white border-rose-700 shadow-2xs"
                        : "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300"
                    }`}
                    title="คลิกเพื่อดูห้องที่มียอดค้างชำระและกดเปิดบิลรับชำระเงินทันที"
                  >
                    <span>⚠️ค้างชำระ {unpaidRoomsList.length} ห้อง (฿{totalUnpaidAmount.toLocaleString()})</span>
                    <span>{showUnpaidSummary ? "▲" : "▼"}</span>
                  </button>
                )}
                {isManagerOrAdmin && dateOffset === 0 && rooms.some(r => r.status === 'dirty') && (
                  <button 
                    onClick={handleCleanAllDirtyRooms}
                    disabled={loading}
                    className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[10.5px] font-bold rounded-lg transition-colors"
                  >
                    🧹ล้างทุกห้อง
                  </button>
                )}
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10.5px]">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ตาราง
                  </button>
                  <button 
                    onClick={() => setViewMode('map')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all ${viewMode === 'map' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    ผัง
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* แถบสรุปห้องค้างชำระแบบกระชับ (ซ่อนไว้เป็นค่าเริ่มต้น แสดงเฉพาะเมื่อพนักงานกดปุ่ม ⚠️ค้างชำระ ด้านบน) */}
          {!isHousekeeper && dateOffset === 0 && showUnpaidSummary && unpaidRoomsList.length > 0 && (
            <div className="pt-1.5 border-t border-rose-100 bg-rose-50/70 rounded-lg px-2.5 py-1.5 space-y-1">
              <div className="flex items-center justify-between text-[10.5px] font-black text-rose-900">
                <span>📋 ห้องที่มียอดค้างชำระ (คลิกที่ห้องเพื่อเปิดบิลรับชำระเงินได้ทันที)</span>
                <button
                  type="button"
                  onClick={() => setShowUnpaidSummary(false)}
                  className="text-rose-600 hover:text-rose-800 font-bold text-[10px]"
                >
                  ✕ ซ่อน
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unpaidRoomsList.map(r => {
                  const roomCharges = Math.round(r.total_charges || 0);
                  const keyDep = Math.round(r.held_key_deposit || 0);
                  const paidAmt = Math.round(r.total_payments || 0);
                  const unpaidAmt = Math.round(r.unpaid_balance || 0);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRoom(r)}
                      className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-[11px] shadow-2xs transition-colors text-left cursor-pointer"
                    >
                      <span className="font-black text-indigo-800">
                        📍{r.location || "ทั่วไป"} ห้อง {r.room_no}
                      </span>
                      {r.guest_name && r.guest_name !== "ไม่ระบุชื่อ" && (
                        <span className="text-slate-600 font-semibold">({r.guest_name})</span>
                      )}
                      <span className="text-slate-500 text-[10px]">
                        ค่าห้อง/บริการ ฿{roomCharges.toLocaleString()}
                        {keyDep > 0 ? ` + มัดจำ ฿${keyDep.toLocaleString()}` : ""} • จ่ายแล้ว ฿{paidAmt.toLocaleString()}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-black text-[10.5px]">
                        ค้าง ฿{unpaidAmt.toLocaleString()} • 💳 เก็บเงิน
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-500">กำลังโหลดข้อมูล...</div>
      ) : !isManagerOrAdmin && userVisibleLocations.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
          <div className="text-4xl mb-2">🔒</div>
          <div className="text-base font-bold text-slate-700">ยังไม่ได้รับการกำหนดสถานที่ดูแล</div>
          <div className="text-xs text-slate-400 mt-1">โปรดติดต่อผู้ดูแลระบบ (Admin) เพื่อกำหนดสถานที่หลักในหน้า Settings</div>
        </div>
      ) : (
        <div className="space-y-4">
          {(isManagerOrAdmin ? sortedLocations : userVisibleLocations).filter(loc => {
            if (!isManagerOrAdmin && !userVisibleLocations.includes(loc)) {
              return false;
            }
            if (selectedLocationFilter) {
              return loc === selectedLocationFilter;
            }
            return true;
          }).map(loc => {
            const locRooms = (groupedRooms[loc] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            const st = locationStatsMap[loc] || {
              total: locRooms.length,
              available: 0,
              occupied: 0,
              dirty: 0,
              reserved: 0,
              netRevenue: 0,
              keyTotal: 0,
              keyRooms: [],
            };
            const isPrimary = userPrimaryLocation === loc;
            const isKeyExpanded = !!expandedKeyLocs[loc];

            return (
              <div
                key={loc}
                className={`p-2 sm:p-4 rounded-2xl border ${
                  isPrimary
                    ? "bg-indigo-50/30 border-indigo-200 shadow-2xs"
                    : "bg-slate-50/50 border-slate-200"
                }`}
              >
                {/* หัวข้อกอง (ชื่อกอง): บรรทัดเดียวกระชับ รวมชื่อกอง + ว่าง/พัก/สุทธิ + 🔑มัดจำกุญแจ */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                    <span className={`w-1.5 h-4 sm:h-5 rounded-full ${isPrimary ? "bg-indigo-600" : "bg-slate-400"}`}></span>
                    <h2 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-1">
                      {isPrimary && <span>⭐</span>}
                      <span>{loc}</span>
                    </h2>
                    {isPrimary && (
                      <span className="text-[9.5px] font-black px-1.5 py-0.2 rounded-full bg-indigo-600 text-white">
                        หลัก
                      </span>
                    )}
                    {isStaff && !isPrimary && (
                      <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        สถานที่รอง (โอน/บัตร/ค้างชำระ)
                      </span>
                    )}

                    {/* สถิติประจำกองในบรรทัดเดียวกับชื่อกอง */}
                    <div className="flex flex-wrap items-center gap-1 text-[10.5px] sm:text-xs font-bold">
                      <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ว่าง {st.available}
                      </span>
                      <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                        พัก {st.occupied}
                      </span>
                      {st.dirty > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                          รอทำ {st.dirty}
                        </span>
                      )}
                      {st.reserved > 0 && (
                        <span className="px-1.5 py-0.2 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                          จอง {st.reserved}
                        </span>
                      )}
                      {!isHousekeeper && (
                        <span className="px-2 py-0.2 rounded-md bg-slate-800 text-white font-black">
                          สุทธิ ฿{st.netRevenue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ขวาสุดของบรรทัดชื่อกอง: 🔑 มัดจำกุญแจคงเหลือของสถานที่นี้ */}
                  {!isHousekeeper && dateOffset === 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedKeyLocs(prev => ({ ...prev, [loc]: !prev[loc] }))}
                      className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg text-[10.5px] sm:text-xs font-bold text-amber-900 transition-colors shadow-2xs"
                      title="คลิกเพื่อดูรายชื่อห้องที่ถือเงินมัดจำกุญแจของสถานที่นี้"
                    >
                      <span>🔑มัดจำ:</span>
                      <span className="font-black text-amber-800">
                        ฿{st.keyTotal.toLocaleString()}
                      </span>
                      <span className="text-[9.5px] bg-white border border-amber-200 rounded-full px-1 text-amber-700 font-bold">
                        {st.keyRooms.length}▼
                      </span>
                    </button>
                  )}
                </div>

                {/* รายชื่อห้องที่ถือมัดจำกุญแจของสถานที่นี้ (เมื่อกดกางออก) */}
                {!isHousekeeper && dateOffset === 0 && isKeyExpanded && (
                  <div className="mb-3 bg-amber-50/80 border border-amber-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-1.5">
                    {st.keyRooms.length === 0 ? (
                      <span className="text-xs text-amber-700 font-medium">
                        ไม่มีห้องที่ถือเงินมัดจำกุญแจอยู่ใน {loc}
                      </span>
                    ) : (
                      st.keyRooms.map(r => (
                        <span
                          key={r.id}
                          className="text-[11px] bg-white border border-amber-200 rounded-lg px-2 py-0.5 font-bold text-slate-700"
                        >
                          ห้อง {r.room_no}{" "}
                          <span className="text-amber-700">฿{(r.held_key_deposit || 0).toLocaleString()}</span>
                        </span>
                      ))
                    )}
                  </div>
                )}
                
                {viewMode === 'grid' ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1.5 sm:gap-2 lg:gap-2.5">
                  {locRooms.map(room => {
                    const statusClass = getStatusClasses(room.status);
                    const details = getStayDetails(room);
                    
                    return (
                      <button
                        key={room.id}
                        onClick={() => handleRoomClick(room)}
                        className={`relative aspect-[16/14] w-full flex items-center justify-center rounded-xl border-2 transition-all active:scale-95 group overflow-hidden ${statusClass}`}
                      >
                        {/* Left Section (Details) */}
                        {(room.status === 'occupied' || room.status === 'reserved' || room.status === 'dirty') && (
                          <div className="absolute top-0.5 left-0 bottom-[14px] sm:bottom-[18px] w-[30%] flex flex-col justify-between items-start text-[7px] sm:text-[9.5px] leading-none font-semibold opacity-90 pl-0.5 py-0.5">
                            {room.status === 'reserved' && room.booking_created_at ? (
                              <div className="flex flex-col items-start gap-[1px] w-full text-purple-600">
                                <div className="text-purple-400 h-[8px] sm:h-[10px] flex items-center">
                                  {formatDateStr(room.booking_created_at) === formatDateStr(displayDate.toISOString()) ? (
                                    <span>&nbsp;</span>
                                  ) : (
                                    <>{formatDateStr(room.booking_created_at)}</>
                                  )}
                                </div>
                                <div className="font-bold text-purple-700">{formatTimeStr(room.booking_created_at)}</div>
                              </div>
                            ) : room.check_in_time && (
                              <div className="flex flex-col items-start gap-[1px] w-full">
                                <div className="text-slate-500 h-[8px] sm:h-[10px] flex items-center">
                                  {formatDateStr(room.check_in_time) ? (
                                    <>{formatDateStr(room.check_in_time)}</>
                                  ) : (
                                    <span>&nbsp;</span>
                                  )}
                                </div>
                                <div className="font-bold text-slate-700">{formatTimeStr(room.check_in_time)}</div>
                              </div>
                            )}
                            
                            {room.status === 'occupied' || room.status === 'reserved' ? (
                              <div className="flex flex-row items-center gap-0 self-start -space-x-[3px] -ml-[2px]">
                                <div className="relative inline-flex items-center justify-center">
                                  <span className="text-[9px] sm:text-[11.5px] leading-none opacity-40 grayscale">👤</span>
                                  <span className="absolute top-[1.5px] w-full text-center text-[6.5px] sm:text-[8px] text-slate-900 font-black drop-shadow-sm">
                                    {room.guest_count || 1}
                                  </span>
                                </div>
                                {details && (
                                  <div className="relative inline-flex items-center justify-center">
                                    <span className="text-[9px] sm:text-[11.5px] leading-none opacity-40 grayscale">{details.type === 'overnight' ? '🌙' : '⏳'}</span>
                                    {details.type === 'overnight' ? (
                                      <span className="absolute top-[1px] right-[1px] text-[6.5px] sm:text-[8px] text-slate-900 font-black drop-shadow-sm">
                                        {details.text}
                                      </span>
                                    ) : (
                                      <span className="absolute bottom-[1px] w-full text-center text-[6.5px] sm:text-[8px] text-slate-900 font-black drop-shadow-sm">
                                        {details.text}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {room.check_out_time && (
                              <div className="flex flex-col items-start gap-[1px] w-full">
                                <div className="font-bold text-slate-700">{formatTimeStr(room.check_out_time)}</div>
                                <div className="text-slate-500 h-[8px] sm:h-[10px] flex items-center">
                                  {formatDateStr(room.check_out_time) ? (
                                    <>{formatDateStr(room.check_out_time)}</>
                                  ) : (
                                    <span>&nbsp;</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Center Section (Room No & Price) */}
                        <div className="flex-1 w-full h-full flex flex-col items-center justify-start pt-[18px] sm:pt-6 pb-[14px] sm:pb-[18px]">
                          {(() => {
                            let isOverdue = false;
                            let overdueMinutes = 0;
                            if (room.status === 'occupied' && room.check_out_time) {
                              const coTime = new Date(room.check_out_time).getTime();
                              const nowTime = getNow().getTime();
                              if (nowTime >= coTime) {
                                overdueMinutes = (nowTime - coTime) / (1000 * 60);
                                if (overdueMinutes >= 45) {
                                  isOverdue = true;
                                }
                              }
                            }
                            
                            let roomNoColor = 'text-slate-700';
                            if (room.status === 'occupied' || room.status === 'reserved') {
                              const unpaid = room.unpaid_balance || 0;
                              const payments = room.total_payments || 0;
                              if (unpaid > 0) {
                                if (payments > 0) {
                                  roomNoColor = 'text-orange-500';
                                } else {
                                  roomNoColor = 'text-rose-600';
                                }
                              } else {
                                roomNoColor = 'text-emerald-500';
                              }
                            }

                            const customIcon = roomIconsMap[room.id];

                            return (
                              <div className={`absolute top-0 text-[15px] sm:text-xl top-[1px] sm:top-1 font-black ${roomNoColor} transition-all leading-none flex items-center justify-center gap-0 mix-blend-multiply`}>
                                <span>{room.room_no}</span>
                                <div className="flex items-center text-[13px] leading-none -space-x-1 -ml-0.5">
                                  {(customIcon && customIcon.length > 0) ? (
                                    <span className="opacity-90 ml-[2px] drop-shadow-sm text-slate-700 flex items-center gap-[1px]">{customIcon.map(id => <span key={id}>{renderIcon(id, 'w-[13px] h-[16px] sm:w-[17px] sm:h-[20px]')}</span>)}</span>
                                  ) : null}
                                </div>

                                {isOverdue && (
                                  <span className="absolute -right-[14px] sm:-right-[18px] top-1/2 -translate-y-1/2 flex items-center justify-center">
                                    {overdueMinutes >= 195 ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1e293b" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-[18px] sm:h-[18px]">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                        <line x1="12" y1="9" x2="12" y2="13" stroke="#ffffff"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#ffffff"/>
                                      </svg>
                                    ) : (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fee2e2" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-[18px] sm:h-[18px]">
                                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    )}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          
                          {(room.status === 'dirty' || room.status === 'cleaning') && (
                            <div className="absolute bottom-[2px] sm:bottom-1.5 text-[12px] sm:text-lg opacity-80 flex items-center justify-center">
                              <span className={room.status === 'cleaning' ? 'animate-broom-swing inline-block' : ''}>🧹</span>
                            </div>
                          )}
                          {room.status === 'cleaning' && (
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); setNoteRoom({ id: room.id, room_no: room.room_no }); }}
                              className="absolute bottom-[1px] right-[2px] text-[11px] sm:text-sm z-40 cursor-pointer bg-white/80 rounded px-[2px] leading-none"
                              title="เพิ่มรูป/หมายเหตุ"
                            >📷</span>
                          )}

                          <div className="text-[11px] sm:text-xs font-bold text-slate-500 w-full z-20 flex flex-col items-center">
                            {(() => {
                              let basePriceText: string | number | null = null;
                              let diffText: string | null = null;
                              let diffColor = '';
                              let staffNameText: string | null = null;
                              
                              const defPrice = room.stay_type === 'short_stay' 
                                  ? room.price_temp 
                                  : (smartPricesMap[room.room_type] !== undefined ? smartPricesMap[room.room_type] : room.price_night);

                              if (!room.status || room.status === 'available' || room.status === 'dirty') {
                                basePriceText = defPrice || room.price_night || null;
                              } else {
                                const defaultPrice = defPrice || null;
                                if (room.actual_price !== undefined && room.actual_price !== null) {
                                  if (defaultPrice && room.actual_price !== defaultPrice) {
                                    basePriceText = defaultPrice;
                                    const diff = room.actual_price - defaultPrice;
                                    diffText = diff > 0 ? `+${diff}` : `${diff}`;
                                    diffColor = diff > 0 ? 'text-emerald-500' : 'text-red-500';
                                  } else {
                                    basePriceText = room.actual_price;
                                  }
                                  staffNameText = room.staff_name || null;
                                } else if (defaultPrice) {
                                  basePriceText = defaultPrice;
                                }
                              }

                              return (
                                <div className="w-full flex flex-col items-center gap-1 sm:gap-1.5">
                                  <div className="h-[11px] sm:h-[14px] flex items-center justify-center">
                                    {basePriceText !== null && Number(basePriceText) > 0 && (
                                      <span className="opacity-40 text-[10px] sm:text-[13px] leading-none">{basePriceText}</span>
                                    )}
                                  </div>
                                  <div className="h-[8px] sm:h-[12px] flex items-center justify-center">
                                    {diffText && (
                                      <span className={`${diffColor} leading-none`}>({diffText})</span>
                                    )}
                                  </div>
                                  <div className="h-[8px] sm:h-[12px] flex items-center justify-center">
                                    {staffNameText && (
                                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-medium leading-none">{staffNameText}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Right Section (7-Day Availability Indicator) */}
                        {((room.has_upcoming && room.upcoming_days && room.upcoming_days.length > 0) || (room.incoming_today && (room.status === 'occupied' || room.status === 'dirty'))) && (
                          <div className={`absolute top-0 right-1 bottom-[18px] flex flex-col items-end ${((room.upcoming_days?.length || 0) + (room.incoming_today && (room.status === 'occupied' || room.status === 'dirty') ? 1 : 0)) >= 6 ? 'justify-between py-1 gap-0' : 'gap-[2px] pt-1'} text-slate-400 overflow-hidden pr-0.5`}>
                            {room.incoming_today && (room.status === 'occupied' || room.status === 'dirty') && (
                              <span className="font-black leading-none text-[11px] text-emerald-500 animate-[pulse_1s_ease-in-out_infinite]">
                                {displayDate.getDate()}
                              </span>
                            )}
                            {room.upcoming_days?.map((dateNum, i) => {
                              const isUrgent = dateNum === tomorrowDayNum;
                              const totalItems = (room.upcoming_days?.length || 0) + (room.incoming_today && (room.status === 'occupied' || room.status === 'dirty') ? 1 : 0);
                              const textSize = totalItems >= 6 ? (isUrgent ? 'text-[9px]' : 'text-[8px]') : (isUrgent ? 'text-[11px]' : 'text-[10px]');
                              return (
                                <span 
                                  key={i} 
                                  className={`font-black leading-none ${textSize} ${isUrgent ? "text-emerald-500 animate-[pulse_2s_ease-in-out_infinite]" : ""}`}
                                >
                                  {dateNum}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Booking Note / Group Master / Key Deposit Indicators (Bottom-Right above White Financial Bar) */}
                        {(room.booking_note || (room.group_info && room.is_group_master) || (room.status === 'occupied' && (room.held_key_deposit || 0) > 0)) && (
                          <div
                            className="absolute bottom-[15px] sm:bottom-[19px] right-1 z-30 flex items-center gap-0.5 leading-none text-[7.5px] sm:text-[9px] font-black pointer-events-none"
                          >
                            {room.booking_note && (
                              <span
                                className="bg-amber-200/90 text-amber-950 px-0.5 rounded-xs"
                                title={`หมายเหตุ: ${room.booking_note}`}
                              >
                                📝
                              </span>
                            )}
                            {room.group_info && room.is_group_master && (
                              <span
                                className="bg-indigo-600 text-white px-0.5 rounded-xs"
                                title={`ห้องหลักกลุ่ม (${room.group_info.rooms.map(r => r.roomNo).join(', ')})`}
                              >
                                👑{room.group_info.rooms.length}
                              </span>
                            )}
                            {room.status === 'occupied' && (room.held_key_deposit || 0) > 0 && (
                              <span
                                className="text-amber-700"
                                title="มัดจำกุญแจที่ต้องคืนลูกค้าเป็นเงินสดตอนเช็คเอาท์"
                              >
                                🔑{room.held_key_deposit}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Financial Summary for Occupied / Group-Linked Rooms */}
                        {(room.status === 'occupied' || (room.status === 'reserved' && room.group_info)) && (
                          <div className="absolute bottom-0 left-0 right-0 w-full h-[14px] sm:h-[18px] flex items-center justify-center gap-0.5 sm:gap-1 text-[7px] sm:text-[9.5px] font-bold z-30 whitespace-nowrap bg-white/60 backdrop-blur-[1px] border-t border-slate-300/40 text-slate-500 tracking-tight overflow-hidden px-0.5">
                            {room.group_info && !room.is_group_master ? (
                              <span className={((room.unpaid_balance || 0) > 0) ? 'text-rose-500 font-black' : 'text-indigo-700 font-black'}>
                                🔗รวมห้อง {room.group_info.masterRoomNo}
                              </span>
                            ) : (
                              <>
                                <span>{room.total_charges || 0}</span>
                                <span className="text-slate-300 font-bold">-</span>
                                <span>{room.total_payments || 0}</span>
                                <span className="text-slate-300 font-bold">=</span>
                                <span className={((room.unpaid_balance || 0) < 0) ? 'text-blue-400' : (room.unpaid_balance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                  {room.unpaid_balance || 0}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="relative w-full max-w-5xl mx-auto bg-slate-200 rounded-xl shadow-inner border border-slate-200 overflow-hidden flex flex-col items-center justify-center" style={{ minHeight: '300px' }}>
                  <svg className="w-16 h-16 text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                  <h3 className="text-xl font-bold text-slate-700">อยู่ระหว่างการพัฒนา</h3>
                  <p className="text-slate-500 mt-2 text-center max-w-md">ฟีเจอร์แผนผังห้องพักกำลังอยู่ในขั้นตอนการพัฒนา เพื่อประสบการณ์ใช้งานที่ดีที่สุด</p>
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      {selectedRoom && (
        <RoomCheckinModal
          room={selectedRoom}
          allRooms={rooms}
          dateOffset={dateOffset}
          onClose={() => setSelectedRoom(null)}
          onUpdate={() => {
            fetchData();
            setSelectedRoom(null);
          }}
        />
      )}
      {noteRoom && (
        <CleaningNoteModal roomId={noteRoom.id} roomNo={noteRoom.room_no} onClose={() => setNoteRoom(null)} />
      )}

      {/* Modal ยืนยัน PIN สำหรับ Admin/Manager: ตัดรอบข้ามวัน (Close Day) หรือ รีเซ็ตระบบเป็น 0 ทุกสถานที่ */}
      {adminActionModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => !adminActionLoading && setAdminActionModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`${adminActionModal === "reset_all_zero" ? "bg-rose-600" : "bg-indigo-600"} px-5 py-4 text-white`}>
              <h3 className="font-black text-base flex items-center gap-2">
                <span>{adminActionModal === "reset_all_zero" ? "🧹" : "⏭️"}</span>
                <span>
                  {adminActionModal === "reset_all_zero"
                    ? "ยืนยันรีเซ็ตระบบเป็น 0 ทุกสถานที่ (สำหรับทดสอบ)"
                    : "ยืนยันบังคับตัดรอบข้ามวัน (Close Day)"}
                </span>
              </h3>
              <p className="text-xs text-white/90 mt-1">
                {adminActionModal === "reset_all_zero"
                  ? "ระบบจะล้างข้อมูลการจอง รายการรับเงิน ยอดยกมา มัดจำกุญแจ ลิ้นชักเงินสด และคืนสถานะห้องพักทุกสถานที่ (ซอย1, ซอย2, ซามีญ่า) ให้เป็นห้องว่างทั้งหมด"
                  : `ระบบจะปิดรอบวัน (Close Day) ของวันก่อนหน้าและปรับรอบวันของกะที่เปิดอยู่ให้ตรงกับวันปัจจุบัน (${realClockBusinessDate}) ทันที`}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  กรอกรหัส PIN ของ Admin หรือผู้จัดการ
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmAdminAction();
                  }}
                  placeholder="••••"
                  className="w-full border-2 border-slate-200 rounded-xl p-3 text-center text-xl font-mono tracking-widest focus:border-indigo-500 outline-none"
                />
              </div>
              {adminPinError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">
                  {adminPinError}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={adminActionLoading}
                  onClick={() => setAdminActionModal(null)}
                  className="flex-1 py-3 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdminAction}
                  disabled={adminActionLoading || !adminPin}
                  className={`flex-1 py-3 rounded-xl font-black text-white text-sm shadow-sm transition-colors ${
                    adminActionModal === "reset_all_zero"
                      ? "bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300"
                      : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300"
                  }`}
                >
                  {adminActionLoading
                    ? "กำลังดำเนินการ..."
                    : adminActionModal === "reset_all_zero"
                    ? "ยืนยันรีเซ็ตเป็น 0"
                    : "ยืนยันตัดรอบข้ามวัน"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

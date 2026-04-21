import React, { useState, useMemo, useEffect } from 'react';
import { db } from './firebase';
import { doc, collection, writeBatch, deleteDoc, updateDoc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { format, subDays, eachDayOfInterval, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { handleFirestoreError, OperationType, ServerBooking, Tournament, formatSlotDisplay } from './App';
import { 
  Trash2, Trophy, Plus, Calendar as CalendarIcon, MapPin, Clock, Edit2, X, Check, Search, Filter, 
  ArrowUpDown, ArrowUp, ArrowDown, BarChart3, TrendingUp, Users, IndianRupee, PieChart, Timer,
  Bell, Info, AlertTriangle, MessageSquare
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Cell, Pie
} from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from './lib/utils';
import { TimeBasedPricing } from './types';

interface AdminDashboardProps {
  bookings: ServerBooking[];
  tournaments: Tournament[];
  adminUid: string;
  hourlyRate: number;
  timeBasedPricing: TimeBasedPricing[];
  onDataChange: () => void;
}

interface AdminNotification {
  id: string;
  type: 'BOOKING_NEW' | 'BOOKING_CANCEL'| 'REFERRAL_USE';
  message: string;
  timestamp: string;
  read: boolean;
}

export default function AdminDashboard({ 
  bookings, 
  tournaments, 
  adminUid, 
  hourlyRate, 
  timeBasedPricing,
  onDataChange 
}: AdminDashboardProps) {
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newSlot, setNewSlot] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Edit Booking State
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editSlot, setEditSlot] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Search & Filter State
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingDateStart, setBookingDateStart] = useState('');
  const [bookingDateEnd, setBookingDateEnd] = useState('');
  const [membershipFilter, setMembershipFilter] = useState<string>('ALL');
  const [tournamentSearch, setTournamentSearch] = useState('');
  const [userMemberships, setUserMemberships] = useState<Record<string, string>>({});
  
  const [bookingSort, setBookingSort] = useState<{ 
    key: keyof ServerBooking; 
    direction: 'asc' | 'desc' 
  }>({ key: 'date', direction: 'asc' });

  // Tournament Form State
  const [tTitle, setTTitle] = useState('');
  const [tDate, setTDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [tTime, setTTime] = useState('');
  const [tDesc, setTDesc] = useState('');
  const [tLoc, setTLoc] = useState('');
  const [isAddingT, setIsAddingT] = useState(false);

  // Pricing State
  const [baseRateInput, setBaseRateInput] = useState<number>(hourlyRate);
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);
  
  // Real-time notifications state
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [prevBookingsState, setPrevBookingsState] = useState<ServerBooking[]>(bookings);

  // Monitor bookings for changes to trigger local notifications
  useEffect(() => {
    if (prevBookingsState.length === 0) {
      setPrevBookingsState(bookings);
      return;
    }

    const newNotify: AdminNotification[] = [];

    // Check for deletions (cancellations)
    const currentIds = new Set(bookings.map(b => b.id));
    prevBookingsState.forEach(oldB => {
      if (!currentIds.has(oldB.id)) {
        newNotify.push({
          id: `cancel-${Date.now()}-${oldB.id}`,
          type: 'BOOKING_CANCEL',
          message: `Booking Cancelled: ${oldB.userName} (${formatSlotDisplay(oldB.slot)} on ${oldB.date})`,
          timestamp: new Date().toISOString(),
          read: false
        });
      }
    });

    // Check for additions
    const prevIds = new Set(prevBookingsState.map(b => b.id));
    bookings.forEach(newB => {
      if (!prevIds.has(newB.id)) {
        // If it's a new booking with a referral
        if (newB.referralCodeUsed) {
          newNotify.push({
            id: `ref-${Date.now()}-${newB.id}`,
            type: 'REFERRAL_USE',
            message: `Referral Used! Code: ${newB.referralCodeUsed} by ${newB.userName}`,
            timestamp: new Date().toISOString(),
            read: false
          });
        } else {
           newNotify.push({
            id: `new-${Date.now()}-${newB.id}`,
            type: 'BOOKING_NEW',
            message: `New Booking: ${newB.userName} - ${formatSlotDisplay(newB.slot)}`,
            timestamp: new Date().toISOString(),
            read: false
          });
        }
      }
    });

    if (newNotify.length > 0) {
      setNotifications(prev => [...newNotify, ...prev].slice(0, 50));
    }
    
    setPrevBookingsState(bookings);
  }, [bookings]);

  // Fetch user profiles for bookings that don't have membership info
  useEffect(() => {
    const fetchMemberships = async () => {
      const uniqueUserIds = Array.from(new Set(bookings.map(b => b.userId)));
      const missingIds = uniqueUserIds.filter(id => !userMemberships[id]);
      
      if (missingIds.length === 0) return;

      const newMemberships = { ...userMemberships };
      const batchSize = 10;
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batch = missingIds.slice(i, i + batchSize);
        await Promise.all(batch.map(async (uid) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              newMemberships[uid] = userDoc.data().membership || 'NONE';
            } else {
              newMemberships[uid] = 'NONE';
            }
          } catch (e) {
            console.error(`Error fetching membership for ${uid}:`, e);
          }
        }));
      }
      setUserMemberships(newMemberships);
    };

    fetchMemberships();
  }, [bookings]); // userMemberships is omitted to prevent loop, we only re-run when bookings change

  // Time-based pricing state
  const [newSlotStart, setNewSlotStart] = useState('00:00');
  const [newSlotEnd, setNewSlotEnd] = useState('00:00');
  const [newSlotPrice, setNewSlotPrice] = useState<number>(hourlyRate);

  // Sync internal input state with prop when it comes from Firestore
  useEffect(() => {
    setBaseRateInput(hourlyRate);
  }, [hourlyRate]);

  const handleUpdateRate = async () => {
    if (baseRateInput <= 0) return;
    setIsUpdatingRate(true);
    try {
      await setDoc(doc(db, 'settings', 'pricing'), {
        baseHourlyRate: Number(baseRateInput),
        timeBasedPricing: timeBasedPricing // Preserve existing slots
      }, { merge: true });
      onDataChange();
      alert('Hourly rate updated successfully!');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/pricing');
    } finally {
      setIsUpdatingRate(false);
    }
  };

  const handleAddTimeSlot = async () => {
    if (!newSlotStart || !newSlotEnd || newSlotPrice <= 0) return;
    
    // Check for overlaps (simple check)
    const startH = Number(newSlotStart.split(':')[0]);
    const endH = Number(newSlotEnd.split(':')[0]);
    if (startH >= endH) {
      alert('Start time must be before end time');
      return;
    }

    setIsUpdatingRate(true);
    try {
      const updatedPricing = [...timeBasedPricing, {
        start: newSlotStart,
        end: newSlotEnd,
        price: Number(newSlotPrice)
      }].sort((a, b) => a.start.localeCompare(b.start));

      await setDoc(doc(db, 'settings', 'pricing'), {
        timeBasedPricing: updatedPricing
      }, { merge: true });
      
      onDataChange();
      setNewSlotStart('00:00');
      setNewSlotEnd('00:00');
      setNewSlotPrice(hourlyRate);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/pricing');
    } finally {
      setIsUpdatingRate(false);
    }
  };

  const handleRemoveTimeSlot = async (index: number) => {
    setIsUpdatingRate(true);
    try {
      const updatedPricing = timeBasedPricing.filter((_, i) => i !== index);
      await setDoc(doc(db, 'settings', 'pricing'), {
        timeBasedPricing: updatedPricing
      }, { merge: true });
      onDataChange();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/pricing');
    } finally {
      setIsUpdatingRate(false);
    }
  };

  const sortedBookings = useMemo(() => {
    let filtered = [...bookings];

    // Search filter
    if (bookingSearch) {
      const search = bookingSearch.toLowerCase();
      filtered = filtered.filter(b => 
        b.userName.toLowerCase().includes(search) || 
        b.userPhone.toLowerCase().includes(search) ||
        b.slot.toLowerCase().includes(search)
      );
    }

    // Date range filter
    if (bookingDateStart && bookingDateEnd) {
      filtered = filtered.filter(b => {
        const d = b.date;
        return d >= bookingDateStart && d <= bookingDateEnd;
      });
    } else if (bookingDateStart) {
      filtered = filtered.filter(b => b.date >= bookingDateStart);
    } else if (bookingDateEnd) {
      filtered = filtered.filter(b => b.date <= bookingDateEnd);
    }

    // Membership Filter
    if (membershipFilter !== 'ALL') {
      filtered = filtered.filter(b => {
        const m = b.membership || userMemberships[b.userId];
        return m === membershipFilter;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      const valA = String(a[bookingSort.key] || '');
      const valB = String(b[bookingSort.key] || '');
      
      if (bookingSort.direction === 'asc') {
        return valA.localeCompare(valB);
      } else {
        return valB.localeCompare(valA);
      }
    });

    return filtered;
  }, [bookings, bookingSearch, bookingDateStart, bookingDateEnd, bookingSort]);

  const filteredTournaments = useMemo(() => {
    let filtered = [...tournaments];

    if (tournamentSearch) {
      const search = tournamentSearch.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(search) || 
        t.description.toLowerCase().includes(search) ||
        t.location.toLowerCase().includes(search)
      );
    }

    return filtered.sort((a, b) => a.date.localeCompare(b.date));
  }, [tournaments, tournamentSearch]);

  const toggleSort = (key: keyof ServerBooking) => {
    setBookingSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: keyof ServerBooking }) => {
    if (bookingSort.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return bookingSort.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-neo-green" /> 
      : <ArrowDown className="w-3 h-3 text-neo-green" />;
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await deleteDoc(doc(db, 'bookings', id));
      onDataChange();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `bookings/${id}`);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this tournament?")) return;
    try {
      await deleteDoc(doc(db, 'tournaments', id));
      onDataChange();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `tournaments/${id}`);
    }
  };

  const handleAddBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newSlot || !newUserName || !newUserPhone) return;

    setIsAdding(true);
    try {
      const batch = writeBatch(db);
      const docRef = doc(collection(db, 'bookings'));
      batch.set(docRef, {
        date: newDate,
        slot: newSlot,
        userName: newUserName,
        userPhone: newUserPhone,
        membership: 'NONE', // Manually added bookings default to Guest
        userId: adminUid, 
        createdAt: new Date().toISOString()
      });
      await batch.commit();
      onDataChange();
      
      setNewSlot('');
      setNewUserName('');
      setNewUserPhone('');
    } catch(error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tTitle || !tDate || !tDesc) return;

    setIsAddingT(true);
    try {
      const batch = writeBatch(db);
      const docRef = doc(collection(db, 'tournaments'));
      batch.set(docRef, {
        title: tTitle,
        date: tDate,
        time: tTime || 'TBD',
        description: tDesc,
        location: tLoc || 'Dighi, Pune (Near Horizon School)',
        createdAt: new Date().toISOString()
      });
      await batch.commit();
      onDataChange();
      
      setTTitle('');
      setTTime('');
      setTDesc('');
      setTLoc('');
    } catch(error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'tournaments');
    } finally {
      setIsAddingT(false);
    }
  };

  const startEditing = (booking: ServerBooking) => {
    setEditingBookingId(booking.id!);
    setEditDate(booking.date);
    setEditSlot(booking.slot);
    setEditUserName(booking.userName);
    setEditUserPhone(booking.userPhone);
  };

  const cancelEditing = () => {
    setEditingBookingId(null);
  };

  const handleUpdateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBookingId || !editDate || !editSlot || !editUserName || !editUserPhone) return;

    setIsUpdating(true);
    try {
      const docRef = doc(db, 'bookings', editingBookingId);
      await updateDoc(docRef, {
        date: editDate,
        slot: editSlot,
        userName: editUserName,
        userPhone: editUserPhone,
        updatedAt: new Date().toISOString()
      });
      
      onDataChange();
      setEditingBookingId(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${editingBookingId}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Analytics Derived Data
  const stats = useMemo(() => {
    const totalRevenue = bookings.length * hourlyRate;
    const uniqueUsers = new Set(bookings.map(b => b.userId)).size;
    
    // Last 7 days chart data
    const chartData = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date()
    }).map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dailyBookings = bookings.filter(b => b.date === dateStr);
      return {
        date: format(day, 'MMM dd'),
        bookings: dailyBookings.length,
        revenue: dailyBookings.length * hourlyRate
      };
    });

    return { totalRevenue, uniqueUsers, chartData };
  }, [bookings, hourlyRate]);

  return (
    <div className="bg-[#050505] p-4 md:p-8 text-white min-h-screen">
      {/* NOTIFICATION CENTER (TOP FIXED) */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {notifications.filter(n => !n.read).slice(0, 5).map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className="pointer-events-auto bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl flex items-start gap-4 relative group"
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                n.type === 'BOOKING_CANCEL' ? "bg-red-500/10 text-red-500" : 
                n.type === 'REFERRAL_USE' ? "bg-neo-green/10 text-neo-green" : "bg-blue-500/10 text-blue-500"
              )}>
                {n.type === 'BOOKING_CANCEL' ? <AlertTriangle className="w-5 h-5" /> : 
                 n.type === 'REFERRAL_USE' ? <Bell className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              </div>
              <div className="flex-1 pr-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mb-1">
                  {n.type.replace('_', ' ')} • {format(new Date(n.timestamp), 'HH:mm')}
                </div>
                <div className="text-[11px] font-bold leading-tight line-clamp-2">{n.message}</div>
              </div>
              <button 
                onClick={() => setNotifications(prev => prev.map(item => item.id === n.id ? {...item, read: true} : item))}
                className="absolute top-2 right-2 text-white/20 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-[4px] text-neo-green mb-1">Command Center</h2>
          <p className="text-[10px] text-text-dim font-mono tracking-widest uppercase">Georgopol Turf Management System v2.0</p>
        </div>
        <div className="flex gap-4">
           <div className="glass-panel px-6 py-3 border-neo-green/20">
              <div className="text-[9px] text-text-dim uppercase tracking-widest font-bold mb-1">Live Status</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-neo-green animate-pulse" />
                <span className="text-xs font-bold font-mono">SYSTEM OPERATIONAL</span>
              </div>
           </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-12">
        
        {/* ANALYTICS BRIEFING */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="glass-panel p-6 border-white/5 group hover:border-neo-green/30 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-neo-green/10 p-3 rounded-xl"><IndianRupee className="w-5 h-5 text-neo-green" /></div>
                <div className="text-[10px] text-neo-green font-bold tracking-widest">GROSS REVENUE</div>
              </div>
              <div className="text-3xl font-black font-mono">₹{stats.totalRevenue.toLocaleString()}</div>
              <div className="text-[10px] text-text-dim mt-2 font-mono">ESTIMATED TOTAL</div>
            </div>
            
            <div className="glass-panel p-6 border-white/5 group hover:border-neo-green/30 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-500/10 p-3 rounded-xl"><Clock className="w-5 h-5 text-blue-500" /></div>
                <div className="text-[10px] text-blue-500 font-bold tracking-widest">TOTAL SLOTS</div>
              </div>
              <div className="text-3xl font-black font-mono">{bookings.length}</div>
              <div className="text-[10px] text-text-dim mt-2 font-mono">BOOKED UNITS</div>
            </div>

            <div className="glass-panel p-6 border-white/5 group hover:border-neo-green/30 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-purple-500/10 p-3 rounded-xl"><Users className="w-5 h-5 text-purple-500" /></div>
                <div className="text-[10px] text-purple-500 font-bold tracking-widest">ACTIVE USERS</div>
              </div>
              <div className="text-3xl font-black font-mono">{stats.uniqueUsers}</div>
              <div className="text-[10px] text-text-dim mt-2 font-mono">UNIQUE CUSTOMERS</div>
            </div>

            <div className="glass-panel p-6 border-white/5 group hover:border-neo-green/30 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-orange-500/10 p-3 rounded-xl"><Trophy className="w-5 h-5 text-orange-500" /></div>
                <div className="text-[10px] text-orange-500 font-bold tracking-widest">EVENTS</div>
              </div>
              <div className="text-3xl font-black font-mono">{tournaments.length}</div>
              <div className="text-[10px] text-text-dim mt-2 font-mono">TOURNAMENTS LISTED</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-panel p-8 border-white/5">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xs font-black uppercase tracking-[3px]">Booking Velocity</h4>
                <div className="text-[9px] text-text-dim font-mono">LAST 7 DAYS</div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.chartData}>
                    <defs>
                      <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C2FF00" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#C2FF00" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#ffffff30" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{fill: '#8E9299'}} 
                    />
                    <YAxis 
                      stroke="#ffffff30" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{fill: '#8E9299'}} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0A1118', border: '1px solid #ffffff10', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '10px', color: '#8E9299', marginBottom: '4px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="bookings" 
                      stroke="#C2FF00" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorBookings)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass-panel p-8 border-white/5">
              <div className="flex items-center justify-between mb-8">
                <h4 className="text-xs font-black uppercase tracking-[3px]">Revenue Pulse</h4>
                <div className="text-[9px] text-text-dim font-mono italic">PROJECTED EARNINGS</div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      stroke="#ffffff30" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{fill: '#8E9299'}}
                    />
                    <YAxis 
                      stroke="#ffffff30" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{fill: '#8E9299'}}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0A1118', border: '1px solid #ffffff10', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '10px', color: '#C2FF00', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '10px', color: '#8E9299', marginBottom: '4px' }}
                    />
                    <Bar dataKey="revenue" fill="#ffffff10" radius={[4, 4, 0, 0]}>
                      {stats.chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === stats.chartData.length - 1 ? '#C2FF00' : '#ffffff10'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
        
        {/* TOURNAMENT SECTION */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-neo-green" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Tournament Management</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="col-span-1 border border-border-dim p-6 bg-card-bg rounded-xl">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-6">Create New Tournament</h4>
              <form onSubmit={handleAddTournament} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Title</label>
                  <input 
                    type="text" required value={tTitle} onChange={e => setTTitle(e.target.value)}
                    placeholder="SUMMER CUP 2026"
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Date</label>
                    <input 
                      type="date" required value={tDate} onChange={e => setTDate(e.target.value)}
                      className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Time</label>
                    <input 
                      type="text" value={tTime} onChange={e => setTTime(e.target.value)}
                      placeholder="9 AM - 6 PM"
                      className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Location</label>
                  <input 
                    type="text" value={tLoc} onChange={e => setTLoc(e.target.value)}
                    placeholder="MAIN PITCH"
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Description</label>
                  <textarea 
                    required value={tDesc} onChange={e => setTDesc(e.target.value)}
                    placeholder="Enter tournament details, entry fee, prizes, etc."
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green min-h-[80px]"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isAddingT}
                  className="w-full bg-neo-green text-black uppercase tracking-widest text-[10px] font-bold py-4 hover:opacity-90 transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {isAddingT ? 'Adding...' : 'Create Tournament'}
                </button>
              </form>
            </div>

            <div className="col-span-1 lg:col-span-2 border border-border-dim p-6 bg-card-bg rounded-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim">Upcoming Tournaments ({filteredTournaments.length})</h4>
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                  <input 
                    type="text" 
                    placeholder="Search tournaments..." 
                    value={tournamentSearch}
                    onChange={e => setTournamentSearch(e.target.value)}
                    className="w-full bg-dark-bg border border-border-dim pl-8 pr-3 py-2 text-[10px] outline-none focus:border-neo-green uppercase tracking-widest"
                  />
                </div>
              </div>
              
              <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar pr-1">
                {filteredTournaments.map(t => (
                  <div key={t.id} className="bg-dark-bg border border-border-dim p-4 flex justify-between items-center group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-neo-green/5 rounded-lg flex items-center justify-center border border-neo-green/20">
                        <Trophy className="w-5 h-5 text-neo-green" />
                      </div>
                      <div>
                        <div className="text-white font-bold text-sm uppercase tracking-wider">{t.title}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3" /> {t.date}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {t.time}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteTournament(t.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {filteredTournaments.length === 0 && <div className="text-center py-10 text-gray-600 text-[10px] uppercase tracking-widest font-mono">No tournaments found</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border-dim pt-12">
          <div className="flex items-center gap-2 mb-6">
            <CalendarIcon className="w-5 h-5 text-neo-green" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">Booking Management</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ADD BOOKING FORM */}
            <div className="col-span-1 border border-border-dim p-6 h-fit bg-card-bg rounded-xl">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-6">Add New Booking</h4>
              <form onSubmit={handleAddBooking} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Date (YYYY-MM-DD)</label>
                  <input 
                    type="date"
                    required
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Time Slot (HH:mm)</label>
                  <input 
                    type="time"
                    required
                    value={newSlot}
                    onChange={e => setNewSlot(e.target.value)}
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Customer Name</label>
                  <input 
                    type="text"
                    required
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    placeholder="JOHN DOE"
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs uppercase outline-none focus:border-neo-green"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Customer Phone</label>
                  <input 
                    type="tel"
                    required
                    value={newUserPhone}
                    onChange={e => setNewUserPhone(e.target.value)}
                    placeholder="1234567890"
                    className="w-full bg-dark-bg border border-border-dim p-3 text-xs uppercase outline-none focus:border-neo-green"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isAdding}
                  className="w-full bg-neo-green text-black uppercase tracking-widest text-[10px] font-bold py-4 hover:opacity-90 transition-all mt-4 disabled:opacity-50"
                >
                  {isAdding ? 'Adding...' : 'Add Booking'}
                </button>
              </form>
            </div>

            {/* ALL BOOKINGS LIST */}
            <div className="col-span-1 lg:col-span-2 border border-border-dim p-6 bg-card-bg rounded-xl">
              <div className="flex flex-col gap-6 mb-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim">All Active Bookings ({sortedBookings.length})</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative col-span-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                    <input 
                      type="text" 
                      placeholder="Search name, phone or time..." 
                      value={bookingSearch}
                      onChange={e => setBookingSearch(e.target.value)}
                      className="w-full bg-dark-bg border border-border-dim pl-8 pr-3 py-2 text-[10px] outline-none focus:border-neo-green uppercase tracking-widest"
                    />
                  </div>
                  <div className="col-span-1 md:col-span-3 flex gap-2">
                    <div className="relative w-32 shrink-0">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                      <select 
                        value={membershipFilter}
                        onChange={e => setMembershipFilter(e.target.value)}
                        className="w-full bg-dark-bg border border-border-dim pl-8 pr-3 py-2 text-[10px] outline-none focus:border-neo-green uppercase tracking-widest appearance-none"
                      >
                        <option value="ALL">ALL PLANS</option>
                        <option value="NONE">GUEST</option>
                        <option value="BRONZE">BRONZE</option>
                        <option value="PLATINUM">PLATINUM</option>
                        <option value="GOLD">GOLD</option>
                        <option value="DIAMOND">DIAMOND</option>
                      </select>
                    </div>
                    <div className="flex-1 relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                      <input 
                        type="date" 
                        value={bookingDateStart}
                        onChange={e => setBookingDateStart(e.target.value)}
                        placeholder="Start Date"
                        className="w-full bg-dark-bg border border-border-dim pl-8 pr-3 py-2 text-[10px] outline-none focus:border-neo-green uppercase tracking-widest"
                      />
                    </div>
                    <div className="flex-1 relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                      <input 
                        type="date" 
                        value={bookingDateEnd}
                        onChange={e => setBookingDateEnd(e.target.value)}
                        placeholder="End Date"
                        className="w-full bg-dark-bg border border-border-dim pl-8 pr-3 py-2 text-[10px] outline-none focus:border-neo-green uppercase tracking-widest"
                      />
                    </div>
                    {(bookingDateStart || bookingDateEnd || bookingSearch) && (
                      <button 
                        onClick={() => {
                          setBookingDateStart('');
                          setBookingDateEnd('');
                          setBookingSearch('');
                        }}
                        className="px-3 bg-red-500/10 text-red-500 text-[8px] uppercase font-bold border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead className="text-[10px] uppercase tracking-widest text-text-dim sticky top-0 bg-card-bg z-10">
                    <tr>
                      <th className="pb-4 font-normal cursor-pointer hover:text-white transition-colors group" onClick={() => toggleSort('date')}>
                        <div className="flex items-center gap-1">Date <SortIcon column="date" /></div>
                      </th>
                      <th className="pb-4 font-normal cursor-pointer hover:text-white transition-colors group" onClick={() => toggleSort('slot')}>
                        <div className="flex items-center gap-1">Time <SortIcon column="slot" /></div>
                      </th>
                      <th className="pb-4 font-normal cursor-pointer hover:text-white transition-colors group" onClick={() => toggleSort('userName')}>
                        <div className="flex items-center gap-1">Customer <SortIcon column="userName" /></div>
                      </th>
                      <th className="pb-4 font-normal">Plan</th>
                      <th className="pb-4 font-normal">Promo</th>
                      <th className="pb-4 font-normal">Phone</th>
                      <th className="pb-4 font-normal text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim">
                    {sortedBookings.map(b => (
                      <tr key={b.id} className="hover:bg-dark-bg transition-colors">
                        {editingBookingId === b.id ? (
                          <>
                            <td className="py-2 pr-2">
                              <input 
                                type="date" 
                                value={editDate} 
                                onChange={e => setEditDate(e.target.value)}
                                className="w-full bg-dark-bg border border-border-dim p-1.5 text-[10px] outline-none focus:border-neo-green"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="time" 
                                value={editSlot} 
                                onChange={e => setEditSlot(e.target.value)}
                                className="w-full bg-dark-bg border border-border-dim p-1.5 text-[10px] outline-none focus:border-neo-green"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="text" 
                                value={editUserName} 
                                onChange={e => setEditUserName(e.target.value)}
                                className="w-full bg-dark-bg border border-border-dim p-1.5 text-[10px] outline-none focus:border-neo-green uppercase"
                              />
                            </td>
                            <td className="py-2 pr-2 text-[10px] font-mono opacity-40">
                              -
                            </td>
                            <td className="py-2 pr-2 text-[10px] font-mono opacity-40">
                              {b.referralCodeUsed || '-'}
                            </td>
                            <td className="py-2 pr-2">
                              <input 
                                type="text" 
                                value={editUserPhone} 
                                onChange={e => setEditUserPhone(e.target.value)}
                                className="w-full bg-dark-bg border border-border-dim p-1.5 text-[10px] outline-none focus:border-neo-green"
                              />
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex justify-end gap-1">
                                <button 
                                  onClick={handleUpdateBooking}
                                  disabled={isUpdating}
                                  className="text-neo-green hover:bg-neo-green/10 p-2 rounded-lg transition-all"
                                  title="Save Changes"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={cancelEditing}
                                  className="text-gray-500 hover:bg-white/10 p-2 rounded-lg transition-all"
                                  title="Cancel Edit"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-4 font-mono">{b.date}</td>
                            <td className="py-4 font-mono text-neo-green">{formatSlotDisplay(b.slot)}</td>
                            <td className="py-4 font-bold uppercase">{b.userName}</td>
                            <td className="py-4 text-[9px]">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full font-black uppercase tracking-tighter text-[7px] border",
                                (b.membership || userMemberships[b.userId]) === 'BRONZE' && "bg-orange-500/10 text-orange-500 border-orange-500/20",
                                (b.membership || userMemberships[b.userId]) === 'PLATINUM' && "bg-neo-green/10 text-neo-green border-neo-green/20",
                                (b.membership || userMemberships[b.userId]) === 'GOLD' && "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
                                (b.membership || userMemberships[b.userId]) === 'DIAMOND' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                (!(b.membership || userMemberships[b.userId]) || (b.membership || userMemberships[b.userId]) === 'NONE') && "bg-white/5 text-gray-500 border-white/10",
                              )}>
                                {b.membership || userMemberships[b.userId] || 'GUEST'}
                              </span>
                            </td>
                            <td className="py-4 font-mono text-[9px] text-neo-green font-black">{b.referralCodeUsed || <span className="text-white/10">-</span>}</td>
                            <td className="py-4 font-mono text-text-dim">{b.userPhone}</td>
                            <td className="py-4 text-right">
                              <div className="flex justify-end gap-1">
                                <button 
                                  onClick={() => startEditing(b)}
                                  className="text-white/40 hover:text-white hover:bg-white/10 transition-all p-2 rounded-lg"
                                  title="Edit Booking"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDelete(b.id)}
                                  className="text-red-500/40 hover:text-red-500 hover:bg-red-500/10 transition-all p-2 rounded-lg"
                                  title="Cancel Booking"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {sortedBookings.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-text-dim text-[10px] uppercase tracking-widest">
                          No active bookings
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border-dim pt-12 pb-12">
          <div className="flex items-center gap-2 mb-6">
            <Timer className="w-5 h-5 text-neo-green" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-white">System Settings</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* BASE RATE */}
            <div className="border border-border-dim p-6 bg-card-bg rounded-xl h-fit">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-6 flex items-center gap-2">
                <IndianRupee className="w-3 h-3" />
                Base Pricing
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase text-text-dim tracking-widest mb-2">Base Hourly Rate (₹)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      value={baseRateInput} 
                      onChange={e => setBaseRateInput(Number(e.target.value))}
                      className="flex-1 bg-dark-bg border border-border-dim p-3 text-xs outline-none focus:border-neo-green font-mono"
                    />
                    <button 
                      onClick={handleUpdateRate}
                      disabled={isUpdatingRate}
                      className="bg-neo-green text-black px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all"
                    >
                      {isUpdatingRate ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                  <p className="text-[9px] text-text-dim/60 mt-3 leading-relaxed">
                    Default rate applies if no time-based rule matches the slot.
                  </p>
                </div>
              </div>
            </div>

            {/* TIME BASED PRICING */}
            <div className="border border-border-dim p-6 bg-card-bg rounded-xl flex flex-col">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-6 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Peak/Off-Peak Rules
              </h4>
              
              <div className="space-y-4 mb-8">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[8px] uppercase text-text-dim tracking-widest mb-1">Start</label>
                    <input 
                      type="time" 
                      value={newSlotStart}
                      onChange={e => setNewSlotStart(e.target.value)}
                      className="w-full bg-dark-bg border border-border-dim p-2 text-[10px] outline-none focus:border-neo-green font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase text-text-dim tracking-widest mb-1">End</label>
                    <input 
                      type="time" 
                      value={newSlotEnd}
                      onChange={e => setNewSlotEnd(e.target.value)}
                      className="w-full bg-dark-bg border border-border-dim p-2 text-[10px] outline-none focus:border-neo-green font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] uppercase text-text-dim tracking-widest mb-1">Rate (₹)</label>
                    <input 
                      type="number" 
                      value={newSlotPrice}
                      onChange={e => setNewSlotPrice(Number(e.target.value))}
                      className="w-full bg-dark-bg border border-border-dim p-2 text-[10px] outline-none focus:border-neo-green font-mono"
                    />
                  </div>
                </div>
                <button 
                  onClick={handleAddTimeSlot}
                  disabled={isUpdatingRate}
                  className="w-full bg-white/5 border border-white/10 text-white py-3 text-[9px] font-black uppercase tracking-widest hover:bg-neo-green hover:text-black transition-all disabled:opacity-50"
                >
                  Add Custom Pricing Rule
                </button>
              </div>

              <div className="flex-1 space-y-3">
                {timeBasedPricing.length > 0 ? (
                  timeBasedPricing.map((rule, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 group hover:border-neo-green/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="bg-neo-green/10 px-2 py-1 rounded text-[10px] font-mono font-bold text-neo-green">
                          {rule.start} - {rule.end}
                        </div>
                        <div className="text-sm font-black tracking-tight">₹{rule.price}</div>
                      </div>
                      <button 
                        onClick={() => handleRemoveTimeSlot(idx)}
                        className="text-red-500/40 hover:text-red-500 p-2 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center border border-dashed border-white/5 text-[9px] uppercase tracking-widest text-text-dim">
                    No custom rules defined
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}


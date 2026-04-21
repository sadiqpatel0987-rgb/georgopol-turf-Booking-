/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { 
  Calendar, 
  Phone, 
  Award, 
  Clock, 
  MapPin, 
  User, 
  Mail,
  CheckCircle2, 
  ChevronRight,
  CreditCard,
  ShieldCheck,
  Star,
  LogOut,
  Trash2,
  Menu,
  X,
  Trophy,
  Globe,
  Tag,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { io } from 'socket.io-client';
import { 
  MembershipType, 
  MEMBERSHIP_PLANS, 
  BASE_HOURLY_RATE,
  REFERRAL_DISCOUNT,
  UserProfile,
  TimeBasedPricing
} from './types';

// Firebase Imports
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  getDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  where, 
  limit, 
  getDocs, 
  updateDoc, 
  setDoc,
  increment 
} from 'firebase/firestore';
import AuthScreen from './AuthScreen';
import AdminDashboard from './AdminDashboard';

// Error Handling Spec
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function formatSlotDisplay(slot: string) {
  const hour = parseInt(slot, 10);
  if (isNaN(hour)) return slot;
  const nextHour = (hour + 1) % 24;
  
  const formatHour = (h: number) => {
    const ampm = h >= 12 ? 'pm' : 'am';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}${ampm}`;
  };
  
  return `${formatHour(hour)}-${formatHour(nextHour)}`;
}

const TIME_SLOTS = [
  "00:00", "01:00", "02:00", "03:00", "04:00", "05:00",
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
];

export interface ServerBooking {
  id: string; // Firestore document ID
  date: string;
  slot: string;
  userName: string;
  userPhone: string;
  userId: string;
  membership?: MembershipType; // For admin filtering
  referralCodeUsed?: string;
  discountType?: 'REFERRAL' | 'NONE';
  createdAt: string;
}

export interface Tournament {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  location: string;
  createdAt: string;
}

export interface GamePost {
  id: string;
  userId: string;
  userName: string;
  sport: 'FOOTBALL' | 'CRICKET';
  date: string;
  time: string;
  playersNeeded: number;
  description?: string;
  contactInfo?: string;
  createdAt: string;
}

export default function App() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookings, setBookings] = useState<ServerBooking[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [gamePosts, setGamePosts] = useState<GamePost[]>([]);
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);
  const [hourlyRate, setHourlyRate] = useState(BASE_HOURLY_RATE);
  const [timeBasedPricing, setTimeBasedPricing] = useState<TimeBasedPricing[]>([]);
  
  const [membership, setMembership] = useState<MembershipType>('NONE');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userReferralCode, setUserReferralCode] = useState('');
  const [referralsCount, setReferralsCount] = useState(0);
  const [hasUsedReferral, setHasUsedReferral] = useState(false);

  // Booking details
  const [appliedReferralCode, setAppliedReferralCode] = useState('');
  const [isReferralValid, setIsReferralValid] = useState<boolean | null>(null);
  const [referrerId, setReferrerId] = useState<string | null>(null);
  
  const [isBooking, setIsBooking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [slotToCancel, setSlotToCancel] = useState<ServerBooking | null>(null);
  const [dismissedTooltips, setDismissedTooltips] = useState<Record<string, boolean>>({});

  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [currentTab, setCurrentTab] = useState<'booking' | 'events' | 'community'>('booking');
  const [activeViewers, setActiveViewers] = useState(1);
  const socketRef = React.useRef<any>(null);

  // Admin Setup
  const isAdmin = useMemo(() => {
    const email = authUser?.email?.toLowerCase();
    return (
      email === 'patelsadiq233@gmail.com' || 
      email === 'sadiqpatel0987@gmail.com' ||
      email === 'patelsadiq13@gmail.com'
    );
  }, [authUser]);
  const [currentView, setCurrentView] = useState<'app' | 'admin'>('app');

  // 1. Auth Listener
  useEffect(() => {
    // 0. Socket Presence & Broadcast Listener
    if (!socketRef.current) {
      socketRef.current = io();
      
      socketRef.current.on('presenceUpdate', (data: { count: number }) => {
        setActiveViewers(data.count);
      });

      socketRef.current.on('bookingsUpdated', () => {
        console.log('Real-time sync: Availability data refreshed.');
      });
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        // Fetch User Profile
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
             const data = docSnap.data() as UserProfile;
             setUserName(data.name || '');
             setUserPhone(data.phone || '');
             setMembership(data.membership || 'NONE');
             
             // Referral Logic
             if (!data.referralCode) {
               const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
               await updateDoc(userDocRef, { 
                 referralCode: newCode,
                 referralsCount: 0,
                 hasUsedReferral: false
               });
               setUserReferralCode(newCode);
               setReferralsCount(0);
               setHasUsedReferral(false);
             } else {
               setUserReferralCode(data.referralCode);
               setReferralsCount(data.referralsCount || 0);
               setHasUsedReferral(!!data.hasUsedReferral);
             }
          } else {
             // Create Profile if missing
             const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
             const initialProfile: UserProfile = {
               uid: user.uid,
               name: user.displayName || 'Member',
               email: user.email || '',
               phone: user.phoneNumber || '',
               membership: 'NONE',
               referralCode: newCode,
               referralsCount: 0,
               createdAt: new Date().toISOString()
             };
             await setDoc(userDocRef, initialProfile);
             setUserName(initialProfile.name);
             setUserPhone(initialProfile.phone);
             setMembership('NONE');
             setUserReferralCode(newCode);
             setReferralsCount(0);
          }
        } catch(e) {
          handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
        }
      }
      setAuthReady(true);
    });

    return () => {
      unsubscribeAuth();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // 2. Firestore Bookings Listener - Public
  useEffect(() => {
    // We remove the !authUser guard to allow everyone to see availability
    const q = collection(db, 'bookings');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBookings: ServerBooking[] = [];
      snapshot.forEach(doc => {
        fetchedBookings.push({ id: doc.id, ...doc.data() } as ServerBooking);
      });
      setBookings(fetchedBookings);
    }, (error) => {
      // Gracefully handle permission errors if they occur during auth transition
      if (error.message.includes('insufficient permissions')) {
        console.warn('Bookings permission error (likely during auth transition)');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    });

    return () => unsubscribe();
  }, []); // Run for all connected clients

  // 3. Tournaments Listener
  useEffect(() => {
    // We allow public read in rules, so we can start listening immediately.
    // However, we depend on authUser to ensure that if rules were restricted, 
    // the listener would re-trigger with the new auth context.
    const q = collection(db, 'tournaments');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTournaments: Tournament[] = [];
      snapshot.forEach(doc => {
        fetchedTournaments.push({ id: doc.id, ...doc.data() } as Tournament);
      });
      setTournaments(fetchedTournaments.sort((a, b) => a.date.localeCompare(b.date)));
    }, (error) => {
      // Gracefully handle permission errors if they occur during auth transition
      if (error.message.includes('insufficient permissions')) {
        console.warn('Tournaments permission error (likely during auth transition)');
      } else {
        handleFirestoreError(error, OperationType.LIST, 'tournaments');
      }
    });

    return () => unsubscribe();
  }, [authUser]);

  // 5. GamePosts Listener
  useEffect(() => {
    if (!authUser) return;
    const q = collection(db, 'game_posts');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts: GamePost[] = [];
      snapshot.forEach(doc => {
        fetchedPosts.push({ id: doc.id, ...doc.data() } as GamePost);
      });
      setGamePosts(fetchedPosts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'game_posts');
    });
    return () => unsubscribe();
  }, [authUser]);

  // 6. Weather Effect
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=18.6251&longitude=73.8824&current=temperature_2m,weather_code');
        const data = await response.json();
        
        // Simple mapping for demonstration
        const code = data.current.weather_code;
        let cond = 'Clear';
        if (code >= 1 && code <= 3) cond = 'Partly Cloudy';
        if (code >= 45 && code <= 48) cond = 'Fog';
        if (code >= 51 && code <= 67) cond = 'Rain';
        if (code >= 71 && code <= 86) cond = 'Snow';
        if (code >= 95) cond = 'Stormy';

        setWeather({
          temp: Math.round(data.current.temperature_2m),
          condition: cond
        });
      } catch (e) {
        console.error('Weather fetch error:', e);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 600000); // Update every 10 min
    return () => clearInterval(interval);
  }, []);

  // 4. Pricing Settings Listener
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'pricing'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setHourlyRate(data.baseHourlyRate);
        setTimeBasedPricing(data.timeBasedPricing || []);
      }
    }, (error) => {
      if (error.message.includes('insufficient permissions')) {
        console.warn('Pricing settings permission error (Rules might be propagating)');
      } else {
        handleFirestoreError(error, OperationType.GET, 'settings/pricing');
      }
    });
    return () => unsubscribe();
  }, []);

  const bookedSlotsMap = useMemo(() => {
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    const map = new Map<string, ServerBooking>();
    bookings.forEach(b => {
      if (b.date === formattedDate) {
        map.set(b.slot, b);
      }
    });
    return map;
  }, [bookings, selectedDate]);

  const toggleSlot = (slot: string) => {
    if (bookedSlotsMap.has(slot)) return;
    
    setSelectedSlots(prev => 
      prev.includes(slot) 
        ? prev.filter(s => s !== slot) 
        : [...prev, slot]
    );
  };

  const totalPrice = useMemo(() => {
    const hours = selectedSlots.length;
    if (hours === 0) return 0;

    // Plans with upfront payment often have '0' additional fee per slot in this simplified model
    if (membership === 'PLATINUM' || membership === 'DIAMOND' || membership === 'GOLD') {
      return 0; 
    }

    let total = 0;
    selectedSlots.forEach(slotTime => {
      // Find if there's a specific rate for this slot
      const specialRate = timeBasedPricing.find(rule => {
        const [slotH] = slotTime.split(':').map(Number);
        const [startH] = rule.start.split(':').map(Number);
        const [endH] = rule.end.split(':').map(Number);
        
        // Simple hourly check
        return slotH >= startH && slotH < endH;
      });

      total += specialRate ? specialRate.price : hourlyRate;
    });

    // Bronze gets a 10% discount
    if (membership === 'BRONZE') {
      total = total * 0.9;
    }

    if (isReferralValid) {
      total = Math.max(0, total - REFERRAL_DISCOUNT);
    }
    return Math.round(total);
  }, [selectedSlots, membership, hourlyRate, isReferralValid, timeBasedPricing]);

  const validateReferral = async (code: string) => {
    if (!code || code.length < 3) {
      setIsReferralValid(null);
      setReferrerId(null);
      return;
    }

    if (hasUsedReferral) {
      setIsReferralValid(false);
      setReferrerId(null);
      setAppError("You have already used a referral discount.");
      return;
    }

    if (code.toUpperCase() === userReferralCode) {
      setIsReferralValid(false);
      setReferrerId(null);
      setAppError("You cannot use your own referral code.");
      return;
    }

    try {
      const q = query(collection(db, 'users'), where('referralCode', '==', code.toUpperCase()), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setIsReferralValid(true);
        setReferrerId(querySnapshot.docs[0].id);
        setAppError(null);
      } else {
        setIsReferralValid(false);
        setReferrerId(null);
        setAppError("Invalid referral code.");
      }
    } catch (error) {
      console.error('Error validating referral:', error);
      setIsReferralValid(false);
      setAppError("Failed to validate referral code.");
    }
  };

  const getSlotPrice = (slotTime: string) => {
    const specialRate = timeBasedPricing.find(rule => {
      const [slotH] = slotTime.split(':').map(Number);
      const [startH] = rule.start.split(':').map(Number);
      const [endH] = rule.end.split(':').map(Number);
      return slotH >= startH && slotH < endH;
    });
    return specialRate ? specialRate.price : hourlyRate;
  };

  const handleBooking = async () => {
    if (!authUser || !userName || !userPhone || selectedSlots.length === 0) return;

    setIsBooking(true);
    try {
      const batch = writeBatch(db);
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      
      selectedSlots.forEach(slot => {
        const docRef = doc(collection(db, 'bookings'));
        batch.set(docRef, {
          date: formattedDate,
          slot,
          userName,
          userPhone,
          userId: authUser.uid,
          membership, // Added for admin filtering
          referralCodeUsed: isReferralValid ? appliedReferralCode.toUpperCase() : '',
          discountType: isReferralValid ? 'REFERRAL' : 'NONE',
          createdAt: new Date().toISOString()
        });
      });

      if (isReferralValid && referrerId) {
        const referrerRef = doc(db, 'users', referrerId);
        batch.update(referrerRef, {
          referralsCount: increment(1)
        });
        
        // Mark current user as having used a referral
        const userRef = doc(db, 'users', authUser.uid);
        batch.update(userRef, {
          hasUsedReferral: true
        });
      }

      await batch.commit();
      
      // Notify other clients via WebSockets
      if (socketRef.current) {
        socketRef.current.emit('bookingChanged');
      }

      if (isReferralValid) setHasUsedReferral(true);
      setAppError(null);
      setShowSuccess(true);
      setSelectedSlots([]);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error: any) {
      setAppError("Failed to confirm booking. Please try again later.");
      handleFirestoreError(error, OperationType.WRITE, 'bookings');
    } finally {
      setIsBooking(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!slotToCancel || !slotToCancel.id) return;
    try {
      await deleteDoc(doc(db, 'bookings', slotToCancel.id));
      
      // Notify other clients via WebSockets
      if (socketRef.current) {
        socketRef.current.emit('bookingChanged');
      }

      setSlotToCancel(null);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `bookings/${slotToCancel.id}`);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const handleCreatePost = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!authUser || !userName) return;
    
    const formData = new FormData(e.currentTarget);
    const postData = {
      userId: authUser.uid,
      userName: userName,
      sport: formData.get('sport') as 'FOOTBALL' | 'CRICKET',
      date: formData.get('date') as string,
      time: formData.get('time') as string,
      playersNeeded: parseInt(formData.get('players') as string),
      description: formData.get('description') as string,
      contactInfo: userPhone,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(collection(db, 'game_posts')), postData);
      setShowPostModal(false);
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, 'game_posts');
    }
  };

  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(new Date()), i));

  const myBookings = useMemo(() => {
    if (!authUser) return [];
    return bookings
      .filter(b => b.userId === authUser.uid)
      .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot));
  }, [bookings, authUser]);

  // Render Loading
  if (!authReady) {
    return <div className="min-h-screen bg-dark-bg flex items-center justify-center text-neo-green font-bold uppercase tracking-widest text-sm">Loading Application...</div>;
  }

  // Render Auth
  if (!authUser) {
    return <AuthScreen />;
  }

  return (
    <div className="relative flex flex-col min-h-[100dvh] font-sans text-white bg-[#0A0F0B]">
      {/* Background Image & Overlay - Optimized for Fast Mobile Loading */}
      <div className="absolute inset-0 z-0 overflow-hidden fixed bg-[#0A0F0B]">
        <picture>
          <source media="(max-width: 640px)" srcSet="https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=60&w=800&auto=format,compress&fit=crop" />
          <img 
            src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=2000&auto=format,compress&fit=crop" 
            alt="Stadium turf background" 
            className="w-full h-full object-cover object-center"
            decoding="async" 
            fetchPriority="high" 
          />
        </picture>
      </div>
      <div className="absolute inset-0 z-0 bg-black/60 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)] fixed pointer-events-none" />

      <div className="relative z-10 w-full max-w-[1300px] mx-auto flex-1 flex flex-col p-3 sm:p-6 lg:p-8">
        {/* HEADER */}
        <header className="flex justify-between items-center mb-6 lg:mb-8 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <button 
              onClick={() => setShowMenu(true)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors lg:hidden"
            >
              <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-neo-green" />
            </button>
            <div className="w-12 h-12 sm:w-16 sm:h-16 xl:w-20 xl:h-20 bg-neo-green clip-hexagon flex items-center justify-center cursor-pointer" onClick={() => {setCurrentTab('booking'); setCurrentView('app');}}>
              <span className="text-black text-2xl sm:text-4xl xl:text-5xl font-black italic -ml-0.5 sm:-ml-1">G</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-2xl lg:text-3xl xl:text-4xl font-black tracking-widest text-neo-green uppercase">GEORGOPOL</h1>
              <p className="text-[9px] lg:text-[10px] xl:text-[11px] tracking-[1.5px] lg:tracking-[2px] text-gray-400 mt-0.5 uppercase">Premium Turf Collective</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[8px] lg:text-[9px] text-neo-green/70 font-mono font-bold uppercase tracking-wider">
                <MapPin className="w-2.5 h-2.5" />
                Near Horizon School, Gaikwad Nagar, Dighi, Pune 411015
              </div>
            </div>
            {/* MINI HEADER FOR MOBILE */}
            <div className="sm:hidden">
               <h1 className="text-lg font-black tracking-widest text-neo-green uppercase">GEORGOPOL</h1>
               <div className="flex items-center gap-1 text-[7px] text-gray-400 uppercase font-bold tracking-widest opacity-80">
                 <MapPin className="w-2 h-2" /> DIGHI, PUNE
               </div>
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end gap-2 text-[11px] sm:text-sm xl:text-base text-gray-300">
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="opacity-80 hidden xs:inline">logged in as <span className="text-white font-medium">{authUser.email?.split('@')[0]}</span></span>
              <button 
                onClick={() => setShowProfileModal(true)} 
                className="flex items-center gap-2 border border-white/20 rounded-md px-2 py-1 sm:px-3 sm:py-1.5 hover:bg-white/10 transition-colors"
              >
                <User className="w-3.5 h-3.5 sm:w-4 h-4" />
                <span className="text-[10px] sm:text-[12px]">Account</span>
              </button>
              <button 
                onClick={handleLogout} 
                className="flex items-center gap-2 border border-red-500/20 rounded-md px-2 py-1 sm:px-3 sm:py-1.5 hover:bg-red-500/10 transition-colors text-red-500"
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 h-4" />
                <span className="text-[10px] sm:text-[12px]">Sign Out</span>
              </button>
            </div>
              <div className="flex flex-col text-right uppercase tracking-widest font-mono text-sm xl:text-base">
                <div className="flex items-center gap-4 justify-end">
                  {weather && (
                    <div className="flex items-center gap-2 text-white/60">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] sm:text-[11px] font-black text-white">{weather.temp}°C</span>
                        <span className="text-[7px] sm:text-[8px] opacity-70">{weather.condition}</span>
                      </div>
                      <Globe className="w-4 h-4 text-white/40" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

        {/* TAB SWITCHER */}
        <div className="flex gap-4 mb-8 bg-black/40 p-1.5 rounded-2xl border border-white/5 w-max">
          <button 
            onClick={() => { setCurrentTab('booking'); setCurrentView('app'); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[2px] transition-all",
              currentTab === 'booking' && currentView === 'app' ? "bg-neo-green text-black" : "text-gray-500 hover:text-white"
            )}
          >
            Booking
          </button>
          <button 
            onClick={() => { setCurrentTab('events'); setCurrentView('app'); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[2px] transition-all",
              currentTab === 'events' && currentView === 'app' ? "bg-neo-green text-black" : "text-gray-500 hover:text-white"
            )}
          >
            Events
          </button>
          <button 
            onClick={() => { setCurrentTab('community'); setCurrentView('app'); }}
            className={cn(
              "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[2px] transition-all",
              currentTab === 'community' && currentView === 'app' ? "bg-neo-green text-black" : "text-gray-500 hover:text-white"
            )}
          >
            Community
          </button>
          {isAdmin && (
            <button 
              onClick={() => setCurrentView('admin')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[2px] transition-all",
                currentView === 'admin' ? "bg-neo-green text-black" : "text-[#C2FF00]/60 hover:text-neo-green border border-neo-green/20"
              )}
            >
              Admin
            </button>
          )}
        </div>

        {/* MAIN CONTAINER */}
        <main className="flex-1 flex flex-col">
          {currentView === 'admin' ? (
            <div className="glass-panel w-full max-w-5xl mx-auto">
              <AdminDashboard 
                bookings={bookings} 
                tournaments={tournaments} 
                adminUid={authUser.uid} 
                hourlyRate={hourlyRate}
                timeBasedPricing={timeBasedPricing}
                onDataChange={() => socketRef.current?.emit('bookingChanged')}
              />
            </div>
          ) : currentTab === 'events' ? (
            <div className="glass-panel w-full max-w-4xl mx-auto flex flex-col gap-8">
              <h2 className="text-3xl font-black text-neo-green tracking-[4px] uppercase mb-4">Upcoming Tournaments</h2>
              {tournaments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {tournaments.map(tournament => (
                    <div key={tournament.id} className="bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div className="bg-neo-green/10 p-3 rounded-xl">
                          <Trophy className="w-6 h-6 text-neo-green" />
                        </div>
                        <div className="text-right">
                          <div className="text-neo-green font-bold text-lg">{format(new Date(tournament.date + 'T00:00:00'), 'MMM dd')}</div>
                          <div className="text-gray-400 text-xs uppercase tracking-widest">{tournament.time}</div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-2">{tournament.title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{tournament.description}</p>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400 text-xs mt-auto">
                        <MapPin className="w-4 h-4 text-neo-green" />
                        <span>{tournament.location || 'Georgopol Turf'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <p className="text-gray-500 uppercase tracking-widest text-sm">No upcoming tournaments scheduled yet.</p>
                </div>
              )}
              <button 
                onClick={() => setCurrentTab('booking')}
                className="mt-8 border border-neo-green text-neo-green px-8 py-3 rounded-full hover:bg-neo-green/10 transition-all font-bold uppercase tracking-widest text-xs self-center"
              >
                Back to Booking
              </button>
            </div>
          ) : currentTab === 'community' ? (
            <div className="glass-panel w-full max-w-4xl mx-auto flex flex-col gap-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div>
                  <h2 className="text-3xl font-black text-neo-green tracking-[4px] uppercase">Matchmaking</h2>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Found a gap? Find a player. Georgopol Community Board.</p>
                </div>
                <button 
                  onClick={() => setShowPostModal(true)}
                  className="w-full sm:w-auto bg-neo-green text-black px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(194,255,0,0.3)]"
                >
                  Post a Game
                </button>
              </div>
              
              {gamePosts.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                   {gamePosts.map(post => (
                     <div key={post.id} className="bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 hover:border-neo-green/30 transition-all group relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                         <Globe className="w-24 h-24 text-neo-green" />
                       </div>
                       
                       <div className="flex flex-col gap-3 w-full relative z-10">
                         <div className="flex items-center gap-3">
                           <span className={cn(
                             "text-[9px] font-black px-2.5 py-1 rounded-sm border uppercase tracking-widest",
                             post.sport === 'FOOTBALL' ? "bg-neo-green/10 text-neo-green border-neo-green/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                           )}>{post.sport}</span>
                           <span className="text-[10px] text-gray-500 font-mono uppercase flex items-center gap-2">
                             <Clock className="w-3 h-3" /> {post.date} @ {post.time}
                           </span>
                         </div>
                         <h3 className="text-xl font-bold text-white uppercase tracking-wider">{post.userName} needs {post.playersNeeded} {post.playersNeeded === 1 ? 'Player' : 'Players'}</h3>
                         <p className="text-sm text-gray-400 max-w-xl italic leading-relaxed">"{post.description || 'Looking for teammates to join a casual match at Dighi Turf.'}"</p>
                       </div>
                       
                       <div className="flex flex-col items-center sm:items-end gap-3 shrink-0 w-full md:w-auto relative z-10">
                         <div className="text-[10px] text-gray-500 uppercase tracking-widest bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 font-mono flex items-center gap-2">
                           <User className="w-3 h-3" /> UID: {post.userId.substring(0,8)}
                         </div>
                         <button 
                           onClick={() => window.open(`tel:${post.contactInfo || '0000000000'}`)}
                           className="w-full md:w-auto bg-white/5 hover:bg-neo-green hover:text-black transition-all text-[11px] font-black uppercase tracking-[2px] px-8 py-3.5 rounded-2xl border border-white/10"
                         >
                           Join Match
                         </button>
                       </div>
                     </div>
                   ))}
                </div>
              ) : (
                <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.02]">
                  <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Globe className="w-8 h-8 text-white/20" />
                  </div>
                  <h4 className="text-white font-bold uppercase tracking-widest mb-2">No Active Posts</h4>
                  <p className="text-gray-500 uppercase tracking-widest text-[10px]">The board is currently clear. Be the spark and post a match requirement.</p>
                </div>
              )}
              
              <button 
                onClick={() => setCurrentTab('booking')}
                className="mt-8 border border-neo-green text-neo-green px-10 py-4 rounded-full hover:bg-neo-green/10 transition-all font-bold uppercase tracking-widest text-[11px] self-center"
              >
                Back to Pitch
              </button>
            </div>
          ) : (
          <div className="flex-1 max-w-[1300px] w-full grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            {/* LEFT SECTION */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              
              {/* VENUE ALLOCATION INFO */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-5 border-neo-green/20 bg-neo-green/5 relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                  <MapPin className="w-24 h-24 text-neo-green" />
                </div>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-neo-green/10 rounded-xl border border-neo-green/20 shrink-0">
                      <MapPin className="w-6 h-6 text-neo-green" />
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[3px] text-neo-green mb-1">Venue Allocation</h3>
                      <p className="text-[11px] text-white font-bold uppercase tracking-wider leading-tight">Gaikwad Nagar, Vijay Nagar, Dighi, Pune, Maharashtra 411015</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5">Near Horizon School, Pimpri-Chinchwad</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-[8px] font-mono text-neo-green font-black uppercase tracking-widest flex items-center gap-1.5">
                      <Globe className="w-3 h-3" /> DIST: PUNE
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Date Selector Pill */}
              <div className="flex items-center gap-2 sm:gap-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl sm:rounded-full px-3 sm:px-4 py-2 w-full sm:w-max shadow-lg mb-2">
                <button className="p-2 text-white/50 hover:text-white transition hidden sm:block"><ChevronRight className="w-5 h-5 rotate-180" /></button>
                <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1 justify-between sm:justify-start">
                  {next7Days.map((date) => (
                    <button
                      key={date.toISOString()}
                      onClick={() => {
                        setSelectedDate(date);
                        setSelectedSlots([]);
                      }}
                      className={cn(
                        "flex-shrink-0 w-14 sm:w-[4.5rem] py-2 sm:py-3 rounded-xl sm:rounded-2xl transition-all duration-300 flex flex-col items-center justify-center border",
                        isSameDay(date, selectedDate)
                          ? "border-neo-green bg-neo-green/10 text-neo-green shadow-[0_0_15px_rgba(194,255,0,0.2)]"
                          : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5"
                      )}
                    >
                      <div className="text-[9px] sm:text-[11px] font-medium mb-0.5 uppercase">{format(date, 'EEE')}</div>
                      <div className="text-base sm:text-xl font-bold">{format(date, 'd')}</div>
                    </button>
                  ))}
                </div>
                <button className="p-2 text-white/50 hover:text-white transition hidden sm:block"><ChevronRight className="w-5 h-5" /></button>
              </div>

              {/* TIME SLOTS GLASS PANEL */}
              <div className="glass-panel w-full p-4 sm:p-6 lg:p-10">

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3 lg:gap-4">
            {TIME_SLOTS.map((slot) => {
              const bookedSlotData = bookedSlotsMap.get(slot);
              const bookedBy = bookedSlotData?.userName;
              const isBooked = !!bookedBy;
              const isSelected = selectedSlots.includes(slot);
              const isMyBooking = bookedSlotData?.userId === authUser.uid;
              const canManage = isMyBooking || isAdmin;
              
              const displayTime = formatSlotDisplay(slot);

              // Past time logic
              const hour = parseInt(slot, 10);
              const slotDateTime = new Date(selectedDate);
              slotDateTime.setHours(hour, 0, 0, 0);
              const isPast = slotDateTime < new Date();
              const isDisabled = isPast && !isBooked && !isAdmin;

              return (
                <button
                  key={slot}
                  disabled={isDisabled}
                  onClick={() => {
                    if (isBooked && bookedSlotData) {
                      if (canManage) {
                        setSlotToCancel(bookedSlotData);
                      }
                    } else if (!isDisabled) {
                      toggleSlot(slot);
                    }
                  }}
                  className={cn(
                    "relative py-5 xl:py-6 border rounded-2xl text-center transition-all duration-300 px-2 shadow-lg group",
                    isDisabled
                      ? "opacity-20 cursor-not-allowed bg-black/40 border-white/5"
                      : isBooked
                        ? cn(
                            "bg-black/60 opacity-50 border-white/10",
                            canManage ? "hover:opacity-100 hover:border-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "cursor-not-allowed"
                          )
                        : isSelected
                          ? "border-neo-green bg-neo-green shadow-[0_0_20px_rgba(187,255,0,0.4)]"
                          : "border-white/10 bg-white/5 hover:border-neo-green/50 hover:bg-neo-green/5"
                  )}
                >
                  {/* Price Tooltip on Hover */}
                  {!isDisabled && !isBooked && !dismissedTooltips[slot] && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-300 z-20 flex flex-col items-center">
                      <div className="bg-neo-green text-black text-[9px] font-black px-1.5 py-1 flex items-center gap-1 rounded shadow-xl uppercase tracking-tighter whitespace-nowrap">
                        <span>{['PLATINUM', 'GOLD', 'DIAMOND'].includes(membership) ? 'Free' : `₹${membership === 'BRONZE' ? Math.round(getSlotPrice(slot) * 0.9) : getSlotPrice(slot)}`}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissedTooltips(prev => ({...prev, [slot]: true}));
                          }}
                          className="hover:bg-black/20 rounded p-0.5 ml-1 transition-colors pointer-events-auto"
                        >
                          <X className="w-2 h-2" />
                        </button>
                      </div>
                      <div className="w-2 h-2 bg-neo-green rotate-45 -mt-1 pointer-events-none" />
                    </div>
                  )}

                  {/* Status Indicator */}
                  {!isDisabled && (
                    <div className={cn(
                      "absolute top-3 right-3 w-1.5 h-1.5 rounded-full transition-colors",
                      isBooked ? "bg-red-500 animate-pulse" : isSelected ? "bg-black" : "bg-neo-green/30 group-hover:bg-neo-green"
                    )} />
                  )}
                  
                  <span className={cn(
                    "block text-[13px] xl:text-[15px] font-black mb-1 truncate tracking-tight transition-colors",
                    isSelected ? "text-black" : "text-white"
                  )}>
                    {displayTime}
                  </span>
                  <span className={cn(
                    "text-[9px] xl:text-[10px] block truncate text-center uppercase tracking-widest transition-colors",
                    isSelected ? "text-black/60 font-bold" : "text-gray-500"
                  )}>
                    {isBooked ? "BOOKED" : isDisabled ? "PASSED" : isSelected ? "SELECTED" : "AVAILABLE"}
                  </span>

                  {isBooked && canManage && (
                    <div className="absolute inset-0 bg-red-500/0 hover:bg-red-500/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                      <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter">Cancel?</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-5 text-[11px] text-text-dim mt-8">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-neo-green" /> Selected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-border-dim" /> Available
            </span>
            <span className="flex items-center gap-1.5 opacity-40">
              <span className="w-2 h-2 bg-booked-bg" /> 
              {myBookings.length > 0 ? "Booked (Yours: Click to Cancel)" : "Booked"}
            </span>
          </div>

        </div> {/* END TIME SLOTS GLASS PANEL */}
      </div> {/* END LEFT SECTION */}

      {/* SIDE PANEL */}
      <aside className="lg:col-span-4 glass-panel flex flex-col lg:sticky lg:top-8 lg:max-h-[calc(100vh-6rem)] px-0 pt-0 pb-6 overflow-y-auto no-scrollbar">
        {/* Memberships */}
        <div className="p-8 border-b border-white/10">
            <div className="section-header mb-6">Select Membership</div>
            <div className="space-y-4">
              {/* BRONZE CARD */}
              <button 
                onClick={() => setMembership('BRONZE')}
                className={cn(
                  "w-full text-left p-5 transition-all bg-[#1A1A1A] border border-white/5 relative overflow-hidden group",
                  membership === 'BRONZE' 
                    ? "border-orange-500 ring-1 ring-orange-500/30" 
                    : "hover:border-orange-500/50 opacity-80 hover:opacity-100"
                )}
              >
                {membership === 'BRONZE' && (
                  <div className="absolute top-0 right-0 bg-orange-500 text-black text-[8px] font-black px-3 py-1 uppercase tracking-tighter">
                    Active Plan
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-black uppercase text-orange-500 tracking-[2px] mb-1">Bronze</div>
                    <div className="text-2xl font-black tracking-tight text-white flex items-baseline gap-1">
                      ₹1K <span className="text-[10px] font-medium text-text-dim uppercase tracking-widest">/mo</span>
                    </div>
                  </div>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                    membership === 'BRONZE' ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-white/5"
                  )}>
                    <Trophy className={cn("w-4 h-4", membership === 'BRONZE' ? "text-orange-500" : "text-gray-600")} />
                  </div>
                </div>
                <div className="space-y-1 text-[9px] text-text-dim leading-relaxed font-mono uppercase tracking-wider mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-orange-500 rounded-full" />
                    10% DISCOUNT ON SLOTS
                  </div>
                </div>
                <div className={cn(
                  "w-full py-2 text-center text-[9px] font-black uppercase tracking-[3px] transition-all",
                  membership === 'BRONZE' 
                    ? "bg-orange-500 text-black" 
                    : "bg-white/5 text-white group-hover:bg-orange-500/20"
                )}>
                  {membership === 'BRONZE' ? 'Plan Selected' : 'Choose Bronze'}
                </div>
              </button>

              {/* PLATINUM CARD */}
              <button 
                onClick={() => setMembership('PLATINUM')}
                className={cn(
                  "w-full text-left p-5 transition-all bg-[#0D150E] border border-white/5 relative overflow-hidden group",
                  membership === 'PLATINUM' 
                    ? "border-neo-green ring-1 ring-neo-green/30" 
                    : "hover:border-neo-green/50 opacity-80 hover:opacity-100"
                )}
              >
                {membership === 'PLATINUM' && (
                  <div className="absolute top-0 right-0 bg-neo-green text-black text-[8px] font-black px-3 py-1 uppercase tracking-tighter">
                    Active Plan
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-black uppercase text-neo-green tracking-[2px] mb-1">Platinum</div>
                    <div className="text-2xl font-black tracking-tight text-white flex items-baseline gap-1">
                      ₹4.5K <span className="text-[10px] font-medium text-text-dim uppercase tracking-widest">/mo</span>
                    </div>
                  </div>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                    membership === 'PLATINUM' ? "border-neo-green bg-neo-green/10" : "border-white/10 bg-white/5"
                  )}>
                    <Trophy className={cn("w-4 h-4", membership === 'PLATINUM' ? "text-neo-green" : "text-gray-600")} />
                  </div>
                </div>
                <div className="space-y-1 text-[9px] text-text-dim leading-relaxed font-mono uppercase tracking-wider mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-neo-green rounded-full" />
                    15 HOURS PER MONTH
                  </div>
                </div>
                <div className={cn(
                  "w-full py-2 text-center text-[9px] font-black uppercase tracking-[3px] transition-all",
                  membership === 'PLATINUM' 
                    ? "bg-neo-green text-black" 
                    : "bg-white/5 text-white group-hover:bg-neo-green/20"
                )}>
                  {membership === 'PLATINUM' ? 'Plan Selected' : 'Choose Platinum'}
                </div>
              </button>

              {/* GOLD CARD */}
              <button 
                onClick={() => setMembership('GOLD')}
                className={cn(
                  "w-full text-left p-5 transition-all bg-[#15150D] border border-white/5 relative overflow-hidden group",
                  membership === 'GOLD' 
                    ? "border-yellow-400 ring-1 ring-yellow-400/30" 
                    : "hover:border-yellow-400/50 opacity-80 hover:opacity-100"
                )}
              >
                {membership === 'GOLD' && (
                  <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[8px] font-black px-3 py-1 uppercase tracking-tighter">
                    Active Plan
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-black uppercase text-yellow-400 tracking-[2px] mb-1">Gold</div>
                    <div className="text-2xl font-black tracking-tight text-white flex items-baseline gap-1">
                      ₹7.5K <span className="text-[10px] font-medium text-text-dim uppercase tracking-widest">/mo</span>
                    </div>
                  </div>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                    membership === 'GOLD' ? "border-yellow-400 bg-yellow-400/10" : "border-white/10 bg-white/5"
                  )}>
                    <Trophy className={cn("w-4 h-4", membership === 'GOLD' ? "text-yellow-400" : "text-gray-600")} />
                  </div>
                </div>
                <div className="space-y-1 text-[9px] text-text-dim leading-relaxed font-mono uppercase tracking-wider mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-yellow-400 rounded-full" />
                    25 HOURS PER MONTH
                  </div>
                </div>
                <div className={cn(
                  "w-full py-2 text-center text-[9px] font-black uppercase tracking-[3px] transition-all",
                  membership === 'GOLD' 
                    ? "bg-yellow-400 text-black" 
                    : "bg-white/5 text-white group-hover:bg-yellow-400/20"
                )}>
                  {membership === 'GOLD' ? 'Plan Selected' : 'Choose Gold'}
                </div>
              </button>

              {/* DIAMOND CARD */}
              <button 
                onClick={() => setMembership('DIAMOND')}
                className={cn(
                  "w-full text-left p-5 transition-all bg-[#0A1118] border border-white/5 relative overflow-hidden group",
                  membership === 'DIAMOND' 
                    ? "border-[#00D1FF] ring-1 ring-[#00D1FF]/30" 
                    : "hover:border-[#00D1FF]/50 opacity-80 hover:opacity-100"
                )}
              >
                {membership === 'DIAMOND' && (
                  <div className="absolute top-0 right-0 bg-[#00D1FF] text-black text-[8px] font-black px-3 py-1 uppercase tracking-tighter">
                    Active Plan
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-black uppercase text-[#00D1FF] tracking-[2px] mb-1">Diamond</div>
                    <div className="text-2xl font-black tracking-tight text-white flex items-baseline gap-1">
                      ₹15K <span className="text-[10px] font-medium text-text-dim uppercase tracking-widest">/mo</span>
                    </div>
                  </div>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border transition-colors",
                    membership === 'DIAMOND' ? "border-[#00D1FF] bg-[#00D1FF]/10" : "border-white/10 bg-white/5"
                  )}>
                    <Trophy className={cn("w-4 h-4", membership === 'DIAMOND' ? "text-[#00D1FF]" : "text-gray-600")} />
                  </div>
                </div>
                <div className="space-y-1 text-[9px] text-text-dim leading-relaxed font-mono uppercase tracking-wider mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-[#00D1FF] rounded-full" />
                    UNLIMITED ACCESS (1HR/DAY)
                  </div>
                </div>
                <div className={cn(
                  "w-full py-2 text-center text-[9px] font-black uppercase tracking-[3px] transition-all",
                  membership === 'DIAMOND' 
                    ? "bg-[#00D1FF] text-black" 
                    : "bg-white/5 text-white group-hover:bg-[#00D1FF]/20"
                )}>
                  {membership === 'DIAMOND' ? 'Plan Selected' : 'Choose Diamond'}
                </div>
              </button>
              
              <button 
                onClick={() => setMembership('NONE')}
                className={cn(
                  "w-full text-[10px] uppercase tracking-[4px] text-center mt-2 py-2 text-text-dim hover:text-white transition-colors font-bold",
                  membership === 'NONE' && "text-neo-green"
                )}
              >
                {membership === 'NONE' ? '[ Guest Mode Active ]' : 'Return to Guest Mode'}
              </button>

              {/* REFERRAL CARD */}
              <div className="mt-8 p-6 bg-neo-green/5 border border-neo-green/20 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Tag className="w-12 h-12 text-neo-green rotate-12" />
                </div>
                <div className="relative z-10">
                  <div className="text-[10px] font-black tracking-[2px] uppercase text-neo-green mb-2">Refer & Earn</div>
                  <div className="text-xl font-black text-white mb-2 italic">Get Free Slots</div>
                  <p className="text-[10px] text-text-dim leading-relaxed mb-4 uppercase tracking-wider">
                    Refer friends and get ₹100 off combined with your membership perks.
                  </p>
                  <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-2 rounded-lg">
                    <span className="text-[11px] font-mono text-white flex-1 text-center font-bold tracking-widest">{userReferralCode || 'GENERATING...'}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(userReferralCode);
                        alert('Code copied!');
                      }}
                      className="text-[9px] font-black uppercase tracking-tighter text-neo-green hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="mt-4 flex justify-between items-center text-[9px] font-bold text-text-dim uppercase tracking-widest">
                    <span>Total Referrals</span>
                    <span className="text-neo-green">{referralsCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* My Bookings */}
          {myBookings.length > 0 && (
            <div className="p-8 border-b border-border-dim max-h-[300px] overflow-y-auto no-scrollbar">
              <div className="section-header">My Active Bookings</div>
              <div className="space-y-3">
                {myBookings.map(b => (
                  <div key={b.id} className="flex justify-between items-center bg-dark-bg p-3 border border-border-dim group hover:border-neo-green/30 transition-all">
                    <div>
                      <div className="text-[10px] text-neo-green font-bold uppercase tracking-widest leading-none mb-1">
                        {format(new Date(b.date + 'T00:00:00'), 'MMM dd, yyyy')}
                      </div>
                      <div className="text-sm font-bold leading-none italic uppercase">
                        {formatSlotDisplay(b.slot)}
                      </div>
                    </div>
                    <button 
                      onClick={() => setSlotToCancel(b)}
                      className="p-2 opacity-60 hover:opacity-100 text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/30"
                      title="Cancel Booking"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checkout Area */}
          <div className="flex-1 p-8 flex flex-col justify-between">
            <div>
              <div className="section-header">Booking Summary</div>
              
              {appError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest animate-shake">
                  {appError}
                </div>
              )}
              
              <div className="space-y-4 mb-2">
                <input 
                  type="text" 
                  placeholder="USER NAME"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-dark-bg border border-border-dim p-4 text-[10px] uppercase tracking-[2px] outline-none focus:border-neo-green transition-all"
                />
                <input 
                  type="tel" 
                  placeholder="PHONE NUMBER"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  className="w-full bg-dark-bg border border-border-dim p-4 text-[10px] uppercase tracking-[2px] outline-none focus:border-neo-green transition-all"
                />
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="REFERRAL CODE (OPTIONAL)"
                    value={appliedReferralCode}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setAppliedReferralCode(val);
                      validateReferral(val);
                    }}
                    className={cn(
                      "w-full bg-dark-bg border p-4 text-[10px] uppercase tracking-[2px] outline-none transition-all",
                      isReferralValid === true ? "border-neo-green" : isReferralValid === false ? "border-red-500" : "border-border-dim focus:border-neo-green"
                    )}
                  />
                  {isReferralValid === true && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-neo-green text-[9px] font-black tracking-widest uppercase">
                      Applied! -₹{REFERRAL_DISCOUNT}
                    </div>
                  )}
                  {isReferralValid === false && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 text-[9px] font-black tracking-widest uppercase">
                      Invalid Code
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 space-y-2">
                <div className="flex justify-between text-[13px] text-text-dim">
                  <span>Slot Pricing Details</span>
                  <span>₹{selectedSlots.reduce((sum, s) => sum + getSlotPrice(s), 0)}</span>
                </div>
                {membership !== 'NONE' && (
                  <div className="flex justify-between text-[13px] text-text-dim">
                    <span>Membership Disc.</span>
                    <span>
                      {membership === 'BRONZE' ? '-10%' : '-₹' + selectedSlots.reduce((sum, s) => sum + getSlotPrice(s), 0)}
                    </span>
                  </div>
                )}
                {isReferralValid && (
                  <div className="flex justify-between text-[13px] text-neo-green animate-pulse">
                    <span>Referral Discount</span>
                    <span>-₹{REFERRAL_DISCOUNT}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-border-dim pt-4 mt-4 text-2xl font-bold text-neo-green">
                  <span>TOTAL</span>
                  <span>₹{totalPrice}</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <button 
                disabled={isBooking || !userName || !userPhone || selectedSlots.length === 0}
                onClick={handleBooking}
                className={cn(
                  "w-full py-5 font-black uppercase tracking-[2px] text-sm transition-all duration-300",
                  isBooking || !userName || !userPhone || selectedSlots.length === 0
                    ? "bg-border-dim text-text-dim cursor-not-allowed"
                    : "bg-neo-green text-black hover:opacity-90 active:scale-[0.98]"
                )}
              >
                {isBooking ? "Processing..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </aside>
        </div>
        )}
      </main>

      {/* CANCEL MODAL */}
      <AnimatePresence>
        {slotToCancel && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg border border-border-dim p-8 max-w-sm w-full shadow-2xl shadow-black"
            >
              <h3 className="text-neo-green text-xl font-bold mb-4 uppercase tracking-widest">Cancel Booking?</h3>
              <p className="text-sm text-text-dim mb-8">
                Are you sure you want to cancel the booking for <span className="text-white font-bold">{slotToCancel.slot}</span> on {format(selectedDate, 'MMM do')}?
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={handleCancelBooking} 
                  className="flex-1 bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white transition-all py-3 font-bold uppercase tracking-widest text-[10px]"
                >
                  Yes, Cancel
                </button>
                <button 
                  onClick={() => setSlotToCancel(null)} 
                  className="flex-1 border border-border-dim text-white hover:border-text-dim transition-all py-3 font-bold uppercase tracking-widest text-[10px]"
                >
                  Keep Slot
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* PROFILE MODAL */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-card-bg border border-white/10 p-8 max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setShowProfileModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-text-dim" />
              </button>

              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-full bg-neo-green/10 border border-neo-green flex items-center justify-center mx-auto mb-4">
                  <User className="w-10 h-10 text-neo-green" />
                </div>
                <h3 className="text-white text-xl font-black uppercase tracking-widest">{userName || 'Member'}</h3>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className={cn(
                    "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border",
                    membership === 'BRONZE' && "bg-orange-500/10 text-orange-500 border-orange-500/20",
                    membership === 'PLATINUM' && "bg-neo-green/10 text-neo-green border-neo-green/20",
                    membership === 'GOLD' && "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
                    membership === 'DIAMOND' && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                    membership === 'NONE' && "bg-white/5 text-text-dim border-white/10"
                  )}>
                    {membership} PLAN
                  </span>
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <div className="bg-dark-bg p-4 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white/5 rounded-lg">
                      <Mail className="w-4 h-4 text-neo-green" />
                    </div>
                    <div>
                      <div className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-0.5">Email Address</div>
                      <div className="text-sm font-medium text-white">{authUser?.email}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-bg p-4 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white/5 rounded-lg">
                      <Phone className="w-4 h-4 text-neo-green" />
                    </div>
                    <div>
                      <div className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-0.5">Phone Number</div>
                      <div className="text-sm font-medium text-white">{userPhone || 'Not provided'}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-bg p-4 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white/5 rounded-lg">
                      <Tag className="w-4 h-4 text-neo-green" />
                    </div>
                    <div>
                      <div className="text-[10px] text-text-dim uppercase tracking-widest font-bold mb-0.5">Referral Code</div>
                      <div className="text-sm font-mono font-bold text-white tracking-widest">{userReferralCode}</div>
                      <div className="text-[9px] text-text-dim uppercase mt-1">Total Referrals: {referralsCount}</div>
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => { setShowProfileModal(false); setShowMenu(true); }}
                className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all py-4 font-black uppercase tracking-widest text-[11px] mb-3"
              >
                Manage Membership
              </button>

              <button 
                onClick={handleLogout} 
                className="w-full bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all py-4 font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPostModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0A0F0B] border border-white/10 w-full max-w-xl rounded-[40px] p-8 sm:p-12 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] -mr-10 -mt-10">
                 <Globe className="w-40 h-40 text-neo-green" />
              </div>

              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <h3 className="text-3xl font-black text-neo-green uppercase tracking-[4px]">POST A GAME</h3>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Recruit teammates from the Georgopol Collective.</p>
                </div>
                <button onClick={() => setShowPostModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="space-y-6 relative z-10">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Sport</label>
                    <select name="sport" required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-neo-green transition-all outline-none appearance-none">
                      <option value="FOOTBALL">Football</option>
                      <option value="CRICKET">Cricket</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Players Needed</label>
                    <input type="number" name="players" min="1" max="20" required defaultValue="1" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-neo-green transition-all outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Date</label>
                    <input type="date" name="date" required defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-neo-green transition-all outline-none invert dark:invert-0" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Time</label>
                    <select name="time" required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-neo-green transition-all outline-none appearance-none">
                      {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Short Description</label>
                  <textarea name="description" placeholder="e.g. Need a striker for 7v7 match. Skill level: Intermediate." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-neo-green transition-all outline-none h-24 resize-none" />
                </div>

                <div className="pt-4 flex gap-4">
                   <button 
                     type="button"
                     onClick={() => setShowPostModal(false)}
                     className="flex-1 bg-white/5 border border-white/10 py-4 rounded-2xl font-black uppercase tracking-[2px] text-xs hover:bg-white/10 transition-all"
                   >
                     Cancel
                   </button>
                   <button 
                     type="submit"
                     className="flex-[2] bg-neo-green text-black py-4 rounded-2xl font-black uppercase tracking-[2px] text-xs hover:scale-[1.02] transition-all shadow-[0_0_30px_rgba(194,255,0,0.2)]"
                   >
                     Announce Game
                   </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg border border-neo-green p-10 max-w-sm w-full shadow-2xl shadow-neo-green/20 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-neo-green/10 border border-neo-green flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-neo-green" />
              </div>
              <h3 className="text-neo-green text-2xl font-black mb-2 uppercase tracking-[2px]">Booking Complete</h3>
              <p className="text-[12px] uppercase tracking-widest text-text-dim mb-8">
                Your slots have been successfully reserved!
              </p>
              <button 
                onClick={() => setShowSuccess(false)} 
                className="w-full bg-neo-green text-black hover:opacity-90 transition-all py-4 font-black uppercase tracking-widest text-[11px]"
              >
                Close Window
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVIGATION MENU SIDEBAR */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
              className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 z-[70] w-full max-w-[300px] bg-[#0A0F0B] border-r border-white/10 p-8 flex flex-col gap-10"
            >
              <div className="flex justify-between items-center">
                <div className="w-12 h-12 bg-neo-green clip-hexagon flex items-center justify-center">
                  <span className="text-black text-2xl font-black italic -ml-0.5">G</span>
                </div>
                <button onClick={() => setShowMenu(false)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => { setCurrentTab('booking'); setShowMenu(false); setCurrentView('app'); }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase tracking-widest text-sm",
                    currentTab === 'booking' && currentView === 'app' ? "bg-neo-green text-black" : "hover:bg-white/5 text-gray-400 hover:text-white"
                  )}
                >
                  <Calendar className="w-5 h-5" />
                  <span>Book Turf</span>
                </button>
                <button 
                  onClick={() => { setCurrentTab('events'); setShowMenu(false); setCurrentView('app'); }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase tracking-widest text-sm",
                    currentTab === 'events' && currentView === 'app' ? "bg-neo-green text-black" : "hover:bg-white/5 text-gray-400 hover:text-white"
                  )}
                >
                  <Trophy className="w-5 h-5" />
                  <span>Tournaments</span>
                </button>
                <button 
                  onClick={() => { setCurrentTab('community'); setShowMenu(false); setCurrentView('app'); }}
                  className={cn(
                    "flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase tracking-widest text-sm",
                    currentTab === 'community' && currentView === 'app' ? "bg-neo-green text-black" : "hover:bg-white/5 text-gray-400 hover:text-white"
                  )}
                >
                  <Users className="w-5 h-5" />
                  <span>Community</span>
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => { setCurrentView('admin'); setShowMenu(false); }}
                    className={cn(
                      "flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase tracking-widest text-sm",
                      currentView === 'admin' ? "bg-neo-green text-black" : "hover:bg-white/5 text-gray-400 hover:text-white"
                    )}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>Admin Portal</span>
                  </button>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-6">
                <div className="border-t border-white/10 pt-8 flex flex-col gap-4">
                  <div className="flex items-center gap-3 text-xs tracking-widest text-gray-500 font-mono uppercase">
                    <Phone className="w-4 h-4 text-neo-green" />
                    <span>Support Lines</span>
                  </div>
                  <div className="flex flex-col gap-1 text-sm font-bold tracking-widest">
                    <div className="flex justify-between"><span>IBRAHIM</span><span className="text-neo-green">9881478630</span></div>
                    <div className="flex justify-between"><span>SUFIYAN</span><span className="text-neo-green">8856048431</span></div>
                  </div>
                </div>

                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase tracking-widest text-sm text-red-500 hover:bg-red-500/10 transition"
                >
                  <LogOut className="w-5 h-5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MembershipType = 'NONE' | 'BRONZE' | 'PLATINUM' | 'GOLD' | 'DIAMOND';

export interface TimeSlot {
  id: string; // "YYYY-MM-DD-HH"
  startTime: string; // "HH:00"
  endTime: string; // "HH:00"
  date: string; // "YYYY-MM-DD"
  isBooked: boolean;
  bookedBy?: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  phone: string;
  email: string;
  membership: MembershipType;
  referralCode?: string;
  referralsCount?: number;
  hasUsedReferral?: boolean;
  createdAt: string;
}

export interface BookingRequest {
  date: string;
  slots: string[]; // array of starting hours like ["06:00", "07:00"]
  userName: string;
  userPhone: string;
  membership: MembershipType;
}

export interface MembershipPlan {
  id: MembershipType;
  name: string;
  price: number;
  benefits: string[];
  limitations: string[];
}

export const MEMBERSHIP_PLANS: Record<MembershipType, MembershipPlan> = {
  NONE: {
    id: 'NONE',
    name: 'Guest',
    price: 0,
    benefits: ['Standard hourly rates'],
    limitations: []
  },
  BRONZE: {
    id: 'BRONZE',
    name: 'Bronze',
    price: 1000,
    benefits: ['10% Discount on all bookings', 'Access to community events'],
    limitations: ['Standard booking priority']
  },
  PLATINUM: {
    id: 'PLATINUM',
    name: 'Platinum',
    price: 4500,
    benefits: ['15 Hours per month', 'Free weekend access (1hr)', '₹300/hour equivalent'],
    limitations: ['Max 2 hours/day']
  },
  GOLD: {
    id: 'GOLD',
    name: 'Gold',
    price: 7500,
    benefits: ['25 Hours per month', 'Dedicated locker access', 'Priority booking (24h early)'],
    limitations: ['Max 3 hours/day']
  },
  DIAMOND: {
    id: 'DIAMOND',
    name: 'Diamond',
    price: 15000,
    benefits: ['Unlimited daily booking (1hr guaranteed)', 'VIP lounge access', 'Personal equipment storage'],
    limitations: []
  }
};

export const BASE_HOURLY_RATE = 1000;
export const REFERRAL_DISCOUNT = 100; // Flat discount for referee

export interface TimeBasedPricing {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  price: number;
}

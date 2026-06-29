import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-06-24.dahlia" })
  : null;

export type PlanId = "free" | "pro" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  currency: string;
  interval: "month";
  features: string[];
  limits: {
    aiInsightsPerDay: number;
    watchlistSize: number;
    exportPerMonth: number;
    apiAccess: boolean;
  };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "PLN",
    interval: "month",
    features: [
      "Company search & profiles",
      "Financial data & charts",
      "Relationship graph",
      "Grant data",
    ],
    limits: {
      aiInsightsPerDay: 3,
      watchlistSize: 5,
      exportPerMonth: 0,
      apiAccess: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 99,
    currency: "PLN",
    interval: "month",
    features: [
      "Everything in Free",
      "Unlimited AI insights",
      "Watchlist (50 companies)",
      "CSV/PDF exports",
      "Priority data updates",
    ],
    limits: {
      aiInsightsPerDay: -1,
      watchlistSize: 50,
      exportPerMonth: 100,
      apiAccess: false,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    currency: "PLN",
    interval: "month",
    features: [
      "Everything in Pro",
      "API access",
      "Unlimited watchlist",
      "Unlimited exports",
      "Bulk data access",
      "Dedicated support",
    ],
    limits: {
      aiInsightsPerDay: -1,
      watchlistSize: -1,
      exportPerMonth: -1,
      apiAccess: true,
    },
  },
};

export function getPlanByPriceId(priceId: string): PlanId {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return "enterprise";
  return "free";
}

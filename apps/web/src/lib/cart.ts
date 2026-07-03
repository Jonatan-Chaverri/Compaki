// Cart persistence: one `compaki_cart` cookie holding every marketplace's
// cart, keyed by slug ({ [slug]: { [productId]: quantity } }). The cart lives
// only in this cookie — nothing touches the database until the buyer proceeds
// to payment and a pending order is created. Client-side only (the cookie is
// intentionally not httpOnly so the browser owns it).

export type CartMap = Record<string, number>;
type AllCarts = Record<string, CartMap>;

const CART_COOKIE = "compaki_cart";
const CART_MAX_AGE = 60 * 60 * 24 * 30;

function readAllCarts(): AllCarts {
  if (typeof document === "undefined") return {};
  const entry = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CART_COOKIE}=`));
  if (!entry) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(entry.slice(CART_COOKIE.length + 1)));
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as AllCarts;
  } catch {
    return {};
  }
}

/** Sanitized cart for one marketplace: positive integer quantities only. */
export function readCart(slug: string): CartMap {
  const raw = readAllCarts()[slug];
  if (typeof raw !== "object" || raw === null) return {};
  const cart: CartMap = {};
  for (const [productId, quantity] of Object.entries(raw)) {
    if (Number.isInteger(quantity) && quantity > 0) cart[productId] = quantity;
  }
  return cart;
}

export function writeCart(slug: string, cart: CartMap): void {
  if (typeof document === "undefined") return;
  const all = readAllCarts();
  if (Object.keys(cart).length === 0) {
    delete all[slug];
  } else {
    all[slug] = cart;
  }
  document.cookie = `${CART_COOKIE}=${encodeURIComponent(JSON.stringify(all))}; Path=/; Max-Age=${CART_MAX_AGE}; SameSite=Lax`;
  snapshotCache = null;
  for (const listener of listeners) listener();
}

// ── useSyncExternalStore adapter ─────────────────────────────────────────────
// The cookie is the source of truth; components subscribe to writes. The
// snapshot is cached so repeated reads return a stable reference.

const EMPTY_CART: CartMap = {};
const listeners = new Set<() => void>();
let snapshotCache: { slug: string; cart: CartMap } | null = null;

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCartSnapshot(slug: string): CartMap {
  if (!snapshotCache || snapshotCache.slug !== slug) {
    snapshotCache = { slug, cart: readCart(slug) };
  }
  return snapshotCache.cart;
}

/** SSR/hydration snapshot: the cookie is unknown until the client mounts. */
export function getServerCartSnapshot(): CartMap {
  return EMPTY_CART;
}

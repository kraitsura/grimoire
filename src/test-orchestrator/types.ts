// Shared types for test-orchestrator module

/**
 * Represents a user in the system.
 * Contains essential user information for identification and tracking.
 *
 * @property id - Unique identifier for the user
 * @property name - The user's display name
 * @property email - The user's email address for contact and authentication
 * @property createdAt - Timestamp indicating when the user account was created
 */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/**
 * Represents a product available for purchase.
 * Contains product details including pricing and stock information.
 *
 * @property id - Unique identifier for the product
 * @property name - The product's display name
 * @property price - The product's price in the default currency
 * @property inventory - The current stock quantity available for purchase
 */
export interface Product {
  id: string;
  name: string;
  price: number;
  inventory: number;
}

/**
 * Represents a single line item within an order.
 * Links a product to its quantity and price at the time of purchase.
 *
 * @property productId - Reference to the product being ordered
 * @property quantity - Number of units of the product in this line item
 * @property unitPrice - Price per unit at the time the order was placed
 */
export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Represents a customer order containing one or more items.
 * Tracks the order lifecycle from creation through delivery.
 *
 * @property id - Unique identifier for the order
 * @property userId - Reference to the user who placed the order
 * @property items - Array of order items included in this order
 * @property status - Current status of the order in the fulfillment pipeline
 * @property createdAt - Timestamp indicating when the order was placed
 */
export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: "pending" | "confirmed" | "shipped" | "delivered";
  createdAt: Date;
}

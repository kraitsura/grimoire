// Shared types for test-orchestrator module

/**
 * @description Represents a user in the system with authentication and profile information.
 */
export interface User {
  /**
   * @property {string} id - Unique identifier for the user.
   */
  id: string;

  /**
   * @property {string} email - User's email address used for authentication and communication.
   */
  email: string;

  /**
   * @property {string} name - User's display name.
   */
  name: string;

  /**
   * @property {Date} createdAt - Timestamp when the user account was created.
   */
  createdAt: Date;
}

/**
 * @description Represents a product available in the catalog.
 */
export interface Product {
  /**
   * @property {string} id - Unique identifier for the product.
   */
  id: string;

  /**
   * @property {string} name - Display name of the product.
   */
  name: string;

  /**
   * @property {number} price - Price of the product in the base currency unit.
   */
  price: number;

  /**
   * @property {string} description - Detailed description of the product.
   */
  description: string;

  /**
   * @property {boolean} inStock - Indicates whether the product is currently available for purchase.
   */
  inStock: boolean;
}

/**
 * @description Represents a single item within an order, linking a product to its quantity and price.
 */
export interface OrderItem {
  /**
   * @property {string} productId - Reference to the product being ordered.
   */
  productId: string;

  /**
   * @property {number} quantity - Number of units of the product in this order item.
   */
  quantity: number;

  /**
   * @property {number} unitPrice - Price per unit at the time of order (may differ from current product price).
   */
  unitPrice: number;
}

/**
 * @description Represents a customer order containing one or more order items.
 */
export interface Order {
  /**
   * @property {string} id - Unique identifier for the order.
   */
  id: string;

  /**
   * @property {string} userId - Reference to the user who placed the order.
   */
  userId: string;

  /**
   * @property {OrderItem[]} items - Collection of items included in this order.
   */
  items: OrderItem[];

  /**
   * @property {("pending" | "confirmed" | "shipped" | "delivered")} status - Current fulfillment status of the order.
   */
  status: "pending" | "confirmed" | "shipped" | "delivered";

  /**
   * @property {Date} createdAt - Timestamp when the order was placed.
   */
  createdAt: Date;
}

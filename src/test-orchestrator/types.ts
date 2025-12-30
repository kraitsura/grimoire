// Shared types for test orchestrator

/**
 * Represents a user in the system.
 *
 * Users are the primary actors who can create orders and interact with products.
 * Each user has a unique identifier and contact information.
 */
export interface User {
  /**
   * Unique identifier for the user.
   *
   * @example "usr_1234567890"
   */
  id: string;

  /**
   * Display name of the user.
   *
   * @example "John Doe"
   */
  name: string;

  /**
   * Email address of the user.
   *
   * Must be a valid email format.
   * @example "john.doe@example.com"
   */
  email: string;

  /**
   * Timestamp when the user account was created.
   *
   * @example new Date("2024-01-15T10:30:00Z")
   */
  createdAt: Date;
}

/**
 * Represents a product available for purchase.
 *
 * Products have pricing information and inventory tracking.
 * Stock levels are managed when orders are placed.
 */
export interface Product {
  /**
   * Unique identifier for the product.
   *
   * @example "prod_9876543210"
   */
  id: string;

  /**
   * Name or title of the product.
   *
   * @example "Wireless Headphones"
   */
  name: string;

  /**
   * Price of the product in the base currency unit.
   *
   * Should be a positive number representing the cost per unit.
   * @example 99.99
   */
  price: number;

  /**
   * Available inventory quantity.
   *
   * Represents the number of units currently in stock.
   * Must be a non-negative integer.
   * @example 150
   */
  stock: number;
}

/**
 * Represents a customer order containing one or more products.
 *
 * Orders track which user placed the order, what products were purchased,
 * the total cost, and when the order was created. The total should match
 * the sum of (product price × quantity) for all items.
 */
export interface Order {
  /**
   * Unique identifier for the order.
   *
   * @example "ord_5551234567"
   */
  id: string;

  /**
   * Reference to the user who placed this order.
   *
   * Should correspond to a valid User.id.
   * @example "usr_1234567890"
   */
  userId: string;

  /**
   * List of products included in this order.
   *
   * Each item specifies a product ID and the quantity ordered.
   * The array should not be empty for valid orders.
   * @example [{ productId: "prod_123", quantity: 2 }, { productId: "prod_456", quantity: 1 }]
   */
  products: Array<{ productId: string; quantity: number }>;

  /**
   * Total cost of the order.
   *
   * Should be calculated as the sum of (product.price × quantity) for all items.
   * Represented in the base currency unit.
   * @example 299.97
   */
  total: number;

  /**
   * Timestamp when the order was created.
   *
   * @example new Date("2024-01-20T14:45:00Z")
   */
  createdAt: Date;
}

/**
 * Represents a single line item within an order.
 *
 * This interface is used to describe individual products and their quantities
 * when constructing or processing orders. It's a lightweight structure that
 * pairs a product reference with a quantity.
 */
export interface OrderItem {
  /**
   * Reference to the product being ordered.
   *
   * Should correspond to a valid Product.id.
   * @example "prod_9876543210"
   */
  productId: string;

  /**
   * Number of units being ordered.
   *
   * Must be a positive integer.
   * @example 3
   */
  quantity: number;
}

import type { Order, User, Product, OrderItem } from "./types";

export class OrderService {
  private orders: Map<string, Order> = new Map();
  private products: Map<string, Product> = new Map();

  constructor(products: Product[] = []) {
    products.forEach((product) => {
      this.products.set(product.id, product);
    });
  }

  /**
   * Create a new order for a user
   */
  createOrder(
    userId: string,
    items: OrderItem[]
  ): Order {
    const orderId = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Calculate total
    const total = this.calculateTotal(items);

    const order: Order = {
      id: orderId,
      userId,
      products: items,
      total,
      createdAt: new Date(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  /**
   * Get all orders for a specific user
   */
  getOrdersByUser(userId: string): Order[] {
    return Array.from(this.orders.values()).filter(
      (order) => order.userId === userId
    );
  }

  /**
   * Calculate total price for a set of order items
   */
  calculateTotal(items: OrderItem[]): number {
    return items.reduce((total, item) => {
      const product = this.products.get(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      return total + product.price * item.quantity;
    }, 0);
  }

  /**
   * Get order by ID
   */
  getOrderById(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Add a product to the catalog
   */
  addProduct(product: Product): void {
    this.products.set(product.id, product);
  }
}

// Order service implementation
import type { Order, User, Product, OrderItem } from "./types";

export class OrderService {
  private orders: Map<string, Order> = new Map();

  /**
   * Create a new order
   */
  createOrder(
    userId: string,
    items: OrderItem[],
    status: Order["status"] = "pending"
  ): Order {
    const order: Order = {
      id: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      items,
      status,
      createdAt: new Date(),
    };

    this.orders.set(order.id, order);
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
   * Calculate total price for an order
   */
  calculateTotal(orderId: string): number {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    return order.items.reduce((total, item) => {
      return total + item.unitPrice * item.quantity;
    }, 0);
  }

  /**
   * Update the status of an order
   */
  updateOrderStatus(
    orderId: string,
    status: Order["status"]
  ): Order {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    order.status = status;
    this.orders.set(orderId, order);
    return order;
  }
}

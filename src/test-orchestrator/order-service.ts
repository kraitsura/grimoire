// OrderService - manages orders with in-memory storage

import type { Order, User, Product, OrderItem } from "./types";

export class OrderService {
  private orders: Map<string, Order> = new Map();
  private nextId = 1;

  createOrder(userId: string, items: OrderItem[]): Order {
    const id = `order-${this.nextId++}`;
    const order: Order = {
      id,
      userId,
      items,
      status: "pending",
      createdAt: new Date(),
    };
    this.orders.set(id, order);
    return order;
  }

  getOrdersByUser(userId: string): Order[] {
    return Array.from(this.orders.values()).filter(
      (order) => order.userId === userId
    );
  }

  calculateTotal(order: Order): number {
    return order.items.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0
    );
  }
}
